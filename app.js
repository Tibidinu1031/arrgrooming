"use strict";

/* =========================================================================
   Datele salonului vin din blocul JSON "site-content" din index.html,
   pe care îl modifică panoul de administrare (/admin). Nu e nevoie de cod.
   ========================================================================= */
const CONTENT = (() => {
  try {
    return JSON.parse(document.getElementById("site-content").textContent);
  } catch {
    return null;
  }
})();

const toMinutes = (value) => {
  const [h, m] = String(value || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
function phoneFrom(display) {
  let digits = String(display || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `40${digits.slice(1)}`;
  digits = digits.replace(/\D/g, "");
  return { tel: `+${digits}`, wa: digits };
}

const SALON = (() => {
  const contact = CONTENT?.contact || {};
  const display = contact.phoneDisplay || "0744 134 819";
  const phone = phoneFrom(display);
  // Index după Date.getDay(): 0 = duminică ... 6 = sâmbătă. [deschidere, închidere] în minute.
  const hours = { 0: null, 1: [540, 1080], 2: [540, 1080], 3: [540, 1080], 4: [540, 1080], 5: [540, 1080], 6: [540, 840] };
  if (Array.isArray(CONTENT?.hours)) {
    CONTENT.hours.forEach((item) => {
      hours[item.day] = item.closed ? null : [toMinutes(item.open), toMinutes(item.close)];
    });
  }
  const booking = CONTENT?.booking || {};
  return {
    name: CONTENT?.siteName || "Arr Grooming Salon",
    phone: phone.tel,
    phoneDisplay: display,
    whatsapp: phone.wa,
    address: [contact.street, contact.building, contact.city].filter(Boolean).join(", ") || "Str. 1 Decembrie 1918 nr. 1, Bl. S5C, parter, Galați",
    timeZone: "Europe/Bucharest",
    hours,
    closedDates: new Map((CONTENT?.closedDates || []).filter((item) => item && item.date).map((item) => [item.date, item.note || ""])),
    slotStep: Math.max(10, Number(booking.slotStep) || 30),
    leadMinutes: Math.max(0, Number(booking.leadMinutes) || 0),
    horizonDays: Math.max(7, Number(booking.horizonDays) || 60),
    bookingEndpoint: booking.endpoint || "",
  };
})();

const SIZES = { small: "talie mică", medium: "talie medie", large: "talie mare" };

// Durate estimative, în minute (confirmate telefonic la programare).
const SERVICES = (
  CONTENT?.services || [
    { id: "complet", name: "Toaletaj complet", icon: "i-sparkle", pets: ["dog"], short: "Baie, uscare, tuns, unghii și urechi", duration: { small: 90, medium: 120, large: 150 }, bookable: true },
    { id: "baie", name: "Baie & periaj", icon: "i-bath", pets: ["dog", "cat"], short: "Spălat, uscat, periat, descâlcire ușoară", duration: { small: 60, medium: 75, large: 90, cat: 60 }, bookable: true },
  ]
)
  .filter((service) => service.visible !== false && service.bookable !== false && Array.isArray(service.pets) && service.pets.length)
  .map((service) => ({
    id: service.id,
    name: service.name,
    icon: service.icon || "i-sparkle",
    pets: service.pets,
    desc: service.short || "",
    duration: service.duration || {},
  }));

/* ========================================================================= */

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const root = document.documentElement;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
const DAY_NAMES = ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"];

const pad = (n) => String(n).padStart(2, "0");
const fmtTime = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function fmtDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} h ${m} min`;
  return h ? `${h} h` : `${m} min`;
}
function joinRo(items) {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} și ${items.at(-1)}`;
}

/* ---------- Toast ---------- */
const toast = $("#toast");
let toastTimer = 0;
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    area.remove();
    return ok;
  }
}

/* ---------- Header & menu ---------- */
const header = $(".site-header");
const menuButton = $(".menu-toggle");
const navigation = $("#navigation");

function closeMenu() {
  if (!menuButton) return;
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Deschide meniul");
  navigation.classList.remove("open");
}
menuButton?.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Închide meniul" : "Deschide meniul");
  navigation.classList.toggle("open", open);
});
$$("a", navigation).forEach((link) => link.addEventListener("click", closeMenu));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && navigation.classList.contains("open")) {
    closeMenu();
    menuButton.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".site-header")) closeMenu();
});
header.addEventListener("focusout", (event) => {
  if (event.relatedTarget && !header.contains(event.relatedTarget)) closeMenu();
});

/* ---------- Scroll-driven UI ---------- */
const hero = $(".hero");
const mobileBar = $(".mobile-bar");
const toTop = $(".to-top");
const bookingSection = $("#programari");
const contactSection = $("#contact");
const siteFooter = $(".site-footer");
const steps = $(".steps");
const stepItems = $$(".step");
const dialog = $("#booking-dialog");
const navLinks = $$('#navigation > a[href^="#"]');
const navTargets = navLinks.map((link) => $(link.getAttribute("href")));
let typing = false;
let scrollScheduled = false;

function updateScroll() {
  scrollScheduled = false;
  const y = window.scrollY;
  const vh = window.innerHeight;
  header.classList.toggle("scrolled", y > 8);
  const range = root.scrollHeight - vh;
  root.style.setProperty("--reading-progress", range > 0 ? Math.min(1, y / range).toFixed(4) : 0);

  let current = -1;
  navTargets.forEach((section, index) => {
    if (section && section.getBoundingClientRect().top <= header.offsetHeight + 140) current = index;
  });
  navLinks.forEach((link, index) => {
    if (index === current) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });

  const footerTop = siteFooter ? siteFooter.getBoundingClientRect().top : Infinity;
  toTop?.classList.toggle("visible", y > vh * 0.9 && footerTop > vh - 40);

  if (mobileBar) {
    const booking = bookingSection.getBoundingClientRect();
    const inBooking = booking.top < vh * 0.7 && booking.bottom > vh * 0.3;
    const nearContact = contactSection.getBoundingClientRect().top < vh * 0.85;
    const pastHero = y > (hero ? hero.offsetHeight * 0.7 : 400);
    mobileBar.classList.toggle("visible", pastHero && !inBooking && !nearContact && !typing && !(dialog && dialog.open));
  }

  if (steps) {
    const box = steps.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, (vh * 0.78 - box.top) / (box.height + vh * 0.25)));
    steps.style.setProperty("--steps-progress", progress.toFixed(3));
    stepItems.forEach((item, index) => item.classList.toggle("is-lit", progress * 3 >= index - 0.05 && progress > 0.02));
  }
}
function requestScrollUpdate() {
  if (!scrollScheduled) {
    scrollScheduled = true;
    requestAnimationFrame(updateScroll);
  }
}
window.addEventListener("scroll", requestScrollUpdate, { passive: true });
window.addEventListener("resize", () => {
  if (window.innerWidth > 1180) closeMenu();
  requestScrollUpdate();
});
document.addEventListener("focusin", (event) => {
  if (event.target.matches("input:not([type=radio]), textarea")) {
    typing = true;
    requestScrollUpdate();
  }
});
document.addEventListener("focusout", (event) => {
  if (event.target.matches("input:not([type=radio]), textarea")) {
    typing = false;
    requestScrollUpdate();
  }
});
toTop?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" }));
updateScroll();

/* ---------- Opening status (always in Romanian time) ---------- */
function salonNow() {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: SALON.timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type).value;
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: SALON.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return { day, date, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
  } catch {
    const now = new Date();
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return { day: now.getDay(), date, minutes: now.getHours() * 60 + now.getMinutes() };
  }
}
function isoShift(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const shifted = new Date(y, m - 1, d + days);
  return { iso: `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`, day: shifted.getDay() };
}
const hoursOn = (isoDate, day) => (SALON.closedDates.has(isoDate) ? null : SALON.hours[day]);
function openingStatus() {
  const { day, date, minutes } = salonNow();
  const today = hoursOn(date, day);
  if (today && minutes >= today[0] && minutes < today[1]) {
    const until = fmtTime(today[1]);
    return { open: true, day, long: `Deschis acum · până la ${until}`, short: `Deschis acum · până la ${until}` };
  }
  if (today && minutes < today[0]) {
    const at = fmtTime(today[0]);
    return { open: false, day, long: `Închis acum · deschidem azi la ${at}`, short: `Deschidem azi la ${at}` };
  }
  for (let offset = 1; offset <= 30; offset++) {
    const next = isoShift(date, offset);
    const hours = hoursOn(next.iso, next.day);
    if (hours) {
      const when = offset === 1 ? "mâine" : offset < 7 ? DAY_NAMES[next.day] : `pe ${next.iso.split("-").reverse().slice(0, 2).join(".")}`;
      const at = fmtTime(hours[0]);
      return { open: false, day, long: `Închis acum · deschidem ${when} la ${at}`, short: `Deschidem ${when} la ${at}` };
    }
  }
  return { open: false, day, long: "Închis", short: "Închis" };
}
function renderStatus() {
  const status = openingStatus();
  $$("[data-open-status]").forEach((element) => {
    element.classList.toggle("is-closed", !status.open);
    const text = $("[data-status-text]", element);
    if (text) text.textContent = element.classList.contains("hv-chip") ? status.short : status.long;
  });
  $$("#hours > div").forEach((row) => row.classList.toggle("is-today", Number(row.dataset.day) === status.day));
}
renderStatus();
setInterval(renderStatus, 60000);

// Zilele libere viitoare (din panoul de administrare), afișate sub program.
(function renderClosedDays() {
  const box = $("#closed-days");
  if (!box || !SALON.closedDates.size) return;
  const { date } = salonNow();
  const limit = isoShift(date, 120).iso;
  const upcoming = [...SALON.closedDates.entries()].filter(([day]) => day >= date && day <= limit).sort(([a], [b]) => a.localeCompare(b));
  if (!upcoming.length) return;
  const format = new Intl.DateTimeFormat("ro-RO", { weekday: "long", day: "numeric", month: "long" });
  const title = document.createElement("p");
  title.className = "closed-days-title";
  title.textContent = "Zile în care salonul este închis";
  const list = document.createElement("ul");
  upcoming.forEach(([day, note]) => {
    const [y, m, d] = day.split("-").map(Number);
    const item = document.createElement("li");
    const when = document.createElement("strong");
    when.textContent = capitalize(format.format(new Date(y, m - 1, d)));
    item.append(when);
    if (note) item.append(document.createTextNode(` · ${note}`));
    list.append(item);
  });
  box.append(title, list);
  box.hidden = false;
})();

/* ---------- Reveal on scroll & counters ---------- */
function animateCount(element) {
  const target = Number(element.dataset.count);
  const decimals = Number(element.dataset.decimals || 0);
  const format = (value) => value.toFixed(decimals).replace(".", ",");
  if (reducedMotion.matches) {
    element.textContent = format(target);
    return;
  }
  const start = performance.now();
  const duration = 1300;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    element.textContent = format(target * eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
if ("IntersectionObserver" in window && !reducedMotion.matches) {
  root.classList.add("js-reveal");
  const revealables = $$("[data-reveal], .section-label");
  revealables.forEach((element) => {
    if (!element.hasAttribute("data-reveal")) return;
    const siblings = [...element.parentElement.children].filter((child) => child.hasAttribute("data-reveal"));
    element.style.setProperty("--stagger", Math.max(0, siblings.indexOf(element)));
  });
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        $$("[data-count]", entry.target).forEach(animateCount);
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
  );
  revealables.forEach((element) => observer.observe(element));
} else {
  root.classList.add("no-reveal");
}

/* ---------- Pointer effects (desktop only) ---------- */
if (finePointer.matches && !reducedMotion.matches) {
  const visual = $(".hero-visual");
  if (visual) {
    const layers = $$("[data-depth]", visual);
    let frame = 0;
    let tx = 0;
    let ty = 0;
    const apply = () => {
      frame = 0;
      layers.forEach((layer) => {
        const depth = Number(layer.dataset.depth) * 1.6;
        layer.style.translate = `${(tx * depth).toFixed(1)}px ${(ty * depth).toFixed(1)}px`;
      });
    };
    visual.addEventListener("pointermove", (event) => {
      const box = visual.getBoundingClientRect();
      tx = (event.clientX - box.left) / box.width - 0.5;
      ty = (event.clientY - box.top) / box.height - 0.5;
      if (!frame) frame = requestAnimationFrame(apply);
    });
    visual.addEventListener("pointerleave", () => {
      tx = 0;
      ty = 0;
      if (!frame) frame = requestAnimationFrame(apply);
    });
  }

  $$(".magnetic").forEach((element) => {
    element.addEventListener("pointermove", (event) => {
      const box = element.getBoundingClientRect();
      const x = event.clientX - box.left - box.width / 2;
      const y = event.clientY - box.top - box.height / 2;
      element.style.transform = `translate(${(x * 0.16).toFixed(1)}px, ${(y * 0.28).toFixed(1)}px)`;
    });
    element.addEventListener("pointerleave", () => (element.style.transform = ""));
  });

  $$(".tilt").forEach((element) => {
    element.addEventListener("pointermove", (event) => {
      const box = element.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      element.style.transform = `perspective(900px) rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 10).toFixed(2)}deg) translateY(-4px)`;
    });
    element.addEventListener("pointerleave", () => (element.style.transform = ""));
  });

  $$(".service").forEach((item) => {
    item.addEventListener("pointermove", (event) => {
      const box = item.getBoundingClientRect();
      item.style.setProperty("--mx", `${event.clientX - box.left}px`);
      item.style.setProperty("--my", `${event.clientY - box.top}px`);
    });
  });
}
if (reducedMotion.matches) {
  $$(".hv-path").forEach((svg) => svg.pauseAnimations?.());
}

/* ---------- 3D gallery shelf ---------- */
(function initGallery() {
  const stage = $(".gallery-stage");
  const ring = stage && $(".gallery-ring", stage);
  if (!ring) return;
  const cards = $$(".g-card", ring);
  const count = cards.length;
  if (count < 2) return;
  const currentLabel = $("[data-gallery-current]");
  const totalLabel = $("[data-gallery-total]");
  if (totalLabel) totalLabel.textContent = pad(count);
  const step = 360 / count;
  const tilt = -6;
  let radius = 0;
  let rotation = 0;
  let target = null;
  let velocity = 0;
  let dragging = false;
  let pointerId = null;
  let downCard = null;
  let lastX = 0;
  let lastTime = 0;
  let moved = 0;
  let pausedUntil = 0;
  let inView = false;
  let hovered = false;
  let frame = 0;
  let lastFrame = 0;
  const pause = (ms = 6000) => (pausedUntil = performance.now() + ms);
  const frontIndex = () => (((Math.round(-rotation / step) % count) + count) % count);
  const nearest = () => Math.round(rotation / step) * step;

  function render() {
    ring.style.transform = `translateZ(${-radius}px) rotateX(${tilt}deg) rotateY(${rotation.toFixed(2)}deg)`;
    const front = frontIndex();
    cards.forEach((card, index) => {
      const angle = ((((index * step + rotation) % 360) + 540) % 360) - 180;
      card.style.setProperty("--f", Math.cos((angle * Math.PI) / 180).toFixed(3));
      card.classList.toggle("is-front", index === front);
    });
    const label = pad(front + 1);
    if (currentLabel && currentLabel.textContent !== label) currentLabel.textContent = label;
  }
  function layout() {
    const width = cards[0].offsetWidth || 220;
    radius = Math.round(width / 2 / Math.tan(Math.PI / count) + Math.max(16, width * 0.14));
    cards.forEach((card, index) => (card.style.transform = `rotateY(${index * step}deg) translateZ(${radius}px)`));
    render();
  }
  function tick(now) {
    frame = 0;
    const dt = Math.min(48, now - (lastFrame || now));
    lastFrame = now;
    let busy = dragging;
    if (!dragging && target !== null) {
      const diff = target - rotation;
      if (Math.abs(diff) < 0.04) {
        rotation = target;
        target = null;
      } else {
        rotation += diff * Math.min(1, dt / 110);
        busy = true;
      }
    } else if (!dragging && Math.abs(velocity) > 0.03) {
      rotation += velocity * (dt / 16);
      velocity *= Math.pow(0.9, dt / 16);
      if (Math.abs(velocity) <= 0.03) {
        velocity = 0;
        target = nearest();
      }
      busy = true;
    } else if (!dragging && !reducedMotion.matches && inView && !hovered && now > pausedUntil && document.visibilityState === "visible") {
      rotation -= dt * 0.0065;
      busy = true;
    }
    render();
    if (busy || inView) frame = requestAnimationFrame(tick);
  }
  function start() {
    if (!frame) {
      lastFrame = 0;
      frame = requestAnimationFrame(tick);
    }
  }
  function goTo(index) {
    const desired = -(((index % count) + count) % count) * step;
    const next = desired + 360 * Math.round((rotation - desired) / 360);
    velocity = 0;
    pause();
    if (reducedMotion.matches) {
      rotation = next;
      target = null;
      render();
      return;
    }
    target = next;
    start();
  }

  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragging = true;
    pointerId = event.pointerId;
    downCard = event.target.closest(".g-card");
    lastX = event.clientX;
    lastTime = performance.now();
    moved = 0;
    velocity = 0;
    target = null;
    stage.setPointerCapture(event.pointerId);
    stage.classList.add("is-dragging");
    pause();
    start();
  });
  stage.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    const now = performance.now();
    const dx = event.clientX - lastX;
    const degrees = ((dx / radius) * 180) / Math.PI * 1.15;
    rotation += degrees;
    moved += Math.abs(dx);
    velocity = Math.max(-4.5, Math.min(4.5, velocity * 0.6 + ((degrees * 16) / Math.max(8, now - lastTime)) * 0.4));
    lastX = event.clientX;
    lastTime = now;
  });
  const release = (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    dragging = false;
    stage.classList.remove("is-dragging");
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    pause();
    if (moved < 6 && downCard) {
      goTo(Number(downCard.dataset.index));
      return;
    }
    if (performance.now() - lastTime > 120) velocity = 0;
    if (reducedMotion.matches || Math.abs(velocity) < 0.3) {
      velocity = 0;
      target = nearest();
      if (reducedMotion.matches) {
        rotation = target;
        target = null;
        render();
      }
    }
    start();
  };
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);
  stage.addEventListener(
    "wheel",
    (event) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      rotation -= event.deltaX * 0.18;
      target = null;
      velocity = 0;
      pause(2500);
      clearTimeout(stage._wheelSnap);
      stage._wheelSnap = setTimeout(() => {
        target = nearest();
        start();
      }, 160);
      start();
    },
    { passive: false },
  );
  stage.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") goTo(frontIndex() + 1);
    else if (event.key === "ArrowLeft") goTo(frontIndex() - 1);
    else if (event.key === "Home") goTo(0);
    else if (event.key === "End") goTo(count - 1);
    else return;
    event.preventDefault();
  });
  stage.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "mouse") return;
    hovered = true;
    if (!dragging && velocity === 0) {
      target = nearest();
      start();
    }
  });
  stage.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") hovered = false;
  });
  stage.addEventListener("focus", () => pause(8000));
  $("[data-gallery-prev]")?.addEventListener("click", () => goTo(frontIndex() - 1));
  $("[data-gallery-next]")?.addEventListener("click", () => goTo(frontIndex() + 1));

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      if (inView) start();
    }).observe(stage);
  } else {
    inView = true;
  }
  window.addEventListener("resize", layout);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && inView && start());
  layout();
  start();
})();

/* ---------- Animated accordions ---------- */
function setupAccordion(items) {
  items.forEach((details) => {
    const group = details.getAttribute("name");
    if (group) {
      details.dataset.group = group;
      details.removeAttribute("name");
    }
    const summary = $("summary", details);
    summary.addEventListener("click", (event) => {
      event.preventDefault();
      const opening = !details.open;
      if (opening && details.dataset.group) {
        items
          .filter((other) => other !== details && other.open && other.dataset.group === details.dataset.group)
          .forEach((other) => toggleDetails(other, false));
      }
      toggleDetails(details, opening);
    });
  });
}
function toggleDetails(details, open) {
  const summary = $("summary", details);
  if (details._animation) details._animation.cancel();
  if (reducedMotion.matches || !details.animate) {
    details.open = open;
    return;
  }
  const startHeight = details.offsetHeight;
  const border = details.offsetHeight - details.clientHeight;
  if (open) details.open = true;
  const endHeight = open ? details.offsetHeight : summary.offsetHeight + border;
  details.style.overflow = "hidden";
  const animation = details.animate(
    [{ height: `${startHeight}px` }, { height: `${endHeight}px` }],
    { duration: open ? 460 : 340, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
  details._animation = animation;
  animation.onfinish = () => {
    if (!open) details.open = false;
    details.style.overflow = "";
    details._animation = null;
  };
  animation.oncancel = () => {
    details.style.overflow = "";
  };
}
setupAccordion($$(".service"));
setupAccordion($$(".faq-item"));

/* ---------- Copy phone ---------- */
$$("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const ok = await copyText(button.dataset.copy);
    showToast(ok ? "Numărul a fost copiat." : `Numărul nostru: ${button.dataset.copy}`);
    button.classList.add("copied");
    setTimeout(() => button.classList.remove("copied"), 1600);
  });
});

/* ---------- Footer year ---------- */
const year = $("#year");
if (year) year.textContent = new Date().getFullYear();

/* =========================================================================
   Calendarul de programări
   ========================================================================= */
const booker = $("#booker");
if (booker) initBooking();

function initBooking() {
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  const addMonths = (date, months) => {
    const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), last));
  };
  const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const iso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parseIso = (value) => {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const fmtMonth = new Intl.DateTimeFormat("ro-RO", { month: "long", year: "numeric" });
  const fmtDay = new Intl.DateTimeFormat("ro-RO", { weekday: "long", day: "numeric", month: "long" });
  const fmtDayYear = new Intl.DateTimeFormat("ro-RO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const today = startOfDay(new Date());
  const maxDate = addDays(today, SALON.horizonDays);
  const state = { pet: "dog", size: "small", service: null, date: null, time: null, view: new Date(today.getFullYear(), today.getMonth(), 1) };
  let focusDate = null;

  const serviceBox = $("#service-options");
  const sizeGroup = $("#size-group");
  const calBody = $("#cal-body");
  const calTitle = $("#cal-title");
  const calPrev = $("#cal-prev");
  const calNext = $("#cal-next");
  const calNote = $("#cal-note");
  const slotsBox = $("#slots");
  const slotsTitle = $("#slots-title");
  const slotsSub = $("#slots-sub");
  const slotGroups = $("#slot-groups");
  const hint = $("#summary-hint");
  const progressBar = $(".summary-progress span");
  const fields = {
    name: $("#f-name"),
    phone: $("#f-phone"),
    petName: $("#f-petname"),
    breed: $("#f-breed"),
    notes: $("#f-notes"),
  };
  const DAY_ARTICLED = ["duminica", "lunea", "marțea", "miercurea", "joia", "vinerea", "sâmbăta"];
  const closedWeekdays = [1, 2, 3, 4, 5, 6, 0].filter((day) => !SALON.hours[day]).map((day) => DAY_ARTICLED[day]);
  const closedText = closedWeekdays.length
    ? `${capitalize(joinRo(closedWeekdays))} salonul este închis.`
    : "Salonul este deschis în fiecare zi.";
  const defaultNote = `${closedText} Poți trimite cereri cu până la ${SALON.horizonDays} de zile înainte.`;
  calNote.textContent = defaultNote;

  const currentService = () => SERVICES.find((service) => service.id === state.service) || null;
  const durationOf = (service) => Number(state.pet === "cat" ? service.duration.cat : service.duration[state.size]) || 60;
  const duration = () => {
    const service = currentService();
    return service ? durationOf(service) : null;
  };
  const holidayNote = (date) => SALON.closedDates.get(iso(date));

  function slotsFor(date) {
    const hours = SALON.hours[date.getDay()];
    if (!hours || SALON.closedDates.has(iso(date))) return [];
    const length = duration() || SALON.slotStep;
    const open = hours[0];
    const close = hours[1];
    const now = new Date();
    const earliest = sameDay(date, now) ? now.getHours() * 60 + now.getMinutes() + SALON.leadMinutes : -1;
    const list = [];
    for (let minute = open; minute + length <= close; minute += SALON.slotStep) {
      if (minute >= earliest) list.push(minute);
    }
    return list;
  }
  function dayState(date) {
    if (date < today) return "past";
    if (date > maxDate) return "out";
    if (!SALON.hours[date.getDay()]) return "closed";
    if (SALON.closedDates.has(iso(date))) return "holiday";
    return slotsFor(date).length ? "available" : "full";
  }
  const stateLabel = {
    available: "",
    closed: ", salonul este închis",
    holiday: ", zi liberă",
    past: ", zi trecută",
    out: ", încă indisponibil",
    full: ", fără ore libere",
  };
  const stateNote = {
    closed: `${closedText} Alege altă zi.`,
    past: "Ziua aceasta a trecut. Alege o zi din viitor.",
    out: `Poți trimite cereri cu până la ${SALON.horizonDays} de zile înainte.`,
    full: "Pentru această zi nu mai sunt ore potrivite. Alege altă zi.",
  };
  const noteFor = (status, date) => {
    if (status !== "holiday") return stateNote[status];
    const note = holidayNote(date);
    return `În această zi salonul este închis${note ? ` (${note})` : ""}. Alege altă zi.`;
  };

  function renderServices() {
    const list = SERVICES.filter((service) => service.pets.includes(state.pet));
    if (state.service && !list.some((service) => service.id === state.service)) state.service = null;
    serviceBox.innerHTML = list
      .map(
        (service) => `<label class="svc-option">
          <input type="radio" name="service" value="${escapeHtml(service.id)}"${service.id === state.service ? " checked" : ""} />
          <span class="svc-card">
            <span class="svc-ico" aria-hidden="true"><svg class="icon"><use href="#${escapeHtml(service.icon)}"></use></svg></span>
            <span class="svc-name">${escapeHtml(service.name)}</span>
            <span class="svc-desc">${escapeHtml(service.desc)}</span>
            <span class="svc-dur"><svg class="icon" aria-hidden="true"><use href="#i-clock"></use></svg>aprox. ${fmtDuration(durationOf(service))}</span>
          </span>
        </label>`,
      )
      .join("");
  }

  function firstFocusable(year, month) {
    const days = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= days; day++) {
      const date = new Date(year, month, day);
      if (dayState(date) === "available") return date;
    }
    const first = new Date(year, month, 1);
    return first < today ? today : first;
  }

  function renderCalendar() {
    const year = state.view.getFullYear();
    const month = state.view.getMonth();
    calTitle.textContent = fmtMonth.format(state.view);
    calPrev.disabled = year === today.getFullYear() && month === today.getMonth();
    calNext.disabled = state.view >= new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
    if (!focusDate || focusDate.getMonth() !== month || focusDate.getFullYear() !== year) {
      focusDate = state.date && state.date.getMonth() === month && state.date.getFullYear() === year ? state.date : firstFocusable(year, month);
    }
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    let html = "";
    for (let cell = 0; cell < offset + days; ) {
      html += "<tr>";
      for (let col = 0; col < 7; col++, cell++) {
        const dayNumber = cell - offset + 1;
        if (dayNumber < 1 || dayNumber > days) {
          html += '<td role="gridcell"></td>';
          continue;
        }
        const date = new Date(year, month, dayNumber);
        const status = dayState(date);
        const selected = sameDay(date, state.date);
        const classes = ["cal-day", `is-${status}`];
        if (sameDay(date, today)) classes.push("is-today");
        if (selected) classes.push("is-selected");
        html += `<td role="gridcell" aria-selected="${selected}"><button type="button" class="${classes.join(" ")}" data-date="${iso(date)}" data-state="${status}" tabindex="${sameDay(date, focusDate) ? 0 : -1}" aria-label="${fmtDayYear.format(date)}${stateLabel[status]}"${status === "available" ? "" : ' aria-disabled="true"'}>${dayNumber}</button></td>`;
      }
      html += "</tr>";
    }
    calBody.innerHTML = html;
  }

  function renderSlots() {
    if (!state.date) {
      slotsTitle.textContent = "Alege o zi din calendar";
      slotsSub.textContent = "Îți arătăm orele potrivite pentru durata serviciului ales.";
      slotGroups.innerHTML = "";
      return;
    }
    const list = slotsFor(state.date);
    const service = currentService();
    slotsTitle.textContent = fmtDay.format(state.date);
    slotsSub.textContent = service
      ? `Ore de început pentru ${service.name.toLowerCase()}, aprox. ${fmtDuration(duration())}.`
      : "Alege și serviciul, ca să-ți arătăm orele potrivite duratei lui.";
    if (state.time !== null && !list.includes(state.time)) {
      state.time = null;
      showToast("Ora aleasă nu se mai potrivește. Te rugăm să alegi alta.");
    }
    if (!list.length) {
      slotGroups.innerHTML = `<div class="slots-empty"><svg class="icon" aria-hidden="true"><use href="#i-calendar"></use></svg><p>Nu mai sunt ore potrivite în această zi. Alege altă zi.</p></div>`;
      return;
    }
    const groups = [
      ["Dimineața", list.filter((minute) => minute < 720)],
      ["După-amiaza", list.filter((minute) => minute >= 720)],
    ].filter(([, minutes]) => minutes.length);
    let index = 0;
    slotGroups.innerHTML = groups
      .map(
        ([title, minutes]) => `<div class="slot-group"><p class="slot-group-title">${title}</p><div class="slot-list">${minutes
          .map(
            (minute) =>
              `<label class="slot" style="--i:${index++}"><input type="radio" name="time" value="${minute}"${minute === state.time ? " checked" : ""} aria-label="ora ${fmtTime(minute)}" /><span>${fmtTime(minute)}</span></label>`,
          )
          .join("")}</div></div>`,
      )
      .join("");
  }

  function setSummary(key, value) {
    const element = $(`[data-sum="${key}"]`);
    if (!element || element.textContent === value) return;
    element.textContent = value;
    element.classList.remove("is-set");
    void element.offsetWidth;
    element.classList.add("is-set");
  }
  const detailsComplete = () => fields.name.value.trim().length > 1 && fields.phone.value.trim().length > 5 && fields.petName.value.trim().length > 0;

  function updateSummary() {
    const service = currentService();
    const length = duration();
    setSummary("pet", state.pet === "cat" ? "Pisică" : `Câine, ${SIZES[state.size]}`);
    setSummary("service", service ? service.name : "–");
    setSummary("duration", length ? `aprox. ${fmtDuration(length)}` : "–");
    setSummary("date", state.date ? capitalize(fmtDay.format(state.date)) : "–");
    setSummary("time", state.time !== null ? `${fmtTime(state.time)}${length ? ` – ${fmtTime(state.time + length)}` : ""}` : "–");
    const done = {
      "step-pet": true,
      "step-service": Boolean(service),
      "step-date": Boolean(state.date && state.time !== null),
      "step-details": detailsComplete(),
    };
    Object.entries(done).forEach(([id, ok]) => $(`#${id}`).classList.toggle("is-done", ok));
    progressBar.style.setProperty("--p", Object.values(done).filter(Boolean).length / 4);
    const missing = [];
    if (!service) missing.push("serviciul");
    if (!state.date) missing.push("ziua");
    if (state.time === null) missing.push("ora");
    hint.textContent = missing.length
      ? `Mai ai de ales: ${joinRo(missing)}.`
      : done["step-details"]
        ? "Totul e pregătit. Trimite cererea!"
        : "Mai completează numele tău, telefonul și numele blănosului.";
  }

  function refresh() {
    renderCalendar();
    renderSlots();
    updateSummary();
  }

  function selectDate(date) {
    state.date = date;
    focusDate = date;
    calNote.textContent = defaultNote;
    refresh();
    calBody.querySelector(`[data-date="${iso(date)}"]`)?.focus({ preventScroll: true });
    if (window.innerWidth <= 860) {
      const box = slotsBox.getBoundingClientRect();
      if (box.top > window.innerHeight * 0.75 || box.bottom < 0) {
        slotsBox.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "center" });
      }
    }
  }

  calBody.addEventListener("click", (event) => {
    const button = event.target.closest(".cal-day");
    if (!button) return;
    const status = button.dataset.state;
    if (status !== "available") {
      calNote.textContent = noteFor(status, parseIso(button.dataset.date));
      return;
    }
    selectDate(parseIso(button.dataset.date));
  });
  calBody.addEventListener("keydown", (event) => {
    const button = event.target.closest(".cal-day");
    if (!button) return;
    const current = parseIso(button.dataset.date);
    const weekday = (current.getDay() + 6) % 7;
    const moves = {
      ArrowLeft: () => addDays(current, -1),
      ArrowRight: () => addDays(current, 1),
      ArrowUp: () => addDays(current, -7),
      ArrowDown: () => addDays(current, 7),
      Home: () => addDays(current, -weekday),
      End: () => addDays(current, 6 - weekday),
      PageUp: () => addMonths(current, -1),
      PageDown: () => addMonths(current, 1),
    };
    if (!moves[event.key]) return;
    event.preventDefault();
    let next = moves[event.key]();
    const minNav = new Date(today.getFullYear(), today.getMonth(), 1);
    const maxNav = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);
    if (next < minNav) next = minNav;
    if (next > maxNav) next = maxNav;
    focusDate = next;
    if (next.getMonth() !== state.view.getMonth() || next.getFullYear() !== state.view.getFullYear()) {
      state.view = new Date(next.getFullYear(), next.getMonth(), 1);
    }
    renderCalendar();
    calBody.querySelector(`[data-date="${iso(next)}"]`)?.focus();
  });
  calPrev.addEventListener("click", () => {
    state.view = new Date(state.view.getFullYear(), state.view.getMonth() - 1, 1);
    focusDate = null;
    renderCalendar();
  });
  calNext.addEventListener("click", () => {
    state.view = new Date(state.view.getFullYear(), state.view.getMonth() + 1, 1);
    focusDate = null;
    renderCalendar();
  });

  booker.addEventListener("change", (event) => {
    const { name, value } = event.target;
    if (name === "pet") {
      state.pet = value;
      sizeGroup.hidden = value === "cat";
      renderServices();
    } else if (name === "size") {
      state.size = value;
      renderServices();
    } else if (name === "service") {
      state.service = value;
    } else if (name === "time") {
      state.time = Number(value);
      updateSummary();
      return;
    } else {
      return;
    }
    refresh();
  });
  booker.addEventListener("input", (event) => {
    if (event.target.matches(".field input")) {
      event.target.removeAttribute("aria-invalid");
      const error = $(`#${event.target.getAttribute("aria-describedby")}`);
      if (error) error.textContent = "";
    }
    updateSummary();
  });

  function setError(input, message) {
    input.setAttribute("aria-invalid", "true");
    $(`#${input.getAttribute("aria-describedby")}`).textContent = message;
  }
  function validateFields() {
    let first = null;
    const name = fields.name.value.trim();
    const phone = fields.phone.value.replace(/[\s.\-()/]/g, "");
    const petName = fields.petName.value.trim();
    if (name.length < 2) {
      setError(fields.name, "Spune-ne cum te numești.");
      first ||= fields.name;
    }
    if (!/^(?:(?:\+|00)?40|0)[2-37]\d{8}$/.test(phone) && !/^\+\d{8,15}$/.test(phone)) {
      setError(fields.phone, "Introdu un număr valid, de exemplu 0722 123 456.");
      first ||= fields.phone;
    }
    if (!petName) {
      setError(fields.petName, "Cum îl cheamă pe blănos?");
      first ||= fields.petName;
    }
    return first;
  }
  function flagStep(id, message) {
    const step = $(`#${id}`);
    step.classList.remove("attention");
    void step.offsetWidth;
    step.classList.add("attention");
    setTimeout(() => step.classList.remove("attention"), 1400);
    step.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
    if (message) {
      hint.textContent = message;
      showToast(message);
    }
  }

  function collect() {
    const service = currentService();
    const length = duration();
    const breed = fields.breed.value.trim();
    const notes = fields.notes.value.trim();
    const petLabel = state.pet === "cat" ? "pisică" : `câine, ${SIZES[state.size]}`;
    const data = {
      service: service.id,
      serviceName: service.name,
      pet: state.pet,
      size: state.pet === "cat" ? null : state.size,
      petLabel,
      petName: fields.petName.value.trim(),
      breed,
      date: iso(state.date),
      dateLabel: fmtDayYear.format(state.date),
      time: state.time,
      timeLabel: fmtTime(state.time),
      duration: length,
      name: fields.name.value.trim(),
      phone: fields.phone.value.trim(),
      notes,
    };
    data.message = [
      `Bună ziua! Aș dori o programare la ${SALON.name}.`,
      "",
      `Serviciu: ${data.serviceName}`,
      `Blănos: ${data.petName} (${petLabel}${breed ? `, ${breed}` : ""})`,
      `Ziua: ${data.dateLabel}`,
      `Ora: ${data.timeLabel} (durată estimată: aprox. ${fmtDuration(length)})`,
      `Nume: ${data.name}`,
      `Telefon: ${data.phone}`,
      notes ? `Observații: ${notes}` : null,
      "",
      "Mulțumesc!",
    ]
      .filter((line) => line !== null)
      .join("\n");
    return data;
  }

  function downloadIcs(data) {
    const start = parseIso(data.date);
    start.setHours(0, data.time, 0, 0);
    const end = new Date(start.getTime() + data.duration * 60000);
    const local = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
    const esc = (text) => String(text).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Arr Grooming Salon//Programari//RO",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@arrgrooming`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${local(start)}`,
      `DTEND:${local(end)}`,
      `SUMMARY:${esc(`Arr Grooming: ${data.serviceName} (${data.petName})`)}`,
      `LOCATION:${esc(SALON.address)}`,
      `DESCRIPTION:${esc(`Cerere de programare trimisă salonului. Se confirmă telefonic: ${SALON.phoneDisplay}.`)}`,
      "STATUS:TENTATIVE",
      "BEGIN:VALARM",
      "TRIGGER:-PT2H",
      "ACTION:DISPLAY",
      "DESCRIPTION:Programare la Arr Grooming",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "programare-arr-grooming.ics";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  let lastRequest = null;
  const whatsappLink = $("#bd-whatsapp");
  const smsLink = $("#bd-sms");
  const dialogTitle = $("#bd-title");
  const dialogDesc = $("#bd-desc");
  const dialogSummary = $("#bd-summary");

  function openDialog(data, delivered) {
    lastRequest = data;
    const text = encodeURIComponent(data.message);
    whatsappLink.href = `https://wa.me/${SALON.whatsapp}?text=${text}`;
    smsLink.href = `sms:${SALON.phone}?&body=${text}`;
    const rows = [
      ["Serviciu", data.serviceName],
      ["Blănos", `${data.petName} · ${data.petLabel}`],
      ["Ziua", capitalize(data.dateLabel)],
      ["Ora", `${data.timeLabel} · aprox. ${fmtDuration(data.duration)}`],
    ];
    dialogSummary.innerHTML = rows.map(([key, value]) => `<div><dt>${key}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
    if (delivered) {
      dialogTitle.innerHTML = "Cererea a ajuns <em>la noi.</em>";
      dialogDesc.textContent = "Te sunăm în curând să confirmăm ora și prețul. Dacă vrei, ne poți scrie și direct.";
    } else {
      dialogTitle.innerHTML = "Cererea ta e <em>gata de trimis.</em>";
      dialogDesc.textContent = "Alege cum ne trimiți detaliile. Programarea devine sigură după ce te sunăm să o confirmăm.";
    }
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      requestScrollUpdate();
    } else {
      window.open(whatsappLink.href, "_blank", "noopener");
    }
  }

  booker.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentService()) return flagStep("step-service", "Alege serviciul dorit.");
    if (!state.date) return flagStep("step-date", "Alege ziua programării.");
    if (state.time === null) return flagStep("step-date", "Alege ora programării.");
    const invalid = validateFields();
    if (invalid) {
      flagStep("step-details", "Verifică datele de contact.");
      setTimeout(() => invalid.focus({ preventScroll: true }), 350);
      return;
    }
    const data = collect();
    let delivered = false;
    if (SALON.bookingEndpoint) {
      const submit = $("button[type=submit]", booker);
      submit.disabled = true;
      try {
        const response = await fetch(SALON.bookingEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(data),
        });
        delivered = response.ok;
      } catch {}
      submit.disabled = false;
    }
    openDialog(data, delivered);
  });

  if (dialog) {
    $(".dialog-close", dialog).addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
      if (outside) dialog.close();
    });
    dialog.addEventListener("close", requestScrollUpdate);
    $("#bd-copy").addEventListener("click", async () => {
      if (!lastRequest) return;
      showToast((await copyText(lastRequest.message)) ? "Detaliile au fost copiate." : "Nu am putut copia automat.");
    });
    $("#bd-ics").addEventListener("click", () => {
      if (!lastRequest) return;
      downloadIcs(lastRequest);
      showToast("Evenimentul a fost descărcat pentru calendarul tău.");
    });
  }

  // "Alege acest serviciu" din lista de servicii
  $$("[data-pick-service]").forEach((button) => {
    button.addEventListener("click", () => {
      const service = SERVICES.find((item) => item.id === button.dataset.pickService);
      if (!service) return;
      if (!service.pets.includes(state.pet)) {
        state.pet = service.pets[0];
        $(`input[name="pet"][value="${state.pet}"]`, booker).checked = true;
        sizeGroup.hidden = state.pet === "cat";
      }
      state.service = service.id;
      renderServices();
      refresh();
      $("#step-pet").scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
      showToast(`Ai ales: ${service.name}. Acum alege ziua și ora.`);
    });
  });

  renderServices();
  refresh();
}
