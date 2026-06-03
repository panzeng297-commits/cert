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
const roomInput = document.querySelector("#room");
const estimateTotal = document.querySelector("#estimateTotal");
const estimateMeta = document.querySelector("#estimateMeta");
const header = document.querySelector("[data-header]");
const dialog = document.querySelector("#requestDialog");
const requestSummary = document.querySelector("#requestSummary");

function toDateValue(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
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

document.addEventListener("scroll", () => {
  header.classList.toggle("is-scrolled", window.scrollY > 20);
});

document.querySelectorAll("[data-room-choice]").forEach((link) => {
  link.addEventListener("click", () => {
    roomInput.value = link.dataset.roomChoice;
    updateEstimate();
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
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  syncCheckoutMinimum();
  updateEstimate();

  const nights = getNightCount();
  const rateType = getRateType();
  const total = nights * RATES[rateType];
  const summary = [
    `入住 ${formatDate(checkinInput.value)}，离店 ${formatDate(checkoutInput.value)}`,
    `${nights}晚，${guestsInput.value}人，房型：${roomInput.value}`,
    `${RATE_LABELS[rateType]} ¥${RATES[rateType]}/晚，预估合计 ¥${total}`,
    "提交后仍需房东确认房态、价格和入住方式。",
  ].join("。");

  requestSummary.textContent = summary;
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    window.alert(summary);
  }
});

setDefaultDates();
syncCheckoutMinimum();
updateEstimate();
