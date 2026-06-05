const RATES = {
  normal: 140,
  weekend: 160,
  peak: 420,
};

const RATE_LABELS = {
  normal: "平日价",
  weekend: "周末价",
  peak: "高峰日价",
};

const roomForms = [...document.querySelectorAll("[data-room-form]")];
const header = document.querySelector("[data-header]");
const dialog = document.querySelector("#requestDialog");
const requestSummary = document.querySelector("#requestSummary");
const mapDialog = document.querySelector("#mapDialog");
const photoDialog = document.querySelector("#photoDialog");
const photoDialogImage = document.querySelector("[data-photo-dialog-image]");
const photoDialogCaption = document.querySelector("[data-photo-dialog-caption]");
const photoHoverPreview = document.querySelector("[data-photo-hover-preview]");
const photoHoverImage = document.querySelector("[data-photo-hover-image]");
const photoHoverCaption = document.querySelector("[data-photo-hover-caption]");
const mapAddress = "重庆市渝中区化龙桥翡翠云阶 4 栋 C 座";

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

function getControls(form) {
  return {
    checkin: form.querySelector('input[name="checkin"]'),
    checkout: form.querySelector('input[name="checkout"]'),
    guests: form.querySelector('select[name="guests"]'),
    estimateTotal: form.querySelector("[data-estimate-total]"),
    estimateMeta: form.querySelector("[data-estimate-meta]"),
    status: form.querySelector("[data-availability-status]"),
    submit: form.querySelector(".submit-button"),
  };
}

function getNightCount(form) {
  const { checkin, checkout } = getControls(form);
  const start = new Date(checkin.value);
  const end = new Date(checkout.value);
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return Number.isFinite(diff) && diff > 0 ? diff : 1;
}

function getRateType(form) {
  return form.querySelector('input[name="rateType"]:checked')?.value || "normal";
}

function updateEstimate(form) {
  const { estimateTotal, estimateMeta } = getControls(form);
  const nights = getNightCount(form);
  const rateType = getRateType(form);
  const total = nights * RATES[rateType];
  estimateTotal.textContent = `¥${total}`;
  estimateMeta.textContent = `${nights}晚 · ${RATE_LABELS[rateType]}`;
}

function setDefaultDates(form) {
  const { checkin, checkout } = getControls(form);
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const dayAfter = addDays(today, 3);
  checkin.value = toDateValue(tomorrow);
  checkout.value = toDateValue(dayAfter);
  checkin.min = toDateValue(today);
  checkout.min = toDateValue(addDays(today, 1));
}

function syncCheckoutMinimum(form) {
  const { checkin, checkout } = getControls(form);
  if (!checkin.value) return;
  const nextDay = toDateValue(addDays(new Date(checkin.value), 1));
  checkout.min = nextDay;
  if (!checkout.value || checkout.value <= checkin.value) {
    checkout.value = nextDay;
  }
}

function formatDate(value) {
  if (!value) return "未选择";
  return value.replaceAll("-", ".");
}

function getSelectedNights(form) {
  const { checkin, checkout } = getControls(form);
  if (!checkin.value || !checkout.value || checkout.value <= checkin.value) return [];

  const nights = [];
  let current = parseDateValue(checkin.value);
  const end = parseDateValue(checkout.value);

  while (current < end) {
    nights.push(toDateValue(current));
    current = addDays(current, 1);
  }

  return nights;
}

function getBlockedSet(room) {
  return new Set(availabilityData?.roomsAvailability?.[room]?.blockedNights || []);
}

function getAvailabilityCheck(form) {
  const room = form.dataset.room;
  const nights = getSelectedNights(form);

  if (nights.length === 0) {
    return {
      state: "pending",
      blocksSubmit: false,
      message: "请选择正确的入住和离店日期。",
    };
  }

  if (availabilityLoadFailed) {
    return {
      state: "warning",
      blocksSubmit: false,
      message: "房态暂时未能自动读取。可以提交申请，但必须等房东确认后再付款。",
    };
  }

  if (!availabilityData) {
    return {
      state: "loading",
      blocksSubmit: false,
      message: "正在读取最新房态，提交后仍需房东最终确认。",
    };
  }

  const blocked = getBlockedSet(room);
  const blockedNights = nights.filter((night) => blocked.has(night));

  if (blockedNights.length > 0) {
    return {
      state: "blocked",
      blocksSubmit: true,
      message: `${room} 在 ${blockedNights.map(formatDate).join("、")} 已被占用。请选择另一间房、换日期，或联系房东确认。`,
    };
  }

  return {
    state: "available",
    blocksSubmit: false,
    message: `${room} 所选日期目前可申请。提交后房东会再次确认房态，再发送支付二维码。`,
  };
}

function updateAvailabilityStatus(form) {
  const { status, submit } = getControls(form);
  const check = getAvailabilityCheck(form);
  status.textContent = check.message;
  status.dataset.state = check.state;
  submit.disabled = check.blocksSubmit;
  submit.textContent = check.blocksSubmit ? "所选日期不可申请" : `提交${form.dataset.room}入住申请`;
  return check;
}

function updateAllAvailabilityStatus() {
  roomForms.forEach((form) => updateAvailabilityStatus(form));
}

async function loadAvailability() {
  try {
    const response = await fetch("data/availability.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    availabilityData = await response.json();
  } catch (error) {
    availabilityLoadFailed = true;
  } finally {
    updateAllAvailabilityStatus();
  }
}

document.addEventListener("scroll", () => {
  header.classList.toggle("is-scrolled", window.scrollY > 20);
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    dialog.close();
  });
});

roomForms.forEach((form) => {
  setDefaultDates(form);
  syncCheckoutMinimum(form);
  updateEstimate(form);
  updateAvailabilityStatus(form);

  form.addEventListener("input", () => {
    syncCheckoutMinimum(form);
    updateEstimate(form);
    updateAvailabilityStatus(form);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    syncCheckoutMinimum(form);
    updateEstimate(form);

    const availabilityCheck = updateAvailabilityStatus(form);
    const { checkin, checkout, guests, status } = getControls(form);
    if (availabilityCheck.blocksSubmit) {
      status.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const nights = getNightCount(form);
    const rateType = getRateType(form);
    const total = nights * RATES[rateType];
    const room = form.dataset.room;
    const summary = [
      `入住 ${formatDate(checkin.value)}，离店 ${formatDate(checkout.value)}`,
      `${nights}晚，${guests.value}人，房型：${room}`,
      `${RATE_LABELS[rateType]} ¥${RATES[rateType]}/晚，预估合计 ¥${total}`,
      "周末为单独价格档，不按高峰日计算",
      "入住时间为 14:00 后，平日和周末退房 12:00 前，高峰日退房 10:00 前",
      "提交后仍需房东确认房态、价格和入住方式；确认可住后再发送支付二维码。",
    ].join("。");

    requestSummary.textContent = summary;
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      window.alert(summary);
    }
  });
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

function openPhotoDialog(image) {
  const fullImage = image.dataset.full || image.currentSrc || image.src;
  const caption = image.dataset.caption || image.alt || "房间照片";
  photoDialogImage.src = fullImage;
  photoDialogImage.alt = caption;
  photoDialogCaption.textContent = caption;

  if (typeof photoDialog?.showModal === "function") {
    photoDialog.showModal();
  } else {
    window.open(fullImage, "_blank", "noopener");
  }
}

function positionPhotoHoverPreview(sourceImage) {
  if (!photoHoverPreview) return;
  const sourceRect = sourceImage.getBoundingClientRect();
  const previewRect = photoHoverPreview.getBoundingClientRect();
  const margin = 18;
  const spaceRight = window.innerWidth - sourceRect.right;
  const placeRight = spaceRight >= previewRect.width + margin;
  let left = placeRight ? sourceRect.right + margin : sourceRect.left - previewRect.width - margin;
  let top = sourceRect.top + sourceRect.height / 2 - previewRect.height / 2;

  left = Math.max(margin, Math.min(left, window.innerWidth - previewRect.width - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - previewRect.height - margin));

  photoHoverPreview.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0) scale(1)`;
}

function showPhotoHoverPreview(image) {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const fullImage = image.dataset.full || image.currentSrc || image.src;
  const caption = image.dataset.caption || image.alt || "房间照片";
  photoHoverImage.src = fullImage;
  photoHoverImage.alt = caption;
  photoHoverCaption.textContent = caption;
  photoHoverPreview.classList.add("is-visible");
  requestAnimationFrame(() => positionPhotoHoverPreview(image));
}

function hidePhotoHoverPreview() {
  if (!photoHoverPreview) return;
  photoHoverPreview.classList.remove("is-visible");
  photoHoverPreview.style.transform = "translate3d(-9999px, -9999px, 0) scale(0.98)";
}

document.querySelectorAll("[data-gallery-image]").forEach((image) => {
  image.addEventListener("mouseenter", () => showPhotoHoverPreview(image));
  image.addEventListener("mousemove", () => positionPhotoHoverPreview(image));
  image.addEventListener("mouseleave", hidePhotoHoverPreview);
  image.addEventListener("focus", () => showPhotoHoverPreview(image));
  image.addEventListener("blur", hidePhotoHoverPreview);
  image.addEventListener("click", () => openPhotoDialog(image));
  image.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPhotoDialog(image);
    }
  });
});

document.querySelector("[data-close-photo]")?.addEventListener("click", () => {
  photoDialog.close();
});

photoDialog?.addEventListener("click", (event) => {
  if (event.target === photoDialog) {
    photoDialog.close();
  }
});

refreshMapLinks();
loadAvailability();
