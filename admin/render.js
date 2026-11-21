// Aplică conținutul editat în panou peste pagina site-ului (index.html).
// Rulează doar în panoul de administrare; site-ul public rămâne HTML static.

export const ICONS = [
  { id: "i-sparkle", label: "Steluță" },
  { id: "i-scissors", label: "Foarfecă" },
  { id: "i-clipper", label: "Mașină de tuns" },
  { id: "i-comb", label: "Pieptene" },
  { id: "i-bath", label: "Cadă / baie" },
  { id: "i-paw", label: "Lăbuță" },
  { id: "i-dog", label: "Câine" },
  { id: "i-cat", label: "Pisică" },
  { id: "i-palette", label: "Paletă de culori" },
  { id: "i-star", label: "Stea" },
];
export const COLORS = { pink: "#ee5fa7", sky: "#8ed3f2", sun: "#ffc845", violet: "#6b63d9" };
export const COLOR_LABELS = { pink: "Roz", sky: "Bleu", sun: "Galben", violet: "Violet" };
export const DAY_LONG = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"];
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_SHORT = ["D", "L", "Ma", "Mi", "J", "V", "S"];
const DAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const STEP_ICONS = ["i-paw", "i-calendar", "i-phone", "i-sparkle"];
export const DEFAULT_HERO_IMAGE = "assets/hero-dog.webp";

export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pad2 = (n) => String(n).padStart(2, "0");

export function get(object, path) {
  return path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), object);
}
function fill(template, context) {
  return template.replace(/\{([\w.]+)\}/g, (_, path) => {
    const value = get(context, path);
    return value == null ? "" : String(value);
  });
}
export function safeUrl(url) {
  const value = String(url || "").trim();
  if (!value) return false;
  if (/^(https?:|tel:|mailto:|#)/i.test(value)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(value);
}
export function slugify(text) {
  return (
    String(text || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "serviciu"
  );
}
export function normalizePhone(display) {
  let digits = String(display || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `40${digits.slice(1)}`;
  digits = digits.replace(/\D/g, "");
  return { tel: `+${digits}`, wa: digits };
}
export function hoursByDay(hours) {
  const map = {};
  for (const item of hours || []) map[item.day] = item;
  return map;
}
export function summarizeHours(hours, mode = "short") {
  const map = hoursByDay(hours);
  const groups = [];
  for (const day of DAY_ORDER) {
    const item = map[day] || { day, closed: true };
    const key = item.closed ? "closed" : `${item.open}-${item.close}`;
    const last = groups.at(-1);
    if (last && last.key === key) last.days.push(day);
    else groups.push({ key, days: [day], item });
  }
  const label = (days, names, separator) =>
    days.length === 1 ? names[days[0]] : `${names[days[0]]}${separator}${names[days.at(-1)]}`;
  if (mode === "short") {
    return groups
      .filter((group) => group.key !== "closed")
      .map((group) => `${label(group.days, DAY_SHORT, "–")} ${group.item.open}–${group.item.close}`)
      .join(" · ");
  }
  return groups.map(
    (group) => `${label(group.days, DAY_LONG, " – ")}: ${group.key === "closed" ? "închis" : `${group.item.open} – ${group.item.close}`}`,
  );
}

export function derive(content) {
  const contact = content.contact;
  const phone = normalizePhone(contact.phoneDisplay);
  const destination = encodeURIComponent(`${content.siteName}, ${contact.street}, ${contact.city}`);
  return {
    tel: phone.tel,
    wa: phone.wa,
    telHref: `tel:${phone.tel}`,
    waHref: `https://wa.me/${phone.wa}`,
    directions: `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
    hoursShort: summarizeHours(content.hours, "short"),
    hoursLines: summarizeHours(content.hours, "lines"),
    topAddress: `${contact.city} · ${contact.street}`,
    groomerInitial: (content.about.groomerName || "?").trim().charAt(0).toUpperCase(),
  };
}

function parseNumber(value) {
  const text = String(value || "").trim();
  if (!/^\d+([.,]\d+)?$/.test(text)) return null;
  const [, decimals = ""] = text.split(/[.,]/);
  return { n: Number(text.replace(",", ".")), decimals: decimals.length };
}
function setLines(doc, element, lines) {
  element.textContent = "";
  lines.forEach((line, index) => {
    if (index) element.appendChild(doc.createElement("br"));
    element.appendChild(doc.createTextNode(line));
  });
}
function setCount(element, value) {
  const number = parseNumber(value);
  if (!number) {
    element.removeAttribute("data-count");
    element.removeAttribute("data-decimals");
    return;
  }
  element.setAttribute("data-count", String(number.n));
  if (number.decimals) element.setAttribute("data-decimals", String(number.decimals));
  else element.removeAttribute("data-decimals");
}
function linkPhone(escapedText, content, derived) {
  const phone = esc(content.contact.phoneDisplay);
  if (!phone) return escapedText;
  return escapedText.split(phone).join(`<a href="${esc(derived.telHref)}">${phone}</a>`);
}
const icon = (id) => `<svg class="icon"><use href="#${esc(id)}"></use></svg>`;

const LISTS = {
  services(content) {
    return content.services
      .filter((service) => service.visible !== false)
      .map(
        (service, index) => `
          <details class="service" name="services"${index === 0 ? " open" : ""}>
            <summary>
              <span class="service-num">${pad2(index + 1)}</span>
              <span class="service-icon" aria-hidden="true">${icon(service.icon || "i-sparkle")}</span>
              <h3>${esc(service.name)}</h3>
              <span class="service-tag">${esc(service.tag)}</span>
              <span class="plus" aria-hidden="true"></span>
            </summary>
            <div class="service-content">
              <p>${esc(service.description)}</p>${
                service.bookable
                  ? `
              <button class="text-link" type="button" data-pick-service="${esc(service.id)}">Alege acest serviciu <svg class="icon" aria-hidden="true"><use href="#i-arrow"></use></svg></button>`
                  : ""
              }
            </div>
          </details>`,
      )
      .join("");
  },
  marquee(content) {
    const items = content.marquee.map((item) => String(item).trim()).filter(Boolean);
    if (!items.length) return "";
    let all = items;
    while (all.length < 8) all = all.concat(items);
    const list = (hidden) =>
      `<ul class="marquee-list"${hidden ? ' aria-hidden="true"' : ""}>${all
        .map((text, index) => `<li>${esc(text)}</li><li class="m-sep"${hidden ? "" : ' aria-hidden="true"'}>${icon(index % 2 ? "i-sparkle" : "i-paw")}</li>`)
        .join("")}</ul>`;
    return list(false) + list(true);
  },
  steps(content) {
    return content.process.steps
      .map(
        (step, index) => `
          <li class="step" data-reveal>
            <span class="step-icon" aria-hidden="true">${icon(STEP_ICONS[index % STEP_ICONS.length])}</span>
            <span class="step-num">Pasul ${index + 1}</span>
            <h3>${esc(step.title)}</h3>
            <p>${esc(step.text)}</p>
          </li>`,
      )
      .join("");
  },
  stats(content) {
    return content.about.stats
      .map((stat) => {
        const number = parseNumber(stat.value);
        const value = number
          ? `<span data-count="${number.n}"${number.decimals ? ` data-decimals="${number.decimals}"` : ""}>${esc(stat.value)}</span>`
          : esc(stat.value);
        const star = stat.star ? '<svg class="icon stat-star" aria-hidden="true"><use href="#i-star"></use></svg>' : "";
        const suffix = stat.suffix ? ` ${esc(stat.suffix)}` : "";
        return `
              <div class="stat" data-reveal>
                <strong>${value}${star}${suffix}</strong>
                <span>${esc(stat.label)}</span>
              </div>`;
      })
      .join("");
  },
  reels(content) {
    return content.social.reels
      .filter((reel) => safeUrl(reel.url))
      .map(
        (reel) => `
          <a class="reel tilt" data-reveal href="${esc(reel.url)}" target="_blank" rel="noopener" style="--a: ${COLORS[reel.colorA] || COLORS.pink}; --b: ${COLORS[reel.colorB] || COLORS.sky}">
            <span class="reel-art" aria-hidden="true">${icon(reel.icon || "i-sparkle")}</span>
            <span class="reel-play" aria-hidden="true">${icon("i-play")}</span>
            <span class="reel-meta"><small>Video TikTok</small><strong>${esc(reel.title)}</strong><span>${esc(reel.subtitle)}</span></span>
          </a>`,
      )
      .join("");
  },
  faq(content, derived) {
    return content.faq
      .filter((item) => item.q && item.a)
      .map(
        (item, index) => `
            <details class="faq-item" name="faq"${index === 0 ? " open" : ""}>
              <summary>${esc(item.q)}<span class="plus" aria-hidden="true"></span></summary>
              <div class="faq-content"><p>${linkPhone(esc(item.a), content, derived)}</p></div>
            </details>`,
      )
      .join("");
  },
  gallery(content) {
    return (content.gallery?.items || [])
      .map((item, index) => {
        const front = item.image
          ? `<img src="${esc(item.image)}" alt="${esc(item.alt || item.label)}" loading="lazy" decoding="async" draggable="false" />`
          : `<div class="g-soon"><span class="g-soon-icon" aria-hidden="true">${icon("i-camera")}</span><strong>Coming Soon</strong><span>Poze din salon, în curând</span></div>`;
        return `
          <figure class="g-card${item.image ? " has-image" : ""}" data-index="${index}">
            <div class="g-face g-front">
              ${front}
              <figcaption class="g-label">${esc(item.label)}</figcaption>
            </div>
            <div class="g-face g-back" aria-hidden="true"><img src="assets/logo-mark.svg" alt="" width="64" height="64" loading="lazy" /></div>
          </figure>`;
      })
      .join("");
  },
  hours(content) {
    const map = hoursByDay(content.hours);
    return DAY_ORDER.map((day) => {
      const item = map[day] || { closed: true };
      return `
                <div data-day="${day}"><span>${DAY_LONG[day]}</span><strong>${item.closed ? "Închis" : `${esc(item.open)} – ${esc(item.close)}`}</strong></div>`;
    }).join("");
  },
};

function structuredData(content, derived) {
  const contact = content.contact;
  const map = hoursByDay(content.hours);
  const groups = new Map();
  for (const day of DAY_ORDER) {
    const item = map[day];
    if (!item || item.closed) continue;
    const key = `${item.open}-${item.close}`;
    if (!groups.has(key)) groups.set(key, { opens: item.open, closes: item.close, days: [] });
    groups.get(key).days.push(DAY_EN[day]);
  }
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: content.siteName,
    description: content.seo.description,
    telephone: derived.tel,
    address: {
      "@type": "PostalAddress",
      streetAddress: `${contact.street}, ${contact.building}`,
      addressLocality: contact.city,
      postalCode: contact.postalCode,
      addressCountry: "RO",
    },
    openingHoursSpecification: [...groups.values()].map((group) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: group.days.length === 1 ? group.days[0] : group.days,
      opens: group.opens,
      closes: group.closes,
    })),
    sameAs: [contact.facebook, contact.instagram, contact.tiktok].filter(safeUrl),
  };
}
const jsonForScript = (value, indent) => JSON.stringify(value, null, indent).replace(/</g, "\\u003c");

export function readContent(doc) {
  const node = doc.getElementById("site-content");
  if (!node) throw new Error("Pagina nu conține datele editabile (site-content).");
  return JSON.parse(node.textContent);
}

export function renderDocument(doc, content) {
  const derived = derive(content);
  const context = { ...content, d: derived };

  doc.title = content.seo.title;
  doc.querySelector('meta[name="description"]')?.setAttribute("content", content.seo.description);
  doc.querySelector('meta[property="og:title"]')?.setAttribute("content", content.seo.title);
  doc.querySelector('meta[property="og:description"]')?.setAttribute("content", content.seo.description);

  const announcement = content.announcement || {};
  const showAnnouncement = Boolean(announcement.enabled && String(announcement.text || "").trim());
  doc.documentElement.classList.toggle("has-announcement", showAnnouncement);
  const bar = doc.querySelector("[data-cms-announcement]");
  if (bar) {
    if (showAnnouncement) {
      bar.removeAttribute("hidden");
      bar.innerHTML = safeUrl(announcement.link)
        ? `<a href="${esc(announcement.link)}"><span>${esc(announcement.text)}</span><svg class="icon" aria-hidden="true"><use href="#i-arrow"></use></svg></a>`
        : `<span>${esc(announcement.text)}</span>`;
    } else {
      bar.setAttribute("hidden", "");
      bar.innerHTML = "";
    }
  }

  doc.querySelectorAll("[data-cms]").forEach((element) => {
    const value = get(context, element.getAttribute("data-cms"));
    if (value == null) return;
    element.textContent = String(value);
    if (element.hasAttribute("data-count")) setCount(element, value);
  });
  doc.querySelectorAll("[data-cms-tpl]").forEach((element) => {
    element.textContent = fill(element.getAttribute("data-cms-tpl"), context);
  });
  doc.querySelectorAll("[data-cms-aria]").forEach((element) => {
    element.setAttribute("aria-label", fill(element.getAttribute("data-cms-aria"), context));
  });
  doc.querySelectorAll("[data-cms-copy]").forEach((element) => {
    element.setAttribute("data-copy", fill(element.getAttribute("data-cms-copy"), context));
  });

  const links = {
    tel: derived.telHref,
    whatsapp: derived.waHref,
    facebook: content.contact.facebook,
    instagram: content.contact.instagram,
    tiktok: content.contact.tiktok,
    maps: content.contact.mapsUrl,
    directions: derived.directions,
  };
  doc.querySelectorAll("[data-link]").forEach((element) => {
    const url = links[element.getAttribute("data-link")];
    if (safeUrl(url)) element.setAttribute("href", url);
  });

  const lines = {
    visitAddress: [content.contact.street, `${content.contact.building} · ${content.contact.city}`],
    footerSalon: [content.contact.street, `${content.contact.building}, ${content.contact.city}`, content.contact.landmark],
    footerProgram: derived.hoursLines,
  };
  doc.querySelectorAll("[data-cms-lines]").forEach((element) => {
    const list = lines[element.getAttribute("data-cms-lines")];
    if (list) setLines(doc, element, list.filter(Boolean));
  });

  doc.querySelectorAll("[data-cms-list]").forEach((element) => {
    const render = LISTS[element.getAttribute("data-cms-list")];
    if (render) element.innerHTML = `${render(content, derived)}\n        `;
  });

  const hero = content.hero;
  const isDefault = hero.image === DEFAULT_HERO_IMAGE;
  const image = doc.querySelector(".hero-dog");
  if (image) {
    image.setAttribute("src", hero.image);
    image.setAttribute("alt", hero.imageAlt || "");
    image.setAttribute("width", String(hero.imageWidth || 665));
    image.setAttribute("height", String(hero.imageHeight || 1280));
    if (isDefault) {
      image.setAttribute("srcset", "assets/hero-dog-sm.webp 400w, assets/hero-dog.webp 665w");
      image.setAttribute("sizes", "(max-width: 1023px) 40vw, 26vw");
    } else {
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
    }
  }
  const preload = doc.querySelector('link[rel="preload"][as="image"]');
  if (preload) {
    preload.setAttribute("href", hero.image);
    if (isDefault) {
      preload.setAttribute("imagesrcset", "assets/hero-dog-sm.webp 400w, assets/hero-dog.webp 665w");
      preload.setAttribute("imagesizes", "(max-width: 1023px) 40vw, 26vw");
    } else {
      preload.removeAttribute("imagesrcset");
      preload.removeAttribute("imagesizes");
    }
  }

  const ld = doc.querySelector('script[type="application/ld+json"]');
  if (ld) ld.textContent = `\n${jsonForScript(structuredData(content, derived), 2)}\n    `;
  const data = doc.getElementById("site-content");
  if (data) data.textContent = `\n${jsonForScript(content, 2)}\n    `;
  return doc;
}

export function serializeDocument(doc) {
  return `<!doctype html>\n${doc.documentElement.outerHTML}\n`;
}
