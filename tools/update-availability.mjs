#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOMS = ["喵A", "喵B"];
const BLOCKING_STATUSES = new Set(["blocked", "confirmed", "hold", "manual", "paid", "tujia"]);
const NON_BLOCKING_STATUSES = new Set(["cancelled", "free", "pending", "rejected", "request"]);
const DEFAULT_BLOCKOUTS = "data/blockouts.csv";
const DEFAULT_SOURCES = "private/calendar-sources.json";
const DEFAULT_OUTPUT = "data/availability.json";

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const trimmed = token.slice(2);
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex >= 0) {
      args[trimmed.slice(0, equalIndex)] = trimmed.slice(equalIndex + 1);
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[trimmed] = next;
      index += 1;
    } else {
      args[trimmed] = true;
    }
  }
  return args;
}

function assertDateValue(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    throw new Error(`${label} 必须是 YYYY-MM-DD，例如 2026-10-01`);
  }
}

function parseDate(value) {
  assertDateValue(value, "日期");
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function diffDays(start, end) {
  return Math.round((end - start) / 86400000);
}

function todayInShanghai() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeRoom(room) {
  if (["all", "全部", "都可以"].includes(room)) return "all";
  if (!ROOMS.includes(room)) {
    throw new Error(`未知房型：${room}。可选：${ROOMS.join("、")}、all`);
  }
  return room;
}

function normalizeStatus(status = "confirmed") {
  return String(status).trim().toLowerCase();
}

function isBlockingStatus(status) {
  const normalized = normalizeStatus(status);
  if (NON_BLOCKING_STATUSES.has(normalized)) return false;
  return BLOCKING_STATUSES.has(normalized);
}

function eachNight(checkin, checkout) {
  const start = parseDate(checkin);
  const end = parseDate(checkout);
  const count = diffDays(start, end);
  if (count <= 0) throw new Error(`离店日期必须晚于入住日期：${checkin} -> ${checkout}`);

  const nights = [];
  for (let index = 0; index < count; index += 1) {
    nights.push(formatDate(addDays(start, index)));
  }
  return nights;
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (character === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseCsv(text) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (rows.length === 0) return [];

  const headers = splitCsvLine(rows[0]);
  return rows.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    const row = Object.fromEntries(headers.map((header, column) => [header, cells[column] || ""]));
    row.__line = index + 2;
    return row;
  });
}

function csvValue(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

async function readCsvRows(filePath) {
  if (!existsSync(filePath)) return [];
  return parseCsv(await readFile(filePath, "utf8"));
}

async function readJsonFile(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(await readFile(filePath, "utf8"));
}

function withoutGeneratedAt(availability) {
  if (!availability) return null;
  const { generatedAt, ...publicData } = availability;
  return publicData;
}

function keepStableGeneratedAt(nextAvailability, previousAvailability) {
  if (
    previousAvailability?.generatedAt &&
    JSON.stringify(withoutGeneratedAt(nextAvailability)) === JSON.stringify(withoutGeneratedAt(previousAvailability))
  ) {
    return {
      ...nextAvailability,
      generatedAt: previousAvailability.generatedAt,
    };
  }
  return nextAvailability;
}

function normalizeBlockout(row, fallback = {}) {
  const room = normalizeRoom(row.room || fallback.room);
  const source = String(row.source || fallback.source || "manual").trim() || "manual";
  const status = normalizeStatus(row.status || fallback.status || "confirmed");
  const checkin = row.checkin || fallback.checkin;
  const checkout = row.checkout || fallback.checkout;
  assertDateValue(checkin, "checkin");
  assertDateValue(checkout, "checkout");
  eachNight(checkin, checkout);

  return {
    room,
    source,
    status,
    checkin,
    checkout,
    note: row.note || fallback.note || "",
  };
}

function parseIcsDate(value) {
  const match = String(value).match(/(\d{4})(\d{2})(\d{2})/);
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function unfoldIcs(text) {
  return text.replace(/\r?\n[ \t]/g, "");
}

function parseIcs(text, fallback) {
  const lines = unfoldIcs(text).split(/\r?\n/);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current?.DTSTART) {
        const checkin = parseIcsDate(current.DTSTART);
        const checkout = parseIcsDate(current.DTEND) || formatDate(addDays(parseDate(checkin), 1));
        events.push(
          normalizeBlockout(
            {
              room: fallback.room,
              source: fallback.source || "ics",
              status: fallback.status || "confirmed",
              checkin,
              checkout,
              note: current.SUMMARY || "",
            },
            fallback,
          ),
        );
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) continue;
    const rawKey = line.slice(0, separatorIndex).split(";")[0];
    current[rawKey] = line.slice(separatorIndex + 1);
  }

  return events;
}

async function loadCalendarSources(filePath) {
  if (!existsSync(filePath)) return [];
  const config = JSON.parse(await readFile(filePath, "utf8"));
  return Array.isArray(config.sources) ? config.sources : [];
}

async function loadCalendarBlockouts(filePath) {
  const sources = await loadCalendarSources(filePath);
  const blockouts = [];

  for (const source of sources) {
    const room = normalizeRoom(source.room);
    let content = "";
    if (source.url) {
      const response = await fetch(source.url);
      if (!response.ok) throw new Error(`日历拉取失败：${source.url} (${response.status})`);
      content = await response.text();
    } else if (source.file) {
      content = await readFile(source.file, "utf8");
    } else {
      continue;
    }

    blockouts.push(...parseIcs(content, { ...source, room }));
  }

  return blockouts;
}

function compactRanges(nights) {
  const sorted = [...new Set(nights)].sort();
  const ranges = [];
  let start = "";
  let previous = "";

  for (const night of sorted) {
    if (!start) {
      start = night;
      previous = night;
      continue;
    }

    const expected = formatDate(addDays(parseDate(previous), 1));
    if (night === expected) {
      previous = night;
      continue;
    }

    ranges.push({ checkin: start, checkout: formatDate(addDays(parseDate(previous), 1)) });
    start = night;
    previous = night;
  }

  if (start) ranges.push({ checkin: start, checkout: formatDate(addDays(parseDate(previous), 1)) });
  return ranges;
}

function buildAvailability(blockouts, options) {
  const validFrom = options.from || todayInShanghai();
  const validTo = formatDate(addDays(parseDate(validFrom), Number(options.days || 240)));
  const roomData = Object.fromEntries(
    ROOMS.map((room) => [
      room,
      {
        blockedNights: [],
        blockedRanges: [],
      },
    ]),
  );

  for (const blockout of blockouts) {
    if (!isBlockingStatus(blockout.status)) continue;

    const targetRooms = blockout.room === "all" ? ROOMS : [blockout.room];
    const nights = eachNight(blockout.checkin, blockout.checkout).filter((night) => night >= validFrom && night < validTo);
    if (nights.length === 0) continue;

    for (const room of targetRooms) {
      roomData[room].blockedNights.push(...nights);
      roomData[room].blockedRanges.push({
        checkin: blockout.checkin,
        checkout: blockout.checkout,
        source: blockout.source,
        status: blockout.status,
      });
    }
  }

  for (const room of ROOMS) {
    roomData[room].blockedNights = [...new Set(roomData[room].blockedNights)].sort();
    roomData[room].blockedRanges = compactRanges(roomData[room].blockedNights).map((range) => ({
      ...range,
      status: "blocked",
    }));
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    timezone: "Asia/Shanghai",
    validFrom,
    validTo,
    rooms: ROOMS,
    policy: {
      payment: "客人提交入住申请后，房东确认日期可住，再通过邮箱或微信发送支付宝/微信支付二维码。",
      cancellation: "入住日前3天及以前可免费取消；不足3天取消，扣除订单金额50%。",
      finalConfirmation: "房态以房东最终确认和途家等平台实时订单为准。",
    },
    roomsAvailability: roomData,
  };
}

async function generate(options = {}) {
  const blockoutsPath = options.blockouts || DEFAULT_BLOCKOUTS;
  const sourcesPath = options.sources || DEFAULT_SOURCES;
  const outputPath = options.out || DEFAULT_OUTPUT;
  const manualRows = (await readCsvRows(blockoutsPath)).map((row) => normalizeBlockout(row));
  const calendarRows = await loadCalendarBlockouts(sourcesPath);
  const previousAvailability = await readJsonFile(outputPath);
  const availability = keepStableGeneratedAt(buildAvailability([...manualRows, ...calendarRows], options), previousAvailability);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(availability, null, 2)}\n`, "utf8");
  return availability;
}

async function addBlockout(args) {
  const blockoutsPath = args.blockouts || DEFAULT_BLOCKOUTS;
  const row = normalizeBlockout({
    room: args.room,
    source: args.source || "manual",
    status: args.status || "confirmed",
    checkin: args.checkin,
    checkout: args.checkout,
    note: args.note || "",
  });
  await mkdir(path.dirname(blockoutsPath), { recursive: true });

  if (!existsSync(blockoutsPath)) {
    await writeFile(blockoutsPath, "room,source,status,checkin,checkout,note\n", "utf8");
  }

  const line = ["room", "source", "status", "checkin", "checkout", "note"].map((key) => csvValue(row[key])).join(",");
  const current = await readFile(blockoutsPath, "utf8");
  await writeFile(blockoutsPath, `${current.trimEnd()}\n${line}\n`, "utf8");
  return generate(args);
}

function printHelp() {
  console.log(`房态脚本

用法：
  node tools/update-availability.mjs
  node tools/update-availability.mjs add --room 喵A --source tujia --checkin 2026-10-01 --checkout 2026-10-04 --note 国庆途家订单
  node tools/update-availability.mjs list

状态说明：
  会锁房：blocked, confirmed, hold, manual, paid, tujia
  不锁房：cancelled, free, pending, rejected, request

注意：
  不要把客人电话、邮箱、身份证、支付信息写入公开仓库。
  data/availability.json 会发布到网站，只包含公开房态。`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || "build";

  if (command === "help" || args.help) {
    printHelp();
    return;
  }

  if (command === "add") {
    const availability = await addBlockout(args);
    console.log(`已添加锁房并生成 ${args.out || DEFAULT_OUTPUT}，更新时间：${availability.generatedAt}`);
    return;
  }

  if (command === "list") {
    const manualRows = (await readCsvRows(args.blockouts || DEFAULT_BLOCKOUTS)).map((row) => normalizeBlockout(row));
    const calendarRows = await loadCalendarBlockouts(args.sources || DEFAULT_SOURCES);
    const rows = [...manualRows, ...calendarRows].filter((row) => isBlockingStatus(row.status));
    if (rows.length === 0) {
      console.log("暂无锁房记录。");
      return;
    }
    for (const row of rows) {
      console.log(`${row.room} ${row.checkin} -> ${row.checkout} ${row.source}/${row.status} ${row.note || ""}`.trim());
    }
    return;
  }

  const availability = await generate(args);
  console.log(`已生成 ${args.out || DEFAULT_OUTPUT}，更新时间：${availability.generatedAt}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
