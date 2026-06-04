const RATES = {
  normal: 140,
  holiday: 420,
};

const RATE_LABELS = {
  normal: "平日价",
  holiday: "节假日价",
};

const form = document.querySelector("#bookingForm");
const checkinInput = document.querySelector("#checkin");
const checkoutInput = document.querySelector("#checkout");
const guestsInput = document.querySelector("#guests");
const roomInputs = [...document.querySelectorAll('input[name="room"]')];
const estimateTotal = document.querySelector("#estimateTotal");
const estimateMeta = document.querySelector("#estimateMeta");
const availabilityStatus = document.querySelector("#availabilityStatus");
const submitButton = document.querySelector(".submit-button");
const header = document.querySelector("[data-header]");
const dialog = document.querySelector("#requestDialog");
const requestSummary = document.querySelector("#requestSummary");
const mapDialog = document.querySelector("#mapDialog");
const mapAddress = "重庆市渝中区化龙桥翡翠云阶 4 栋 C 座";
const ROOM_CHOICES = ["喵A", "喵B"];

let availabilityData = null;
let availabilityLoadFailed = false;

function toDateValue(date) {
  return date.toISOString().slice(0, 10);
}

function parseDateValue(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getNightCount() {
  const start = new Date(checkinInput.value);
  const end = new Date(checkoutInput.value);
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return Number.isFinite(diff) && diff > 0 ? diff : 1;
}

function getRateType() {
  return form.querySelector('input[name="rateType"]:checked')?.value || "normal";
}

function getRoomChoice() {
  return form.querySelector('input[name="room"]:checked')?.value || "都可以";
}

function setRoomChoice(room) {
  const input = roomInputs.find((item) => item.value === room);
  if (input) input.checked = true;
  syncRoomCards();
}

function syncRoomCards() {
  const selectedRoom = getRoomChoice();
  document.querySelectorAll("[data-room-choice]").forEach((link) => {
    link.closest(".room-card")?.classList.toggle("is-selected", link.dataset.roomChoice === selectedRoom);
  });
}

function updateEstimate() {
  const nights = getNightCount();
  const rateType = getRateType();
  const total = nights * RATES[rateType];
  estimateTotal.textContent = `¥${total}`;
  estimateMeta.textContent = `${nights}晚 · ${RATE_LABELS[rateType]}`;
}

function setDefaultDates() {
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const dayAfter = addDays(today, 3);
  checkinInput.value = toDateValue(tomorrow);
  checkoutInput.value = toDateValue(dayAfter);
  checkinInput.min = toDateValue(today);
  checkoutInput.min = toDateValue(addDays(today, 1));
}

function syncCheckoutMinimum() {
  if (!checkinInput.value) return;
  const nextDay = toDateValue(addDays(new Date(checkinInput.value), 1));
  checkoutInput.min = nextDay;
  if (!checkoutInput.value || checkoutInput.value <= checkinInput.value) {
    checkoutInput.value = nextDay;
  }
}

function formatDate(value) {
  if (!value) return "未选择";
  return value.replaceAll("-", ".");
}

function getSelectedNights() {
  if (!checkinInput.value || !checkoutInput.value || checkoutInput.value <= checkinInput.value) return [];

  const nights = [];
  let current = parseDateValue(checkinInput.value);
  const end = parseDateValue(checkoutInput.value);

  while (current < end) {
    nights.push(toDateValue(current));
    current = addDays(current, 1);
  }

  return nights;
}

function getBlockedSet(room) {
  return new Set(availabilityData?.roomsAvailability?.[room]?.blockedNights || []);
}

function getRoomCheck(room, nights) {
  const blocked = getBlockedSet(room);
  const blockedNights = nights.filter((night) => blocked.has(night));
  return {
    room,
    available: blockedNights.length === 0,
    blockedNights,
  };
}

function getAvailabilityCheck() {
  const nights = getSelectedNights();
  if (nights.length === 0) {
    return {
      state: "pending",
      blocksSubmit: false,
      message: "请选择正确的入住和离店日期。",
      availableRooms: [],
    };
  }

  if (availabilityLoadFailed) {
    return {
      state: "warning",
      blocksSubmit: false,
      message: "房态暂时未能自动读取。可以提交申请，但必须等房东确认后再付款。",
      availableRooms: [],
    };
  }

  if (!availabilityData) {
    return {
      state: "loading",
      blocksSubmit: false,
      message: "正在读取最新房态，提交后仍需房东最终确认。",
      availableRooms: [],
    };
  }

  const roomChoice = getRoomChoice();
  const checks = ROOM_CHOICES.map((room) => getRoomCheck(room, nights));
  const availableRooms = checks.filter((check) => check.available).map((check) => check.room);
  const generatedDate = availabilityData.generatedAt
    ? new Date(availabilityData.generatedAt).toLocaleString("zh-CN", { hour12: false })
    : "刚刚";

  if (roomChoice === "都可以") {
    if (availableRooms.length === 0) {
      return {
        state: "blocked",
        blocksSubmit: true,
        message: `所选日期两间房都已被占用，请更换日期或直接联系房东。房态更新：${generatedDate}`,
        availableRooms,
      };
    }
    return {
      state: "available",
      blocksSubmit: false,
      message: `所选日期目前可申请，当前可选：${availableRooms.join("、")}。最终仍以房东确认为准。`,
      availableRooms,
    };
  }

  const selectedCheck = checks.find((check) => check.room === roomChoice);
  if (!selectedCheck?.available) {
    const blockedText = selectedCheck.blockedNights.map(formatDate).join("、");
    return {
      state: "blocked",
      blocksSubmit: true,
      message: `${roomChoice} 在 ${blockedText} 已被占用。请选择另一间房、换日期，或联系房东确认。`,
      availableRooms,
    };
  }

  return {
    state: "available",
    blocksSubmit: false,
    message: `${roomChoice} 所选日期目前可申请。提交后房东会再次核对途家等平台房态，再发送支付二维码。`,
    availableRooms,
  };
}

function updateAvailabilityStatus() {
  const check = getAvailabilityCheck();
  availabilityStatus.textContent = check.message;
  availabilityStatus.dataset.state = check.state;
  submitButton.disabled = check.blocksSubmit;
  submitButton.textContent = check.blocksSubmit ? "所选日期不可申请" : "生成预订需求";
  return check;
}

async function loadAvailability() {
  try {
    const response = await fetch("data/availability.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    availabilityData = await response.json();
  } catch (error) {
    availabilityLoadFailed = true;
  } finally {
    updateAvailabilityStatus();
  }
}

document.addEventListener("scroll", () => {
  header.classList.toggle("is-scrolled", window.scrollY > 20);
});

document.querySelectorAll("[data-room-choice]").forEach((link) => {
  link.addEventListener("click", (event) => {
    setRoomChoice(link.dataset.roomChoice);
    updateEstimate();
    updateAvailabilityStatus();
  });
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    dialog.close();
  });
});

form.addEventListener("input", () => {
  syncCheckoutMinimum();
  updateEstimate();
  syncRoomCards();
  updateAvailabilityStatus();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  syncCheckoutMinimum();
  updateEstimate();

  const availabilityCheck = updateAvailabilityStatus();
  if (availabilityCheck.blocksSubmit) {
    availabilityStatus.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const nights = getNightCount();
  const rateType = getRateType();
  const total = nights * RATES[rateType];
  const summary = [
    `入住 ${formatDate(checkinInput.value)}，离店 ${formatDate(checkoutInput.value)}`,
    `${nights}晚，${guestsInput.value}人，房型：${getRoomChoice()}`,
    `${RATE_LABELS[rateType]} ¥${RATES[rateType]}/晚，预估合计 ¥${total}`,
    availabilityCheck.availableRooms.length ? `当前可申请房型：${availabilityCheck.availableRooms.join("、")}` : "房态需人工复核",
    "入住时间为 14:00 后，平日退房 12:00 前，节假日退房 10:00 前",
    "提交后仍需房东确认房态、价格和入住方式；确认可住后再发送支付二维码。",
  ].join("。");

  requestSummary.textContent = summary;
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    window.alert(summary);
  }
});

function getMapLinks() {
  const encodedAddress = encodeURIComponent(mapAddress);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isMobile = isIOS || isAndroid;
  const amapApp = isIOS
    ? `iosamap://path?sourceApplication=MiaoStay&dname=${encodedAddress}&dev=0&t=0`
    : isAndroid
      ? `androidamap://keywordNavi?sourceApplication=MiaoStay&keyword=${encodedAddress}&style=2`
      : `https://uri.amap.com/search?keyword=${encodedAddress}`;

  return {
    amap: amapApp,
    baidu: isMobile
      ? `baidumap://map/geocoder?address=${encodedAddress}&src=MiaoStay`
      : `https://map.baidu.com/search/${encodedAddress}`,
    tencent: isMobile
      ? `qqmap://map/search?keyword=${encodedAddress}`
      : `https://apis.map.qq.com/uri/v1/search?keyword=${encodedAddress}`,
  };
}

function refreshMapLinks() {
  const links = getMapLinks();
  document.querySelectorAll("[data-map-link]").forEach((link) => {
    link.href = links[link.dataset.mapLink] || "#";
  });
}

document.querySelectorAll("[data-open-map]").forEach((button) => {
  button.addEventListener("click", () => {
    refreshMapLinks();
    if (typeof mapDialog?.showModal === "function") {
      mapDialog.showModal();
    } else {
      window.location.href = `https://uri.amap.com/search?keyword=${encodeURIComponent(mapAddress)}`;
    }
  });
});

document.querySelectorAll("[data-close-map]").forEach((button) => {
  button.addEventListener("click", () => {
    mapDialog.close();
  });
});

document.querySelector("[data-copy-address]")?.addEventListener("click", async (event) => {
  try {
    await navigator.clipboard.writeText(mapAddress);
    event.currentTarget.textContent = "已复制地址";
  } catch (error) {
    window.prompt("复制地址", mapAddress);
  }
});

setDefaultDates();
syncCheckoutMinimum();
updateEstimate();
syncRoomCards();
updateAvailabilityStatus();
refreshMapLinks();
loadAvailability();
