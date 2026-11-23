import {
  ICONS,
  COLOR_LABELS,
  DAY_LONG,
  DAY_ORDER,
  DEFAULT_HERO_IMAGE,
  get as getPath,
  normalizePhone,
  readContent,
  renderDocument,
  safeUrl,
  serializeDocument,
  summarizeHours,
} from "./render.js?v=20261123b";

/* ---------------------------------------------------------------------------
   Configurare
--------------------------------------------------------------------------- */
const params = new URLSearchParams(location.search);
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
const API = (isLocal && params.get("api")) || "https://api.github.com";
// Doar pentru teste locale: permite un fișier de autentificare separat.
const AUTH_URL = (isLocal && params.get("auth")) || "auth.json";
const SITE_URL = new URL("../", location.href).href;
const TOKEN_HELP_URL = "https://github.com/settings/personal-access-tokens/new";

const state = {
  auth: null,
  key: null,
  token: null,
  html: "",
  sha: null,
  content: null,
  originalJson: "",
  uploads: [],
  section: "start",
  busy: false,
  searching: false,
};

/* ---------------------------------------------------------------------------
   Utilitare
--------------------------------------------------------------------------- */
const app = document.getElementById("app");
const toastBox = document.getElementById("toast");
let toastTimer = 0;
function toast(message, kind = "") {
  toastBox.textContent = message;
  toastBox.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastBox.className = "toast"), 4200);
}
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
function icon(id, cls = "ic") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${id}`);
  svg.append(use);
  return svg;
}
function setPath(object, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  let target = object;
  for (const key of keys) {
    if (target[key] == null || typeof target[key] !== "object") target[key] = {};
    target = target[key];
  }
  target[last] = value;
}
const clone = (value) => JSON.parse(JSON.stringify(value));
const bytesToB64 = (bytes) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const b64ToBytes = (b64) => Uint8Array.from(atob(String(b64).replace(/\s/g, "")), (c) => c.charCodeAt(0));
const utf8ToB64 = (text) => bytesToB64(new TextEncoder().encode(text));
const b64ToUtf8 = (b64) => new TextDecoder().decode(b64ToBytes(b64));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function formatDate(iso) {
  return new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
function generatePassword(length = 12) {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%&*?"];
  const all = sets.join("");
  const random = (max) => {
    const buffer = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / max) * max;
    do crypto.getRandomValues(buffer);
    while (buffer[0] >= limit);
    return buffer[0] % max;
  };
  const chars = sets.map((set) => set[random(set.length)]);
  while (chars.length < length) chars.push(all[random(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/* ---------------------------------------------------------------------------
   Criptare: parola derivă o cheie; cheia decriptează tokenul GitHub
--------------------------------------------------------------------------- */
async function deriveBits(password, saltB64, iterations) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64ToBytes(saltB64), iterations }, material, 512);
  return new Uint8Array(bits);
}
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
const aesKey = (bytes) => crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
async function encryptText(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return { iv: bytesToB64(iv), data: bytesToB64(new Uint8Array(data)) };
}
async function decryptText(key, blob) {
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(blob.iv) }, key, b64ToBytes(blob.data));
  return new TextDecoder().decode(data);
}

/* ---------------------------------------------------------------------------
   GitHub
--------------------------------------------------------------------------- */
const repo = () => state.auth.repo;
async function gh(path, options = {}, token = state.token) {
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(`${API}${path}`, { cache: "no-store", ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.message || `GitHub a răspuns cu ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}
const contentsPath = (file) => `/repos/${repo().owner}/${repo().name}/contents/${file.split("/").map(encodeURIComponent).join("/")}`;
async function getFile(file, ref = repo().branch) {
  const data = await gh(`${contentsPath(file)}?ref=${encodeURIComponent(ref)}`);
  return { sha: data.sha, text: b64ToUtf8(data.content || "") };
}
async function putFile(file, base64, message, sha) {
  const body = { message, content: base64, branch: repo().branch };
  if (sha) body.sha = sha;
  return gh(contentsPath(file), { method: "PUT", body: JSON.stringify(body) });
}
function explainGitHubError(error) {
  if (error.status === 401) return "Tokenul GitHub nu mai este valid (poate a expirat). Conectează din nou site-ul din secțiunea Cont.";
  if (error.status === 403) return "Tokenul GitHub nu are voie să modifice site-ul. Verifică permisiunea Contents: Read and write.";
  if (error.status === 404) return "Repository-ul nu a fost găsit sau tokenul nu are acces la el.";
  if (error.status === 409) return "Site-ul a fost modificat între timp. Reîncarcă panoul și încearcă din nou.";
  if (error.status === 422) return "GitHub a refuzat modificarea. Reîncarcă panoul și încearcă din nou.";
  if (error instanceof TypeError) return "Nu există conexiune la internet sau GitHub nu răspunde.";
  return error.message || "A apărut o eroare neașteptată.";
}

/* ---------------------------------------------------------------------------
   Încărcare date
--------------------------------------------------------------------------- */
const DEFAULT_REPO = { owner: "Tibidinu1031", name: "arrgrooming", branch: "main" };
async function loadAuth() {
  if (AUTH_URL === "auth.json") {
    // Citit direct din GitHub, ca o parolă schimbată să fie valabilă imediat (GitHub Pages poate întârzia un minut).
    try {
      const data = await gh(`/repos/${DEFAULT_REPO.owner}/${DEFAULT_REPO.name}/contents/admin/auth.json?ref=${DEFAULT_REPO.branch}`, {}, null);
      return JSON.parse(b64ToUtf8(data.content));
    } catch {}
  }
  const response = await fetch(`${AUTH_URL}${AUTH_URL.includes("?") ? "&" : "?"}v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Nu am putut citi configurarea panoului (auth.json).");
  return response.json();
}
async function loadSite() {
  let html;
  let sha = null;
  if (state.token) {
    const file = await getFile("index.html");
    html = file.text;
    sha = file.sha;
  } else {
    const response = await fetch(`../index.html?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Nu am putut citi pagina site-ului.");
    html = await response.text();
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const content = applyDefaults(readContent(doc), doc);
  state.html = html;
  state.sha = sha;
  state.content = content;
  state.originalJson = JSON.stringify(content);
  state.uploads = [];
}
const pendingUploads = () => {
  const json = JSON.stringify(state.content || {});
  return state.uploads.filter((upload) => json.includes(upload.path));
};
const isDirty = () => pendingUploads().length > 0 || JSON.stringify(state.content) !== state.originalJson;
function changed() {
  const dirty = isDirty();
  document.body.classList.toggle("is-dirty", dirty);
  const pill = document.getElementById("dirty-pill");
  if (pill) pill.textContent = dirty ? "Modificări nepublicate" : "Totul este publicat";
}
window.addEventListener("beforeunload", (event) => {
  if (state.content && isDirty()) {
    event.preventDefault();
    event.returnValue = "";
  }
});

/* ---------------------------------------------------------------------------
   Autentificare
--------------------------------------------------------------------------- */
let failedAttempts = 0;
let lockedUntil = 0;

function renderLogin(message = "") {
  app.className = "login-view";
  app.replaceChildren();
  const userInput = el("input", { id: "login-user", name: "username", autocomplete: "username", required: true, autocapitalize: "none", spellcheck: "false" });
  const passInput = el("input", { id: "login-pass", name: "password", type: "password", autocomplete: "current-password", required: true });
  const show = el("button", { type: "button", class: "pass-toggle", "aria-label": "Arată parola", onClick: () => {
    const visible = passInput.type === "text";
    passInput.type = visible ? "password" : "text";
    show.setAttribute("aria-label", visible ? "Arată parola" : "Ascunde parola");
    show.classList.toggle("on", !visible);
  } }, icon("a-eye"));
  const error = el("p", { class: "login-error", role: "alert", text: message });
  const submit = el("button", { type: "submit", class: "btn btn-primary btn-block" }, "Intră în panou");
  const form = el(
    "form",
    { class: "login-card", novalidate: true, onSubmit: (event) => {
      event.preventDefault();
      login(userInput.value.trim(), passInput.value, error, submit);
    } },
    el("img", { src: "../assets/logo-mark.svg", alt: "", width: 72, height: 72, class: "login-logo" }),
    el("p", { class: "eyebrow", text: "Arr Grooming Salon" }),
    el("h1", { text: "Panou de administrare" }),
    el("p", { class: "muted", text: "Intră cu utilizatorul și parola primite ca să modifici textele, programul și serviciile de pe site." }),
    el("div", { class: "fld" }, el("label", { for: "login-user", text: "Utilizator" }), userInput),
    el("div", { class: "fld" }, el("label", { for: "login-pass", text: "Parolă" }), el("div", { class: "pass-wrap" }, passInput, show)),
    error,
    submit,
    el("a", { class: "login-back", href: "../" }, "Înapoi la site"),
  );
  app.append(el("div", { class: "login-bg", "aria-hidden": "true" }), form);
  userInput.focus();
}

async function login(user, password, errorBox, submit) {
  if (Date.now() < lockedUntil) {
    errorBox.textContent = `Prea multe încercări. Mai așteaptă ${Math.ceil((lockedUntil - Date.now()) / 1000)} secunde.`;
    return;
  }
  if (!user || !password) {
    errorBox.textContent = "Completează utilizatorul și parola.";
    return;
  }
  submit.disabled = true;
  submit.textContent = "Se verifică…";
  errorBox.textContent = "";
  try {
    const auth = await loadAuth();
    const bits = await deriveBits(password, auth.kdf.salt, auth.kdf.iterations);
    const ok = user === auth.user && sameBytes(bits.subarray(32), b64ToBytes(auth.verifier));
    if (!ok) {
      failedAttempts++;
      if (failedAttempts >= 5) {
        lockedUntil = Date.now() + 30000;
        failedAttempts = 0;
      }
      throw new Error("Utilizator sau parolă greșită.");
    }
    state.auth = auth;
    state.key = await aesKey(bits.subarray(0, 32));
    state.token = null;
    if (auth.token) {
      try {
        state.token = await decryptText(state.key, auth.token);
      } catch {
        state.token = null;
      }
    }
    submit.textContent = "Se încarcă site-ul…";
    await loadSite();
    renderApp();
    toast(state.token ? "Bine ai venit! Poți modifica și publica site-ul." : "Bine ai venit! Conectează o dată site-ul la GitHub ca să poți publica.");
  } catch (error) {
    errorBox.textContent = error.status ? explainGitHubError(error) : error.message;
    submit.disabled = false;
    submit.textContent = "Intră în panou";
  }
}
function logout() {
  if (isDirty() && !confirm("Ai modificări nepublicate. Ieși oricum? Modificările se pierd.")) return;
  state.auth = state.key = state.token = state.content = null;
  state.uploads = [];
  state.originalJson = "";
  document.body.classList.remove("is-dirty");
  renderLogin();
}

/* ---------------------------------------------------------------------------
   Elemente de formular
--------------------------------------------------------------------------- */
let uid = 0;
function field(label, control, { hint, wide, counter } = {}) {
  if (!control.id) control.id = `f-${++uid}`;
  const parts = [el("label", { for: control.id, text: label }), control];
  if (counter) parts.push(counter);
  if (hint) parts.push(el("p", { class: "fld-hint", text: hint }));
  return el("div", { class: `fld${wide ? " fld-wide" : ""}` }, parts);
}
function textInput(path, { multiline, max, placeholder, type = "text", onInput, required } = {}) {
  const control = multiline
    ? el("textarea", { rows: typeof multiline === "number" ? multiline : 3, maxlength: max, placeholder, required })
    : el("input", { type, maxlength: max, placeholder, required });
  control.value = getPath(state.content, path) ?? "";
  let counter = null;
  const updateCounter = () => {
    if (counter) counter.textContent = `${control.value.length} / ${max}`;
  };
  if (max) counter = el("span", { class: "fld-count" });
  control.addEventListener("input", () => {
    setPath(state.content, path, control.value);
    updateCounter();
    changed();
    onInput?.(control.value);
  });
  updateCounter();
  return { control, counter };
}
function text(path, label, options = {}) {
  const { control, counter } = textInput(path, options);
  return field(label, control, { hint: options.hint, wide: options.wide ?? Boolean(options.multiline), counter });
}
function toggle(path, label, { hint, onChange } = {}) {
  const input = el("input", { type: "checkbox", class: "switch-input" });
  input.checked = Boolean(getPath(state.content, path));
  input.addEventListener("change", () => {
    setPath(state.content, path, input.checked);
    changed();
    onChange?.(input.checked);
  });
  if (!input.id) input.id = `f-${++uid}`;
  return el(
    "div",
    { class: "fld fld-wide fld-switch" },
    el("label", { class: "switch", for: input.id }, input, el("span", { class: "switch-ui", "aria-hidden": "true" }), el("span", { text: label })),
    hint && el("p", { class: "fld-hint", text: hint }),
  );
}
function select(path, label, options, { hint, onChange } = {}) {
  const control = el("select", {}, options.map(([value, text]) => el("option", { value, text })));
  control.value = String(getPath(state.content, path) ?? "");
  control.addEventListener("change", () => {
    const raw = control.value;
    setPath(state.content, path, options.some(([value]) => typeof value === "number") ? Number(raw) : raw);
    changed();
    onChange?.(raw);
  });
  return field(label, control, { hint });
}
function number(path, label, { min = 0, max = 999, step = 1, hint, allowEmpty } = {}) {
  const control = el("input", { type: "number", min, max, step, inputmode: "numeric" });
  const value = getPath(state.content, path);
  control.value = value ?? "";
  control.addEventListener("input", () => {
    const parsed = control.value === "" ? (allowEmpty ? null : 0) : Math.min(max, Math.max(min, Number(control.value)));
    setPath(state.content, path, parsed);
    changed();
  });
  return field(label, control, { hint });
}
function card(title, description, ...children) {
  return el("section", { class: "card" }, el("div", { class: "card-head" }, el("h2", { text: title }), description && el("p", { class: "muted", text: description })), el("div", { class: "card-body" }, children));
}
function grid(...children) {
  return el("div", { class: "grid" }, children);
}
function note(textValue, kind = "") {
  return el("p", { class: `note ${kind}`, text: textValue });
}
function listEditor({ path, itemTitle, create, renderItem, min = 0, max = 30, addLabel = "Adaugă", reorder = true }) {
  const wrap = el("div", { class: "list" });
  const draw = () => {
    const items = getPath(state.content, path);
    wrap.replaceChildren();
    items.forEach((item, index) => {
      const heading = el("strong", { text: itemTitle(item, index) });
      const retitle = () => (heading.textContent = itemTitle(item, index));
      const tools = el("div", { class: "list-tools" });
      if (reorder) {
        tools.append(
          el("button", { type: "button", class: "icon-btn", "aria-label": "Mută mai sus", disabled: index === 0, onClick: () => {
            [items[index - 1], items[index]] = [items[index], items[index - 1]];
            changed();
            draw();
          } }, icon("a-up")),
          el("button", { type: "button", class: "icon-btn", "aria-label": "Mută mai jos", disabled: index === items.length - 1, onClick: () => {
            [items[index + 1], items[index]] = [items[index], items[index + 1]];
            changed();
            draw();
          } }, icon("a-down")),
        );
      }
      tools.append(
        el("button", { type: "button", class: "icon-btn danger", "aria-label": "Șterge", disabled: items.length <= min, onClick: () => {
          if (!confirm(`Ștergi „${itemTitle(item, index)}”?`)) return;
          items.splice(index, 1);
          changed();
          draw();
        } }, icon("a-trash")),
      );
      wrap.append(el("div", { class: "list-item" }, el("div", { class: "list-head" }, el("span", { class: "list-num", text: String(index + 1) }), heading, tools), el("div", { class: "list-body grid" }, renderItem(`${path}.${index}`, item, retitle))));
    });
    if (items.length < max) {
      wrap.append(el("button", { type: "button", class: "btn btn-ghost btn-add", onClick: () => {
        items.push(create());
        changed();
        draw();
        wrap.querySelector(".list-item:last-of-type input, .list-item:last-of-type textarea")?.focus();
      } }, icon("a-plus"), addLabel));
    }
  };
  draw();
  return wrap;
}

/* ---------------------------------------------------------------------------
   Câmpurile site-ului, secțiune cu secțiune, în ordinea de pe pagină
--------------------------------------------------------------------------- */
const F = (path, label, options = {}) => ({ path, label, ...options });
const keep = (...names) => `Păstrează ${names.join(" și ")}: acolo se completează automat.`;
const fold = (value) => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const squash = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const SECTIONS = [
  { id: "start", label: "Început", icon: "a-home", render: renderStart },

  { id: "announcement", group: "Pagina, de sus în jos", label: "Anunț", icon: "a-megaphone", cards: [
    { title: "Anunț pe site", desc: "O bandă roz, afișată deasupra meniului, pe toate dispozitivele. Utilă pentru concedii, sărbători sau oferte.", fields: [
      F("announcement.enabled", "Afișează anunțul pe site", { kind: "toggle" }),
      F("announcement.text", "Textul anunțului", { max: 110, wide: true, opt: true, placeholder: "Ex.: Între 24 și 26 decembrie salonul este închis. Sărbători fericite!" }),
      F("announcement.link", "Link (opțional)", { wide: true, type: "url", opt: true, placeholder: "Ex.: #programari sau https://…", hint: "Dacă pui un link, anunțul devine clicabil. Pentru secțiunea de programări scrie #programari." }),
    ] },
  ] },

  { id: "header", label: "Meniu și antet", icon: "a-menu", cards: [
    { title: "Numele salonului", desc: "Apare lângă logo, sus și în subsol.", fields: [
      F("header.brandMain", "Numele, prima parte", { max: 20 }),
      F("header.brandAccent", "Numele, partea roz", { max: 20 }),
      F("header.brandTagline", "Textul mic de sub nume", { max: 32 }),
      F("siteName", "Numele complet al salonului", { max: 50, hint: "Folosit la Facebook, în subsol, în mesajele de programare și pentru Google." }),
    ] },
    { title: "Meniul", desc: "Linkurile din meniul de sus și din subsol.", fields: [
      F("header.navAbout", "Link spre Despre noi", { max: 20 }),
      F("header.navServices", "Link spre Servicii", { max: 20 }),
      F("header.navBooking", "Link spre Programări", { max: 20 }),
      F("header.navReviews", "Link spre Recenzii", { max: 20 }),
      F("header.navContact", "Link spre Contact", { max: 20 }),
      F("header.navTiktok", "Link spre TikTok (în subsol)", { max: 20 }),
      F("header.cta", "Butonul de programare", { max: 24, hint: "Același text apare sus, în subsol și în bara de jos de pe telefon." }),
    ] },
    { title: "Deschis sau închis acum", desc: "Mesajul din bara de sus și de pe poza din prima pagină. Ora se calculează singură din program.", fields: [
      F("status.openUntil", "Când salonul e deschis", { def: "Deschis acum · până la {ora}", max: 60, hint: keep("{ora}") }),
      F("status.closedToday", "Închis, dar se deschide azi", { def: "Închis acum · deschidem azi la {ora}", max: 60, hint: keep("{ora}") }),
      F("status.opensToday", "Varianta scurtă, pe poză", { def: "Deschidem azi la {ora}", max: 40, hint: keep("{ora}") }),
      F("status.closedNext", "Închis, se deschide în altă zi", { def: "Închis acum · deschidem {cand} la {ora}", max: 60, hint: keep("{cand}", "{ora}") }),
      F("status.opensNext", "Varianta scurtă, pe poză", { def: "Deschidem {cand} la {ora}", max: 40, hint: keep("{cand}", "{ora}") }),
      F("status.tomorrow", "Cuvântul pentru ziua de mâine", { def: "mâine", max: 12 }),
      F("status.closed", "Când nu există program", { def: "Închis", max: 20 }),
    ], after: () => [note("Adresa și orele din bara de sus se iau automat din secțiunile Contact și Program și zile libere.")] },
  ] },

  { id: "hero", label: "Prima pagină", icon: "a-star", cards: [
    { title: "Texte", desc: "Primul lucru pe care îl vede un vizitator.", fields: [
      F("hero.eyebrow", "Eticheta de deasupra titlului", { max: 60, wide: true }),
      F("hero.titleLine1", "Titlu, primul rând", { max: 28 }),
      F("hero.titleLine2", "Titlu, al doilea rând", { max: 18 }),
      F("hero.titleAccent", "Cuvântul evidențiat (roz, subliniat)", { max: 16 }),
      F("hero.button", "Textul butonului", { max: 28 }),
      F("hero.lead", "Descriere sub titlu", { multi: 3, max: 220 }),
      F("hero.callSmall", "Text mic deasupra telefonului", { max: 24 }),
      F("hero.ratingSuffix", "Text după notă", { def: "pe Google", max: 20, hint: "Ex.: 5,0 pe Google. Nota se schimbă în Recenzii și întrebări." }),
      F("hero.ratingSmall", "Text sub notă", { max: 40 }),
      F("hero.chip", "Eticheta de pe imagine", { max: 24 }),
      F("hero.badgeText", "Textul din insigna rotundă", { max: 40, hint: "Se scrie în cerc, cu majuscule. Ține-l la aproximativ 30 de caractere." }),
    ], after: () => [note("Titlul se adaptează automat ca să încapă în ecran. Păstrează-l scurt: 3-5 cuvinte arată cel mai bine.")] },
    { title: "Imaginea principală", desc: "Cel mai bine arată o poză decupată (fundal transparent, PNG sau WebP), în format vertical.", render: heroImageEditor, fields: [], hiddenFields: [F("hero.imageAlt", "Descrierea imaginii")] },
  ] },

  { id: "marquee", label: "Banda cu servicii", icon: "a-lines", cards: [
    { title: "Textele care se derulează", desc: "Banda colorată de sub prima pagină. Ordinea de aici este ordinea de pe site.", render: () => [el("div", { class: "chips-editor" }, marqueeEditor())], find: () => state.content.marquee },
  ] },

  { id: "about", label: "Despre noi", icon: "a-heart", cards: [
    { title: "Texte", fields: [
      F("about.label", "Eticheta secțiunii", { max: 30 }),
      F("about.title", "Titlu", { max: 40 }),
      F("about.titleMuted", "Subtitlu (gri)", { max: 40 }),
      F("about.lead", "Paragraf principal", { multi: 3, max: 260 }),
      F("about.text", "Paragraf secundar", { multi: 4, max: 420 }),
      F("about.link", "Linkul de sub text", { max: 40 }),
    ] },
    { title: "Groomerul și ilustrația", fields: [
      F("about.groomerName", "Numele groomerului", { max: 30 }),
      F("about.groomerRole", "Descriere groomer", { max: 110 }),
      F("about.artCaption1", "Textul de pe ilustrație, rândul 1", { max: 30 }),
      F("about.artCaption2", "Textul de pe ilustrație, rândul 2", { max: 30 }),
    ] },
    { title: "Cifrele din dreapta", desc: "Trei casete cu numere care se animă când apar pe ecran.", render: statsEditor, find: () => state.content.about.stats.flatMap((stat) => [stat.value, stat.suffix, stat.label]) },
  ] },

  { id: "gallery", label: "Galerie foto", icon: "a-image", cards: [
    { title: "Texte", fields: [
      F("gallery.eyebrow", "Eticheta de deasupra titlului", { max: 30 }),
      F("gallery.title", "Titlu", { max: 50 }),
      F("gallery.text", "Text explicativ", { multi: 2, max: 180 }),
      F("gallery.hint", "Indicația de sub raft", { max: 40 }),
      F("gallery.soonTitle", "Titlul cartonașelor fără poză", { def: "Coming Soon", max: 24 }),
      F("gallery.soonText", "Textul cartonașelor fără poză", { def: "Poze din salon, în curând", max: 40 }),
    ] },
    { title: "Cartonașele (raftul 3D)", desc: "Cartonașele se rotesc ca un raft. Cele fără poză afișează textul de mai sus până încarci una.", render: galleryEditor, find: () => state.content.gallery.items.flatMap((item) => [item.label, item.alt]) },
  ] },

  { id: "services", label: "Servicii", icon: "a-scissors", cards: [
    { title: "Texte", fields: [
      F("servicesSection.label", "Eticheta secțiunii", { max: 30 }),
      F("servicesSection.sideLabel", "Textul vertical din lateral", { max: 30 }),
      F("servicesSection.title", "Titlu", { max: 40 }),
      F("servicesSection.accent", "Titlu, partea roz", { max: 40 }),
      F("servicesSection.text", "Text explicativ", { multi: 2, max: 180 }),
      F("servicesSection.pickLabel", "Butonul de sub fiecare serviciu", { def: "Alege acest serviciu", max: 30 }),
      F("booking.messages.servicePicked", "Mesajul după ce apasă butonul", { def: "Ai ales: {serviciu}. Acum alege ziua și ora.", max: 90, wide: true, hint: keep("{serviciu}") }),
    ] },
    { title: "Lista de servicii", desc: "Ordinea de aici este ordinea de pe site. Serviciile marcate „apare în calendar” pot fi alese la programarea online.", render: servicesEditor, find: () => state.content.services.flatMap((service) => [service.name, service.tag, service.description, service.short]) },
  ] },

  { id: "process", label: "Cum funcționează", icon: "a-steps", cards: [
    { title: "Texte", fields: [
      F("process.label", "Eticheta secțiunii", { max: 30 }),
      F("process.sideLabel", "Textul vertical din lateral", { max: 30 }),
      F("process.title", "Titlu", { max: 40 }),
      F("process.accent", "Titlu, partea roz", { max: 40 }),
      F("process.stepWord", "Cuvântul dinaintea numărului", { def: "Pasul", max: 12, hint: "Ex.: Pasul 1, Pasul 2…" }),
      F("process.link", "Linkul de sub pași", { max: 40 }),
    ] },
    { title: "Cei patru pași", render: stepsEditor, find: () => state.content.process.steps.flatMap((step) => [step.title, step.text]) },
  ] },

  { id: "booking", label: "Programări online", icon: "a-calendar", cards: [
    { title: "Titlul secțiunii", fields: [
      F("booking.label", "Eticheta secțiunii", { max: 30 }),
      F("booking.sideLabel", "Textul vertical din lateral", { max: 30 }),
      F("booking.title", "Titlu", { max: 40 }),
      F("booking.accent", "Titlu, partea roz", { max: 40 }),
      F("booking.text", "Text explicativ", { multi: 2, max: 180 }),
    ] },
    { title: "Pasul 1: blănosul", fields: [
      F("booking.form.step1", "Titlul pasului", { max: 40 }),
      F("booking.form.dog", "Butonul pentru câine", { max: 16 }),
      F("booking.form.cat", "Butonul pentru pisică", { max: 16 }),
      F("booking.form.sizeLabel", "Întrebarea despre talie", { max: 40 }),
      F("booking.form.small", "Talie mică", { max: 16 }),
      F("booking.form.smallHint", "Talie mică, explicație", { max: 24 }),
      F("booking.form.medium", "Talie medie", { max: 16 }),
      F("booking.form.mediumHint", "Talie medie, explicație", { max: 24 }),
      F("booking.form.large", "Talie mare", { max: 16 }),
      F("booking.form.largeHint", "Talie mare, explicație", { max: 24 }),
    ] },
    { title: "Pașii 2 și 3: serviciul, ziua și ora", fields: [
      F("booking.form.step2", "Titlul pasului 2", { max: 40 }),
      F("booking.form.step3", "Titlul pasului 3", { max: 40 }),
      F("booking.messages.pickDay", "Titlu până se alege o zi", { max: 50 }),
      F("booking.messages.pickDaySub", "Text până se alege o zi", { max: 120, wide: true }),
      F("booking.messages.pickService", "Text când nu e ales serviciul", { def: "Alege și serviciul, ca să-ți arătăm orele potrivite duratei lui.", max: 120, wide: true }),
      F("booking.messages.slotsFor", "Text deasupra orelor", { def: "Ore de început pentru {serviciu}, aprox. {durata}.", max: 120, wide: true, hint: keep("{serviciu}", "{durata}") }),
      F("booking.messages.noSlots", "Când nu mai sunt ore libere", { def: "Nu mai sunt ore potrivite în această zi. Alege altă zi.", max: 120, wide: true }),
      F("booking.messages.slotGone", "Când ora aleasă nu se mai potrivește", { def: "Ora aleasă nu se mai potrivește. Te rugăm să alegi alta.", max: 120, wide: true }),
    ] },
    { title: "Mesajele de sub calendar", desc: "Apar sub calendar, în funcție de ziua pe care apasă vizitatorul.", fields: [
      F("booking.calendar.closedDays", "Zilele în care salonul e închis", { def: "{zile} salonul este închis.", max: 80, hint: keep("{zile}") + " Ex.: Duminica salonul este închis." }),
      F("booking.calendar.openDaily", "Dacă salonul e deschis zilnic", { def: "Salonul este deschis în fiecare zi.", max: 80 }),
      F("booking.calendar.horizon", "Cu cât timp înainte se poate programa", { def: "Poți trimite cereri cu până la {zile} de zile înainte.", max: 100, wide: true, hint: keep("{zile}") }),
      F("booking.calendar.pickOther", "Îndemnul de a alege altă zi", { def: "Alege altă zi.", max: 40 }),
      F("booking.calendar.past", "O zi care a trecut", { def: "Ziua aceasta a trecut. Alege o zi din viitor.", max: 100 }),
      F("booking.calendar.full", "O zi fără ore libere", { def: "Pentru această zi nu mai sunt ore potrivite. Alege altă zi.", max: 100, wide: true }),
      F("booking.calendar.holiday", "O zi liberă", { def: "În această zi salonul este închis. Alege altă zi.", max: 100, wide: true }),
      F("booking.calendar.holidayReason", "O zi liberă cu motiv", { def: "În această zi salonul este închis ({motiv}). Alege altă zi.", max: 100, wide: true, hint: keep("{motiv}") + " Motivul se scrie la Program și zile libere." }),
    ] },
    { title: "Pasul 4: datele de contact", fields: [
      F("booking.form.step4", "Titlul pasului 4", { max: 40 }),
      F("booking.form.name", "Câmpul pentru nume", { max: 30 }),
      F("booking.form.phone", "Câmpul pentru telefon", { max: 30 }),
      F("booking.form.phonePlaceholder", "Exemplul din câmpul de telefon", { max: 20, opt: true }),
      F("booking.form.petName", "Câmpul pentru numele blănosului", { max: 30 }),
      F("booking.form.breed", "Câmpul pentru rasă", { max: 30 }),
      F("booking.form.notes", "Câmpul pentru observații", { max: 30 }),
      F("booking.form.notesPlaceholder", "Exemplul din câmpul de observații", { max: 90, wide: true, opt: true }),
      F("booking.form.optional", "Eticheta pentru câmpurile opționale", { max: 20 }),
      F("booking.messages.errName", "Eroare: lipsește numele", { def: "Spune-ne cum te numești.", max: 80 }),
      F("booking.messages.errPhone", "Eroare: telefon greșit", { def: "Introdu un număr valid, de exemplu 0722 123 456.", max: 80 }),
      F("booking.messages.errPet", "Eroare: lipsește numele blănosului", { def: "Cum îl cheamă pe blănos?", max: 80 }),
    ] },
    { title: "Rezumatul din dreapta", desc: "Caseta care arată ce s-a ales și butonul de trimitere.", fields: [
      F("booking.summary.eyebrow", "Eticheta de sus", { max: 30 }),
      F("booking.summary.title", "Titlu", { max: 40 }),
      F("booking.summary.pet", "Rândul pentru blănos", { max: 20 }),
      F("booking.summary.service", "Rândul pentru serviciu", { max: 20 }),
      F("booking.summary.duration", "Rândul pentru durată", { max: 20 }),
      F("booking.summary.date", "Rândul pentru zi", { max: 20 }),
      F("booking.summary.time", "Rândul pentru oră", { max: 20 }),
      F("booking.summary.submit", "Butonul de trimitere", { max: 30 }),
      F("booking.summary.note", "Textul mic de sub buton", { multi: 2, max: 200 }),
      F("booking.summary.call", "Linkul de apel", { max: 40 }),
      F("booking.messages.missing", "Ce mai e de ales", { def: "Mai ai de ales:", max: 40, hint: "Urmează automat lista: serviciul, ziua, ora." }),
      F("booking.messages.needDetails", "Când lipsesc datele de contact", { def: "Mai completează numele tău, telefonul și numele blănosului.", max: 100, wide: true }),
      F("booking.messages.ready", "Când totul este completat", { def: "Totul e pregătit. Trimite cererea!", max: 60 }),
      F("booking.messages.needService", "La trimitere fără serviciu", { def: "Alege serviciul dorit.", max: 60 }),
      F("booking.messages.needDay", "La trimitere fără zi", { def: "Alege ziua programării.", max: 60 }),
      F("booking.messages.needTime", "La trimitere fără oră", { def: "Alege ora programării.", max: 60 }),
      F("booking.messages.checkDetails", "La trimitere cu date greșite", { def: "Verifică datele de contact.", max: 60 }),
    ] },
    { title: "Fereastra de după trimitere", desc: "Apare după ce vizitatorul apasă butonul de trimitere.", fields: [
      F("booking.dialog.eyebrow", "Eticheta de sus", { max: 30 }),
      F("booking.dialog.title", "Titlu", { max: 30 }),
      F("booking.dialog.accent", "Titlu, partea roz", { max: 30 }),
      F("booking.dialog.desc", "Text", { multi: 2, max: 180 }),
      F("booking.dialog.sentTitle", "Titlu, când cererea a ajuns automat", { def: "Cererea a ajuns", max: 30, hint: "Doar dacă folosești adresa automată de la Reguli pentru calendar." }),
      F("booking.dialog.sentAccent", "Titlu, partea roz, când cererea a ajuns", { def: "la noi.", max: 30 }),
      F("booking.dialog.sentDesc", "Text, când cererea a ajuns", { def: "Te sunăm în curând să confirmăm ora și prețul. Dacă vrei, ne poți scrie și direct.", multi: 2, max: 180 }),
      F("booking.dialog.whatsapp", "Butonul WhatsApp", { max: 30 }),
      F("booking.dialog.whatsappHint", "Butonul WhatsApp, explicație", { max: 40 }),
      F("booking.dialog.sms", "Butonul SMS", { max: 30 }),
      F("booking.dialog.smsHint", "Butonul SMS, explicație", { max: 40 }),
      F("booking.dialog.call", "Butonul de apel", { max: 30 }),
      F("booking.dialog.copy", "Butonul de copiere", { max: 30 }),
      F("booking.dialog.ics", "Butonul de calendar", { max: 30 }),
      F("booking.messages.copied", "Mesaj: detaliile au fost copiate", { def: "Detaliile au fost copiate.", max: 60 }),
      F("booking.messages.copyFailed", "Mesaj: copierea nu a mers", { def: "Nu am putut copia automat.", max: 60 }),
      F("booking.messages.icsDone", "Mesaj: evenimentul a fost descărcat", { def: "Evenimentul a fost descărcat pentru calendarul tău.", max: 80 }),
    ] },
    { title: "Mesajul trimis pe WhatsApp sau SMS", desc: "Serviciul, blănosul, ziua și ora se completează automat între salut și mulțumire.", fields: [
      F("booking.messages.greeting", "Salutul de la început", { def: "Bună ziua! Aș dori o programare la {salon}.", max: 100, wide: true, hint: keep("{salon}") }),
      F("booking.messages.waName", "Eticheta pentru nume", { def: "Nume", max: 20 }),
      F("booking.messages.waPhone", "Eticheta pentru telefon", { def: "Telefon", max: 20 }),
      F("booking.messages.waNotes", "Eticheta pentru observații", { def: "Observații", max: 20 }),
      F("booking.messages.thanks", "Mulțumirea de la final", { def: "Mulțumesc!", max: 40 }),
    ] },
    { title: "Reguli pentru calendar", desc: "Orele propuse în calendar pornesc de la programul salonului și de la durata fiecărui serviciu.", fields: [
      F("booking.slotStep", "Din cât în cât propunem ore", { kind: "select", options: [[15, "La 15 minute"], [30, "La 30 de minute"], [45, "La 45 de minute"], [60, "La o oră"]] }),
      F("booking.leadMinutes", "Cu câte minute înainte se poate programa cineva azi", { kind: "number", range: [0, 1440, 15] }),
      F("booking.horizonDays", "Cu câte zile în avans se poate programa", { kind: "number", range: [7, 365, 1] }),
    ], advanced: [
      F("booking.endpoint", "Adresă care primește automat cererile (opțional)", { wide: true, type: "url", opt: true, hint: "Lasă gol dacă nu folosești un serviciu de formulare. Cererile se trimit oricum pe WhatsApp sau SMS." }),
    ] },
  ] },

  { id: "social", label: "TikTok", icon: "a-play", cards: [
    { title: "Texte", fields: [
      F("social.label", "Eticheta secțiunii", { max: 30 }),
      F("social.title", "Titlu", { max: 40 }),
      F("social.accent", "Titlu, partea roz", { max: 40 }),
      F("social.text", "Text explicativ", { multi: 2, max: 180 }),
      F("social.followSmall", "Text mic deasupra profilului", { max: 40 }),
      F("social.reelLabel", "Eticheta de pe fiecare videoclip", { def: "Video TikTok", max: 20 }),
    ], after: () => [note("Linkul și numele profilului se schimbă în secțiunea Contact.")] },
    { title: "Videoclipuri recomandate", desc: "Deschide videoclipul pe TikTok, apasă Distribuie, apoi Copiază linkul și lipește-l aici.", render: reelsEditor, find: () => state.content.social.reels.flatMap((reel) => [reel.title, reel.subtitle, reel.url]) },
  ] },

  { id: "reviews", label: "Recenzii și întrebări", icon: "a-chat", cards: [
    { title: "Recenzia", desc: "Caseta închisă la culoare cu nota și o recenzie reală.", fields: [
      F("reviews.label", "Eticheta secțiunii", { max: 30 }),
      F("reviews.sideLabel", "Textul vertical din lateral", { max: 30 }),
      F("reviews.score", "Nota", { max: 4, hint: "Ex.: 5,0" }),
      F("reviews.outOf", "Text după notă", { max: 12 }),
      F("reviews.subtitle", "Text sub stele", { max: 80 }),
      F("reviews.quote", "Recenzia citată (fără ghilimele)", { multi: 2, max: 200 }),
      F("reviews.author", "Autorul recenziei", { max: 50, hint: "Ex.: Alina S. · recenzie pe Google" }),
      F("reviews.link", "Linkul către recenzii", { max: 40 }),
    ] },
    { title: "Întrebări frecvente", desc: "Numărul de telefon scris în răspunsuri devine automat link de apel.", fields: [
      F("reviews.faqTitle", "Titlu", { max: 40 }),
      F("reviews.faqAccent", "Titlu, partea roz", { max: 40 }),
    ], render: faqEditor, find: () => state.content.faq.flatMap((item) => [item.q, item.a]) },
  ] },

  { id: "contact", label: "Contact", icon: "a-phone", cards: [
    { title: "Texte", fields: [
      F("contactSection.label", "Eticheta secțiunii", { max: 30 }),
      F("contactSection.title", "Titlu", { max: 40 }),
      F("contactSection.accent", "Titlu, partea roz", { max: 40 }),
      F("contactSection.text", "Text explicativ", { multi: 2, max: 160 }),
      F("contactSection.findUs", "Eticheta de deasupra adresei", { max: 30 }),
      F("contactSection.directions", "Butonul de indicații", { max: 30 }),
      F("contactSection.mapButton", "Butonul de pe hartă", { max: 30 }),
      F("contactSection.closedLabel", "Cuvântul pentru zilele închise", { def: "Închis", max: 16 }),
      F("contactSection.closedDaysTitle", "Titlul listei de zile libere", { def: "Zile în care salonul este închis", max: 50 }),
      F("contactSection.copied", "Mesaj: numărul a fost copiat", { def: "Numărul a fost copiat.", max: 50 }),
      F("contactSection.copyFallback", "Mesaj: copierea nu a mers", { def: "Numărul nostru: {telefon}", max: 50, hint: keep("{telefon}") }),
    ] },
    { title: "Telefon și adresă", desc: "Apar în bara de sus, la contact, în subsol și în mesajele de programare.", fields: [
      F("contact.phoneDisplay", "Telefon (cum apare pe site)", { kind: "phone", max: 20 }),
      F("contact.street", "Stradă și număr", { max: 50 }),
      F("contact.building", "Bloc, scară, etaj", { max: 40, opt: true }),
      F("contact.city", "Oraș", { max: 30 }),
      F("contact.country", "Țara", { def: "România", max: 30 }),
      F("contact.postalCode", "Cod poștal", { max: 10, opt: true }),
      F("contact.landmark", "Reper", { max: 50, opt: true, hint: "Ex.: Lângă Salonul Ciufulix" }),
      F("contact.mapsUrl", "Link Google Maps", { wide: true, type: "url", opt: true, hint: "Deschide salonul în Google Maps, apasă Distribuie și copiază linkul aici." }),
    ] },
    { title: "Rețele sociale", fields: [
      F("contact.facebook", "Pagina de Facebook", { wide: true, type: "url", opt: true }),
      F("contact.instagram", "Profilul de Instagram", { type: "url", opt: true }),
      F("contact.instagramHandle", "Numele de Instagram", { max: 30, opt: true, placeholder: "@…" }),
      F("contact.tiktok", "Profilul de TikTok", { type: "url", opt: true }),
      F("contact.tiktokHandle", "Numele de TikTok", { max: 30, opt: true, placeholder: "@…" }),
    ] },
  ] },

  { id: "footer", label: "Subsol", icon: "a-layout", cards: [
    { title: "Texte", fields: [
      F("footer.tagline", "Slogan", { max: 30 }),
      F("footer.taglineAccent", "Slogan, partea roz", { max: 30 }),
      F("footer.salonHeading", "Titlul coloanei cu adresa", { max: 24 }),
      F("footer.programHeading", "Titlul coloanei cu programul", { max: 24 }),
      F("footer.contactHeading", "Titlul coloanei de contact", { max: 24 }),
      F("footer.navHeading", "Titlul coloanei cu linkuri", { max: 24 }),
      F("footer.bottom", "Text mic din dreapta jos", { max: 40 }),
      F("footer.backTop", "Linkul de întoarcere sus", { max: 24 }),
    ] },
  ] },

  { id: "hours", group: "Setări", label: "Program și zile libere", icon: "a-clock", cards: [
    { title: "Programul săptămânal", desc: "Folosit peste tot pe site: bara de sus, contact, subsol, statusul „deschis acum” și orele din calendar.", render: hoursEditor },
    { title: "Zile libere", desc: "Concedii și sărbători. În aceste zile calendarul nu acceptă programări, iar pe site apare o listă cu zilele în care salonul e închis.", render: closedDatesEditor, find: () => state.content.closedDates.flatMap((item) => [item.date, item.note]) },
  ] },

  { id: "seo", label: "Google și distribuire", icon: "a-search", cards: [
    { title: "Google și distribuire", desc: "Cum apare site-ul în căutările Google și când e trimis pe Facebook sau WhatsApp.", fields: [
      F("seo.title", "Titlul paginii", { max: 70, wide: true }),
      F("seo.description", "Descrierea paginii", { multi: 3, max: 160 }),
    ], after: () => [googlePreview()] },
  ] },

  { id: "history", label: "Istoric versiuni", icon: "a-history", render: renderHistory },
  { id: "account", label: "Cont și conectare", icon: "a-user", render: renderAccount },
];

const fieldEntries = () =>
  SECTIONS.flatMap((section) =>
    (section.cards || []).flatMap((cardDef, cardIndex) =>
      [...(cardDef.fields || []), ...(cardDef.advanced || []), ...(cardDef.hiddenFields || [])].map((fieldDef) => ({ section, cardDef, cardIndex, field: fieldDef })),
    ),
  );

// Completează în date textele care încă nu au fost salvate niciodată din panou:
// întâi textul exact de pe pagină, apoi textele implicite ale mesajelor din calendar.
function applyDefaults(content, ...docs) {
  for (const doc of docs) {
    if (!doc) continue;
    doc.querySelectorAll("[data-cms]").forEach((node) => {
      const path = node.getAttribute("data-cms");
      if (path.startsWith("d.") || getPath(content, path) !== undefined) return;
      setPath(content, path, squash(node.textContent));
    });
    doc.querySelectorAll("[data-cms-placeholder]").forEach((node) => {
      const path = node.getAttribute("data-cms-placeholder");
      if (getPath(content, path) !== undefined) return;
      setPath(content, path, node.getAttribute("placeholder") || "");
    });
  }
  for (const { field: fieldDef } of fieldEntries()) {
    if (fieldDef.def !== undefined && getPath(content, fieldDef.path) === undefined) setPath(content, fieldDef.path, fieldDef.def);
  }
  return content;
}

function renderField(fieldDef) {
  const { path, label, kind, hint } = fieldDef;
  if (kind === "toggle") return toggle(path, label, { hint });
  if (kind === "select") return select(path, label, fieldDef.options, { hint });
  if (kind === "number") {
    const [min, max, step] = fieldDef.range;
    return number(path, label, { min, max, step, hint });
  }
  if (kind === "phone") return phoneField(fieldDef);
  return text(path, label, { max: fieldDef.max, multiline: fieldDef.multi, type: fieldDef.type, hint, wide: fieldDef.wide, placeholder: fieldDef.placeholder });
}
function renderCard(section, cardDef, cardIndex) {
  const fields = cardDef.fields || [];
  const node = card(
    cardDef.title,
    cardDef.desc,
    fields.length ? grid(fields.map(renderField)) : null,
    cardDef.render ? cardDef.render() : null,
    cardDef.advanced ? el("details", { class: "advanced" }, el("summary", { text: "Avansat" }), grid(cardDef.advanced.map(renderField))) : null,
    cardDef.after ? cardDef.after() : null,
  );
  node.id = `card-${section.id}-${cardIndex}`;
  return node;
}
function renderSectionCards(section) {
  const cards = section.cards.map((cardDef, index) => renderCard(section, cardDef, index));
  if (cards.length < 4) return cards;
  const toc = el("nav", { class: "toc", "aria-label": "Părțile secțiunii" },
    section.cards.map((cardDef, index) =>
      el("button", { type: "button", class: "toc-link", onClick: () => cards[index].scrollIntoView({ behavior: "smooth", block: "start" }) }, cardDef.title),
    ),
  );
  return [toc, ...cards];
}

function phoneField(fieldDef) {
  const phoneHint = el("p", { class: "fld-hint" });
  const updatePhone = () => {
    const phone = normalizePhone(getPath(state.content, fieldDef.path) || "");
    phoneHint.textContent = `Link de apel: ${phone.tel} · WhatsApp: wa.me/${phone.wa}`;
  };
  const { control, counter } = textInput(fieldDef.path, { max: fieldDef.max, onInput: updatePhone });
  updatePhone();
  const box = field(fieldDef.label, control, { counter });
  box.append(phoneHint);
  return box;
}

/* ---------- Editoare speciale ---------- */
function heroImageEditor() {
  const hero = state.content.hero;
  const preview = el("img", { class: "hero-preview", alt: "Imaginea din prima pagină" });
  const pending = () => state.uploads.find((upload) => upload.path === hero.image);
  const refresh = () => {
    preview.src = pending()?.dataUrl || `../${hero.image}`;
    reset.hidden = hero.image === DEFAULT_HERO_IMAGE;
  };
  const fileInput = el("input", { type: "file", accept: "image/png,image/webp,image/jpeg", class: "visually-hidden", id: "hero-file" });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const upload = await prepareImage(file);
      state.uploads = state.uploads.filter((item) => !item.path.startsWith("assets/uploads/hero-"));
      state.uploads.push(upload);
      hero.image = upload.path;
      hero.imageWidth = upload.width;
      hero.imageHeight = upload.height;
      changed();
      refresh();
      toast("Imaginea a fost pregătită. Apasă Previzualizează ca s-o vezi pe site.");
    } catch (error) {
      toast(error.message, "error");
    }
    fileInput.value = "";
  });
  const reset = el("button", { type: "button", class: "btn btn-ghost btn-small", onClick: () => {
    hero.image = DEFAULT_HERO_IMAGE;
    hero.imageWidth = 665;
    hero.imageHeight = 1280;
    state.uploads = state.uploads.filter((item) => !item.path.startsWith("assets/uploads/hero-"));
    changed();
    refresh();
  } }, "Revino la imaginea inițială");
  refresh();
  return [
    el("div", { class: "hero-image" },
      el("div", { class: "hero-preview-box" }, preview),
      el("div", { class: "hero-image-actions" },
        el("label", { class: "btn btn-primary", for: "hero-file" }, icon("a-upload"), "Încarcă altă imagine"),
        fileInput,
        reset,
        text("hero.imageAlt", "Descrierea imaginii", { max: 120, wide: true, hint: "Pentru persoanele care folosesc cititoare de ecran și pentru Google. Ex.: Un cățel alb, proaspăt tuns." }),
      ),
    ),
  ];
}

async function prepareImage(file, { maxWidth = 1100, maxHeight = 1400, prefix = "hero" } = {}) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Alege o imagine PNG, JPG sau WebP.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Imaginea este prea mare (maximum 15 MB).");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxHeight / bitmap.height, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  let blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  let extension = "webp";
  if (!blob || blob.type !== "image/webp") {
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    extension = "png";
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  return { path: `assets/uploads/${prefix}-${Date.now()}.${extension}`, base64: bytesToB64(bytes), dataUrl, width, height };
}

function galleryImageField(path, item, retitle = () => {}) {
  const box = el("div", { class: "fld fld-wide gallery-field" });
  const fileInput = el("input", { type: "file", accept: "image/png,image/webp,image/jpeg", class: "visually-hidden" });
  if (!fileInput.id) fileInput.id = `f-${++uid}`;
  const draw = () => {
    const pending = state.uploads.find((upload) => upload.path === item.image);
    const soon = getPath(state.content, "gallery.soonTitle") || "Coming Soon";
    const thumb = item.image
      ? el("img", { class: "gallery-thumb", src: pending?.dataUrl || `../${item.image}`, alt: "" })
      : el("span", { class: "gallery-thumb soon" }, el("strong", { text: soon }));
    const remove = item.image
      ? el("button", { type: "button", class: "btn btn-ghost btn-small", onClick: () => {
          state.uploads = state.uploads.filter((upload) => upload.path !== item.image);
          item.image = "";
          changed();
          draw();
          retitle();
        } }, "Scoate poza")
      : null;
    box.replaceChildren(
      el("p", { class: "fld-label", text: "Poza" }),
      el("div", { class: "gallery-field-row" }, thumb, el("div", { class: "actions" }, el("label", { class: "btn btn-primary btn-small", for: fileInput.id }, icon("a-upload"), item.image ? "Schimbă poza" : "Încarcă o poză"), remove)),
      el("p", { class: "fld-hint", text: `Fără poză, cartonașul afișează „${soon}”. Cel mai bine arată pozele verticale.` }),
      fileInput,
    );
  };
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const upload = await prepareImage(file, { maxWidth: 900, maxHeight: 1125, prefix: "galerie" });
      state.uploads = state.uploads.filter((existing) => existing.path !== item.image);
      state.uploads.push(upload);
      item.image = upload.path;
      changed();
      draw();
      retitle();
      toast("Poza a fost pregătită. Apasă Previzualizează ca s-o vezi pe raft.");
    } catch (error) {
      toast(error.message, "error");
    }
    fileInput.value = "";
  });
  draw();
  return box;
}

function galleryEditor() {
  return [
    listEditor({
      path: "gallery.items",
      min: 3,
      max: 12,
      addLabel: "Adaugă un cartonaș",
      itemTitle: (item) => `${item.label || "Cartonaș"}${item.image ? "" : " · fără poză"}`,
      create: () => ({ label: "Poză nouă", image: "", alt: "" }),
      renderItem: (path, item, retitle) => [
        text(`${path}.label`, "Eticheta de pe cartonaș", { max: 30, onInput: retitle }),
        text(`${path}.alt`, "Descrierea pozei (pentru Google)", { max: 120 }),
        galleryImageField(path, item, retitle),
      ],
    }),
  ];
}

function statsEditor() {
  return [
    listEditor({
      path: "about.stats",
      min: 3,
      max: 3,
      reorder: false,
      itemTitle: (item) => `${item.value}${item.suffix ? ` ${item.suffix}` : ""}`,
      create: () => ({ value: "1", suffix: "", star: false, label: "" }),
      renderItem: (path, item, retitle) => [
        text(`${path}.value`, "Număr", { max: 6, onInput: retitle, hint: "Ex.: 5,0 sau 6" }),
        text(`${path}.suffix`, "Cuvânt după număr (opțional)", { max: 12, onInput: retitle }),
        text(`${path}.label`, "Explicație", { max: 70, wide: true }),
        toggle(`${path}.star`, "Afișează o steluță lângă număr"),
      ],
    }),
  ];
}

function servicesEditor() {
  const durationFields = (path, item) => {
    const box = el("div", { class: "fld fld-wide durations" });
    const draw = () => {
      box.replaceChildren(el("p", { class: "fld-label", text: "Durată estimativă în calendar (minute)" }));
      const row = el("div", { class: "grid grid-4" });
      if (item.pets.includes("dog")) {
        row.append(number(`${path}.duration.small`, "Câine talie mică", { min: 10, max: 480, step: 5, allowEmpty: true }));
        row.append(number(`${path}.duration.medium`, "Câine talie medie", { min: 10, max: 480, step: 5, allowEmpty: true }));
        row.append(number(`${path}.duration.large`, "Câine talie mare", { min: 10, max: 480, step: 5, allowEmpty: true }));
      }
      if (item.pets.includes("cat")) row.append(number(`${path}.duration.cat`, "Pisică", { min: 10, max: 480, step: 5, allowEmpty: true }));
      if (!item.pets.length) row.append(note("Bifează câini și/sau pisici ca să poți seta durata."));
      box.append(row);
    };
    draw();
    return { box, draw };
  };
  const petChecks = (path, item, onChange) => {
    const make = (pet, label) => {
      const input = el("input", { type: "checkbox" });
      input.checked = item.pets.includes(pet);
      input.addEventListener("change", () => {
        item.pets = input.checked ? [...new Set([...item.pets, pet])] : item.pets.filter((value) => value !== pet);
        changed();
        onChange();
      });
      return el("label", { class: "check" }, input, el("span", { text: label }));
    };
    return el("div", { class: "fld fld-wide" }, el("p", { class: "fld-label", text: "Pentru cine este serviciul" }), el("div", { class: "checks" }, make("dog", "Câini"), make("cat", "Pisici")));
  };
  return [
    listEditor({
      path: "services",
      min: 1,
      max: 12,
      addLabel: "Adaugă un serviciu",
      itemTitle: (item) => item.name || "Serviciu nou",
      create: () => ({ id: `serviciu-${Date.now().toString(36)}`, name: "Serviciu nou", tag: "", description: "", icon: "i-sparkle", visible: true, bookable: true, pets: ["dog"], short: "", duration: { small: 60, medium: 60, large: 60, cat: null } }),
      renderItem: (path, item, retitle) => {
        const durations = durationFields(path, item);
        return [
          text(`${path}.name`, "Numele serviciului", { max: 40, onInput: retitle }),
          text(`${path}.tag`, "Eticheta din dreapta", { max: 24, hint: "Ex.: Cel mai cerut" }),
          text(`${path}.description`, "Descriere pe site", { multiline: 3, max: 320 }),
          select(`${path}.icon`, "Pictogramă", ICONS.map((option) => [option.id, option.label])),
          text(`${path}.short`, "Descriere scurtă în calendar", { max: 60 }),
          toggle(`${path}.visible`, "Afișează serviciul pe site"),
          toggle(`${path}.bookable`, "Apare în calendarul de programări"),
          petChecks(path, item, durations.draw),
          durations.box,
        ];
      },
    }),
  ];
}

function marqueeEditor() {
  return listEditor({
    path: "marquee",
    min: 1,
    max: 14,
    addLabel: "Adaugă un text",
    itemTitle: (item) => item || "Text nou",
    create: () => "Text nou",
    renderItem: (path, item, retitle) => [text(path, "Text", { max: 30, onInput: retitle, wide: true })],
  });
}

function stepsEditor() {
  const word = () => getPath(state.content, "process.stepWord") || "Pasul";
  return [
    listEditor({
      path: "process.steps",
      min: 4,
      max: 4,
      reorder: false,
      itemTitle: (item, index) => `${word()} ${index + 1}: ${item.title}`,
      create: () => ({ title: "", text: "" }),
      renderItem: (path, item, retitle) => [text(`${path}.title`, "Titlu", { max: 32, onInput: retitle }), text(`${path}.text`, "Text", { multiline: 2, max: 150 })],
    }),
  ];
}

function hoursEditor() {
  const table = el("div", { class: "hours-editor" });
  const summary = el("p", { class: "note ok" });
  const updateSummary = () => (summary.textContent = `Pe site va apărea: ${summarizeHours(state.content.hours, "short") || "salon închis"}`);
  const times = [];
  for (let minutes = 5 * 60; minutes <= 23 * 60; minutes += 15) times.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  const timeSelect = (value, label) => {
    const control = el("select", { "aria-label": label }, times.map((time) => el("option", { value: time, text: time })));
    if (!times.includes(value)) control.prepend(el("option", { value, text: value }));
    control.value = value;
    return control;
  };
  DAY_ORDER.forEach((day) => {
    const item = state.content.hours.find((entry) => entry.day === day);
    const open = timeSelect(item.open, `${DAY_LONG[day]}, ora de deschidere`);
    const close = timeSelect(item.close, `${DAY_LONG[day]}, ora de închidere`);
    const isOpen = el("input", { type: "checkbox", class: "switch-input", id: `day-${day}` });
    isOpen.checked = !item.closed;
    const stateText = el("span", { class: "switch-text" });
    const sync = () => {
      open.disabled = close.disabled = item.closed;
      stateText.textContent = item.closed ? "Închis" : "Deschis";
      row.classList.toggle("is-closed", item.closed);
      const invalid = !item.closed && item.open >= item.close;
      row.classList.toggle("is-invalid", invalid);
      updateSummary();
    };
    open.addEventListener("change", () => {
      item.open = open.value;
      changed();
      sync();
    });
    close.addEventListener("change", () => {
      item.close = close.value;
      changed();
      sync();
    });
    isOpen.addEventListener("change", () => {
      item.closed = !isOpen.checked;
      changed();
      sync();
    });
    const row = el("div", { class: "hours-row" },
      el("strong", { text: DAY_LONG[day] }),
      el("label", { class: "switch", for: `day-${day}` }, isOpen, el("span", { class: "switch-ui", "aria-hidden": "true" }), stateText),
      el("div", { class: "hours-times" }, open, el("span", { text: "-" }), close),
    );
    table.append(row);
    sync();
  });
  return [table, summary];
}

function closedDatesEditor() {
  return [
    listEditor({
      path: "closedDates",
      max: 60,
      addLabel: "Adaugă o zi liberă",
      itemTitle: (item) => (item.date ? new Intl.DateTimeFormat("ro-RO", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${item.date}T12:00`)) : "Zi nouă"),
      create: () => ({ date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), note: "" }),
      renderItem: (path, item, retitle) => [text(`${path}.date`, "Data", { type: "date", onInput: retitle }), text(`${path}.note`, "Motiv (opțional)", { max: 40, placeholder: "Ex.: Crăciun" })],
    }),
    note("Sfat: zilele trecute pot fi șterse oricând; oricum nu mai apar pe site."),
  ];
}

function reelsEditor() {
  const colors = Object.entries(COLOR_LABELS);
  return [
    listEditor({
      path: "social.reels",
      min: 1,
      max: 8,
      addLabel: "Adaugă un videoclip",
      itemTitle: (item) => item.title || "Videoclip nou",
      create: () => ({ title: "Videoclip nou", subtitle: "", url: "https://www.tiktok.com/@arrgrooming.salon", icon: "i-scissors", colorA: "pink", colorB: "sky" }),
      renderItem: (path, item, retitle) => [
        text(`${path}.title`, "Titlu", { max: 30, onInput: retitle }),
        text(`${path}.subtitle`, "Subtitlu", { max: 45 }),
        text(`${path}.url`, "Link către videoclip", { wide: true, type: "url" }),
        select(`${path}.icon`, "Pictogramă", ICONS.map((option) => [option.id, option.label])),
        select(`${path}.colorA`, "Culoare sus", colors),
        select(`${path}.colorB`, "Culoare jos", colors),
      ],
    }),
  ];
}

function faqEditor() {
  return [
    listEditor({
      path: "faq",
      min: 1,
      max: 15,
      addLabel: "Adaugă o întrebare",
      itemTitle: (item) => item.q || "Întrebare nouă",
      create: () => ({ q: "Întrebare nouă", a: "" }),
      renderItem: (path, item, retitle) => [text(`${path}.q`, "Întrebarea", { max: 80, wide: true, onInput: retitle }), text(`${path}.a`, "Răspunsul", { multiline: 3, max: 400 })],
    }),
  ];
}

function googlePreview() {
  const box = el("div", { class: "serp" });
  const draw = () => {
    box.replaceChildren(el("span", { class: "serp-url", text: SITE_URL.replace(/^https?:\/\//, "") }), el("strong", { text: state.content.seo.title }), el("p", { text: state.content.seo.description }));
  };
  draw();
  document.addEventListener("input", () => box.isConnected && draw());
  return el("div", { class: "fld fld-wide" }, el("p", { class: "fld-label", text: "Previzualizare în Google" }), box);
}

/* ---------- Pagina de început ---------- */
function renderStart() {
  const connected = Boolean(state.token);
  const shortcut = (id, title, description) =>
    el("button", { type: "button", class: "shortcut", onClick: () => openSection(id) }, el("strong", { text: title }), el("span", { text: description }));
  const total = fieldEntries().length;
  return [
    el("div", { class: "hello" },
      el("div", {}, el("p", { class: "eyebrow", text: "Bine ai venit" }), el("h1", { text: "Ce vrei să schimbi azi pe site?" }), el("p", { class: "muted", text: "Fiecare text de pe site are câmpul lui, grupat pe secțiuni în ordinea de pe pagină. Modifică ce vrei, apoi apasă „Previzualizează” ca să vezi rezultatul și „Publică” ca să apară pe site." })),
      el("img", { src: "../assets/logo-mark.svg", alt: "", width: 110, height: 110 }),
    ),
    connected
      ? note("Site-ul este conectat la GitHub. Modificările publicate apar pe site în aproximativ un minut.", "ok")
      : el("div", { class: "note warn" }, el("p", { text: "Site-ul nu este încă conectat la GitHub, așa că poți modifica și previzualiza, dar nu poți publica. Conectarea se face o singură dată." }), el("button", { type: "button", class: "btn btn-small", onClick: () => openSection("account") }, "Conectează acum")),
    card("Caută orice text", `Scrie câteva cuvinte din textul pe care vrei să-l schimbi (de exemplu „deschis acum” sau „WhatsApp”) și îți arătăm câmpul potrivit. Panoul are ${total} de câmpuri, plus listele de servicii, poze, întrebări și videoclipuri.`,
      el("div", { class: "actions" }, el("button", { type: "button", class: "btn btn-primary btn-small", onClick: () => document.getElementById("field-search")?.focus() }, icon("a-search"), "Caută un text")),
    ),
    card("Scurtături", "Cele mai frecvente modificări.",
      el("div", { class: "shortcuts" },
        shortcut("hours", "Schimbă programul", "Orele pe zile și zilele libere"),
        shortcut("announcement", "Pune un anunț", "O bandă vizibilă sus pe site"),
        shortcut("services", "Editează serviciile", "Nume, descrieri și durate"),
        shortcut("hero", "Prima pagină", "Titlul, textele și poza principală"),
        shortcut("booking", "Textele programărilor", "Formularul, calendarul și mesajele"),
        shortcut("contact", "Telefon și adresă", "Datele de contact și rețelele"),
        shortcut("gallery", "Poze din salon", "Raftul 3D din Despre noi"),
        shortcut("history", "Revino la o versiune", "Dacă ai greșit ceva"),
      ),
    ),
    card("Cum funcționează", null,
      el("ol", { class: "how" },
        el("li", {}, el("strong", { text: "Modifici" }), " textele în secțiunile din stânga. Nimic nu se schimbă pe site până nu publici."),
        el("li", {}, el("strong", { text: "Previzualizezi" }), " pagina exact cum va arăta, pe calculator, tabletă sau telefon."),
        el("li", {}, el("strong", { text: "Publici" }), ". Site-ul se actualizează singur în aproximativ un minut."),
      ),
    ),
  ];
}

/* ---------- Căutare ---------- */
function renderSearch(query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const hit = (...values) => {
    const haystack = fold(values.flat().join(" "));
    return words.every((word) => haystack.includes(word));
  };
  const groups = new Map();
  const add = (section, cardIndex, payload) => {
    const key = `${section.id}:${cardIndex}`;
    if (!groups.has(key)) groups.set(key, { section, cardDef: section.cards[cardIndex], cardIndex, fields: [], listHit: null });
    const group = groups.get(key);
    if (payload.listHit) group.listHit = payload.listHit;
    else group.fields.push(payload);
  };
  const shorten = (value) => (value.length > 60 ? `${value.slice(0, 57)}…` : value);
  for (const { section, cardDef, cardIndex, field: fieldDef } of fieldEntries()) {
    if (hit(section.label, cardDef.title, fieldDef.label, fieldDef.hint, getPath(state.content, fieldDef.path))) add(section, cardIndex, fieldDef);
  }
  SECTIONS.forEach((section) => {
    (section.cards || []).forEach((cardDef, cardIndex) => {
      if (!cardDef.find) return;
      const values = cardDef.find().filter(Boolean).map(String);
      if (!hit(section.label, cardDef.title, cardDef.desc, values)) return;
      const matched = values.filter((value) => words.some((word) => fold(value).includes(word)));
      add(section, cardIndex, { listHit: matched.slice(0, 3).map((value) => `„${shorten(squash(value))}”`) });
    });
  });
  const total = [...groups.values()].reduce((sum, group) => sum + group.fields.length + (group.listHit ? 1 : 0), 0);
  const results = [...groups.values()].map((group) =>
    el("section", { class: "card search-hit" },
      el("div", { class: "card-head" },
        el("p", { class: "crumb", text: `${group.section.label} › ${group.cardDef.title}` }),
        el("button", { type: "button", class: "btn btn-ghost btn-small", onClick: () => openSection(group.section.id, true, group.cardIndex) }, "Deschide secțiunea"),
      ),
      group.fields.length ? el("div", { class: "card-body" }, grid(group.fields.map(renderField))) : null,
      group.listHit
        ? el("div", { class: "card-body" }, note(`${group.listHit.length ? `Găsit în listă: ${group.listHit.join(", ")}. ` : ""}Deschide secțiunea ca să modifici lista.`))
        : null,
    ),
  );
  return [
    el("div", { class: "search-head" },
      el("h1", { class: "section-title", text: "Căutare" }),
      el("button", { type: "button", class: "btn btn-ghost btn-small", onClick: () => {
        document.body.classList.add("nav-open");
        document.getElementById("field-search")?.focus();
      } }, icon("a-search"), "Caută altceva"),
    ),
    el("p", { class: "muted search-count", text: total ? `${total} ${total === 1 ? "rezultat" : "rezultate"} pentru „${query.trim()}”. Poți modifica direct de aici.` : `Niciun câmp nu conține „${query.trim()}”. Încearcă alt cuvânt.` }),
    ...results,
  ];
}
let searchTimer = 0;
function onSearchInput(event, now = false) {
  clearTimeout(searchTimer);
  const query = event.target.value;
  const run = () => {
    if (fold(query).trim().length < 2) {
      if (state.searching) {
        state.searching = false;
        openSection(state.section, false);
      }
      return;
    }
    state.searching = true;
    document.querySelectorAll(".side-link").forEach((link) => link.setAttribute("aria-current", "false"));
    const main = document.getElementById("content");
    main.replaceChildren(...renderSearch(query));
    main.scrollTop = 0;
    window.scrollTo(0, 0);
  };
  if (now) run();
  else searchTimer = setTimeout(run, 160);
}

function renderHistory() {
  const list = el("div", { class: "history" }, el("p", { class: "muted", text: "Se încarcă istoricul…" }));
  (async () => {
    try {
      const commits = await gh(`/repos/${repo().owner}/${repo().name}/commits?path=index.html&sha=${encodeURIComponent(repo().branch)}&per_page=15`);
      list.replaceChildren();
      if (!commits.length) list.append(note("Nu există versiuni anterioare."));
      commits.forEach((commit, index) => {
        list.append(
          el("div", { class: "history-item" },
            el("div", {}, el("strong", { text: commit.commit.message.split("\n")[0] }), el("span", { class: "muted", text: `${formatDate(commit.commit.author.date)} · ${commit.commit.author.name}` })),
            index === 0
              ? el("span", { class: "pill ok", text: "Versiunea actuală" })
              : el("button", { type: "button", class: "btn btn-ghost btn-small", onClick: () => restoreVersion(commit) }, "Încarcă în editor"),
          ),
        );
      });
    } catch (error) {
      list.replaceChildren(note(explainGitHubError(error), "error"));
    }
  })();
  return [card("Istoric versiuni", "Fiecare publicare păstrează o versiune. Dacă ai greșit ceva, încarcă o versiune mai veche în editor, verific-o și publică din nou.", list)];
}
async function restoreVersion(commit) {
  if (isDirty() && !confirm("Ai modificări nepublicate. Le înlocuiești cu versiunea aleasă?")) return;
  try {
    const file = await getFile("index.html", commit.sha);
    const doc = new DOMParser().parseFromString(file.text, "text/html");
    // Versiunile vechi nu au toate câmpurile; ce lipsește se ia de pe pagina actuală.
    state.content = applyDefaults(readContent(doc), doc, new DOMParser().parseFromString(state.html, "text/html"));
    state.uploads = [];
    changed();
    toast(`Am încărcat versiunea din ${formatDate(commit.commit.author.date)}. Verific-o și apasă Publică.`);
    openSection("start");
  } catch (error) {
    toast(error.status ? explainGitHubError(error) : "Versiunea aleasă nu poate fi încărcată în panou (este mai veche decât panoul).", "error");
  }
}

function renderAccount() {
  const connected = Boolean(state.token);
  const tokenInput = el("input", { type: "password", autocomplete: "off", spellcheck: "false", placeholder: "github_pat_…" });
  const connectButton = el("button", { type: "button", class: "btn btn-primary" }, connected ? "Înlocuiește tokenul" : "Conectează site-ul");
  connectButton.addEventListener("click", () => connectGitHub(tokenInput.value.trim(), connectButton));

  const newPass = el("input", { type: "text", autocomplete: "new-password", spellcheck: "false" });
  const confirmPass = el("input", { type: "text", autocomplete: "new-password", spellcheck: "false" });
  const generate = el("button", { type: "button", class: "btn btn-ghost btn-small", onClick: () => {
    newPass.value = confirmPass.value = generatePassword(12);
    toast("Am generat o parolă nouă. Noteaz-o înainte să salvezi.");
  } }, "Generează o parolă");
  const saveButton = el("button", { type: "button", class: "btn btn-primary", disabled: !connected }, "Schimbă parola");
  saveButton.addEventListener("click", () => changePassword(newPass.value, confirmPass.value, saveButton));

  return [
    card("Conectarea la GitHub", "Site-ul este găzduit gratuit pe GitHub. Ca panoul să poată publica, are nevoie o singură dată de o cheie de acces (token), pe care o păstrează criptată cu parola ta.",
      connected
        ? note(`Conectat la ${repo().owner}/${repo().name}. Poți publica modificări.`, "ok")
        : note("Neconectat. Poți modifica și previzualiza, dar nu poți publica.", "warn"),
      el("ol", { class: "how" },
        el("li", {}, "Intră în contul GitHub al site-ului și deschide ", el("a", { href: TOKEN_HELP_URL, target: "_blank", rel: "noopener" }, "pagina de creare a unui token"), "."),
        el("li", {}, "La ", el("strong", { text: "Repository access" }), " alege ", el("strong", { text: "Only select repositories" }), ` și selectează ${repo().owner}/${repo().name}.`),
        el("li", {}, "La ", el("strong", { text: "Permissions" }), ", adaugă ", el("strong", { text: "Contents" }), " cu ", el("strong", { text: "Read and write" }), "."),
        el("li", {}, "Alege cea mai lungă durată de valabilitate, apasă ", el("strong", { text: "Generate token" }), ", copiază tokenul și lipește-l mai jos."),
      ),
      field("Token GitHub", tokenInput, { wide: true, hint: "Tokenul se salvează criptat; fără parola panoului nu poate fi folosit." }),
      el("div", { class: "actions" }, connectButton),
    ),
    card("Schimbă parola", "Parola nouă trebuie să aibă cel puțin 8 caractere, cu litere mari și mici, cifre și simboluri.",
      connected ? null : note("Poți schimba parola după ce site-ul este conectat la GitHub.", "warn"),
      grid(field("Parola nouă", newPass), field("Repetă parola nouă", confirmPass)),
      el("div", { class: "actions" }, generate, saveButton),
    ),
    card("Sesiune", null, el("div", { class: "actions" }, el("button", { type: "button", class: "btn btn-ghost", onClick: logout }, icon("a-out"), "Ieși din panou"))),
  ];
}

async function saveAuth(auth, message) {
  let sha;
  try {
    sha = (await getFile("admin/auth.json")).sha;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  await putFile("admin/auth.json", utf8ToB64(`${JSON.stringify(auth, null, 2)}\n`), message, sha);
}
async function connectGitHub(token, button) {
  if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(token)) {
    toast("Tokenul nu pare corect. Copiază-l din nou de pe GitHub (începe cu github_pat_).", "error");
    return;
  }
  button.disabled = true;
  button.textContent = "Se verifică…";
  const previousToken = state.token;
  try {
    const info = await gh(`/repos/${repo().owner}/${repo().name}`, {}, token);
    if (!info.permissions?.push) throw Object.assign(new Error("no push"), { status: 403 });
    const auth = clone(state.auth);
    auth.token = await encryptText(state.key, token);
    state.token = token;
    await saveAuth(auth, "Panou de administrare: conectare la GitHub");
    state.auth = auth;
    await loadSite().catch(() => {});
    toast("Gata! Site-ul este conectat și poți publica modificări.", "ok");
    renderApp("account");
  } catch (error) {
    state.token = previousToken;
    toast(explainGitHubError(error), "error");
    button.disabled = false;
    button.textContent = previousToken ? "Înlocuiește tokenul" : "Conectează site-ul";
  }
}
async function changePassword(password, repeat, button) {
  const strong = password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
  if (!strong) return toast("Parola trebuie să aibă cel puțin 8 caractere, cu litere mari și mici, cifre și simboluri.", "error");
  if (password !== repeat) return toast("Cele două parole nu sunt identice.", "error");
  if (!state.token) return toast("Conectează mai întâi site-ul la GitHub.", "error");
  button.disabled = true;
  button.textContent = "Se salvează…";
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const auth = clone(state.auth);
    auth.kdf.salt = bytesToB64(salt);
    const bits = await deriveBits(password, auth.kdf.salt, auth.kdf.iterations);
    auth.verifier = bytesToB64(bits.subarray(32));
    const key = await aesKey(bits.subarray(0, 32));
    auth.token = await encryptText(key, state.token);
    await saveAuth(auth, "Panou de administrare: parolă schimbată");
    state.auth = auth;
    state.key = key;
    toast("Parola a fost schimbată. Folosește-o la următoarea intrare în panou.", "ok");
    renderApp("account");
  } catch (error) {
    toast(explainGitHubError(error), "error");
    button.disabled = false;
    button.textContent = "Schimbă parola";
  }
}

/* ---------------------------------------------------------------------------
   Validare, previzualizare, publicare
--------------------------------------------------------------------------- */
function validate(content) {
  const problems = [];
  const need = (value, label) => {
    if (!String(value ?? "").trim()) problems.push(`${label} nu poate fi gol.`);
  };
  need(content.hero.titleLine1, "Titlul din prima pagină");
  need(content.hero.titleAccent, "Cuvântul evidențiat din titlu");
  need(content.contact.phoneDisplay, "Telefonul");
  need(content.contact.street, "Strada");
  need(content.seo.title, "Titlul paginii pentru Google");
  if (normalizePhone(content.contact.phoneDisplay).wa.length < 10) problems.push("Telefonul pare incomplet.");
  content.hours.forEach((item) => {
    if (!item.closed && !(item.open < item.close)) problems.push(`${DAY_LONG[item.day]}: ora de închidere trebuie să fie după ora de deschidere.`);
  });
  if (content.hours.every((item) => item.closed)) problems.push("Programul nu poate avea toate zilele închise.");
  for (const { section, field: fieldDef } of fieldEntries()) {
    if (fieldDef.opt || fieldDef.kind) continue;
    const value = getPath(content, fieldDef.path);
    if (typeof value === "string" && !value.trim()) problems.push(`${section.label}: „${fieldDef.label}” nu poate fi gol.`);
  }
  ["facebook", "instagram", "tiktok", "mapsUrl"].forEach((key) => {
    if (content.contact[key] && !safeUrl(content.contact[key])) problems.push(`Linkul ${key} nu este valid.`);
  });
  if (content.announcement.enabled && !content.announcement.text.trim()) problems.push("Anunțul este pornit, dar nu are text.");
  if (content.announcement.link && !safeUrl(content.announcement.link)) problems.push("Linkul anunțului nu este valid.");
  content.services.forEach((service) => {
    need(service.name, "Numele unui serviciu");
    if (service.bookable && service.visible !== false && !service.pets.length) problems.push(`„${service.name}”: bifează câini și/sau pisici.`);
  });
  content.social.reels.forEach((reel) => {
    if (!safeUrl(reel.url)) problems.push(`Videoclipul „${reel.title}” nu are un link valid.`);
  });
  content.closedDates.forEach((item) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date || "")) problems.push("O zi liberă nu are dată.");
  });
  return problems;
}
function buildHtml(baseHtml, content) {
  const doc = new DOMParser().parseFromString(baseHtml, "text/html");
  renderDocument(doc, content);
  return { doc, html: serializeDocument(doc) };
}

function openPreview() {
  const problems = validate(state.content);
  const { doc } = buildHtml(state.html, state.content);
  const base = doc.createElement("base");
  base.setAttribute("href", SITE_URL);
  doc.head.prepend(base);
  state.uploads.forEach((upload) => {
    doc.querySelectorAll(`img[src="${upload.path}"]`).forEach((image) => image.setAttribute("src", upload.dataUrl));
  });
  const frame = el("iframe", { title: "Previzualizarea site-ului", class: "preview-frame" });
  frame.srcdoc = serializeDocument(doc);
  const devices = [["desktop", "Calculator", "a-desktop"], ["tablet", "Tabletă", "a-tablet"], ["mobile", "Telefon", "a-mobile"]];
  const stage = el("div", { class: "preview-stage device-desktop" }, el("div", { class: "preview-device" }, frame));
  const deviceButtons = devices.map(([id, label, ic]) =>
    el("button", { type: "button", class: `seg${id === "desktop" ? " on" : ""}`, onClick: (event) => {
      stage.className = `preview-stage device-${id}`;
      deviceButtons.forEach((button) => button.classList.toggle("on", button === event.currentTarget));
    } }, icon(ic), el("span", { text: label })),
  );
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (event) => event.key === "Escape" && close();
  const overlay = el("div", { class: "preview", role: "dialog", "aria-modal": "true", "aria-label": "Previzualizare" },
    el("div", { class: "preview-bar" },
      el("strong", { text: "Previzualizare" }),
      el("div", { class: "segs" }, deviceButtons),
      el("div", { class: "preview-actions" },
        el("button", { type: "button", class: "btn btn-primary btn-small", onClick: () => {
          close();
          publish();
        } }, "Publică"),
        el("button", { type: "button", class: "icon-btn light", "aria-label": "Închide previzualizarea", onClick: close }, icon("a-close")),
      ),
    ),
    problems.length ? el("div", { class: "preview-warn", text: `Atenție: ${problems[0]}` }) : null,
    stage,
  );
  document.body.append(overlay);
  document.addEventListener("keydown", onKey);
}

function changedSections() {
  const before = JSON.parse(state.originalJson);
  const names = { announcement: "Anunț", siteName: "Meniu", header: "Meniu", status: "Meniu", hero: "Prima pagină", about: "Despre noi", gallery: "Galerie", services: "Servicii", servicesSection: "Servicii", marquee: "Servicii", process: "Cum funcționează", hours: "Program", closedDates: "Zile libere", booking: "Programări", contact: "Contact", social: "TikTok", reviews: "Recenzii", faq: "Întrebări", contactSection: "Contact", footer: "Subsol", seo: "Google" };
  const list = Object.keys(names).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(state.content[key])).map((key) => names[key]);
  return [...new Set(list)];
}

async function publish() {
  if (state.busy) return;
  if (!isDirty()) return toast("Nu ai modificări de publicat.");
  if (!state.token) {
    toast("Conectează mai întâi site-ul la GitHub ca să poți publica.", "error");
    return openSection("account");
  }
  const problems = validate(state.content);
  if (problems.length) {
    showProblems(problems);
    return;
  }
  state.busy = true;
  const button = document.getElementById("publish-btn");
  button.disabled = true;
  button.textContent = "Se publică…";
  try {
    for (const upload of pendingUploads()) {
      const where = upload.path.includes("/galerie-") ? "în galerie" : "în prima pagină";
      await putFile(upload.path, upload.base64, `Panou de administrare: imagine nouă ${where}`);
    }
    const latest = await getFile("index.html");
    const latestDoc = new DOMParser().parseFromString(latest.text, "text/html");
    const latestContent = applyDefaults(readContent(latestDoc), latestDoc);
    if (JSON.stringify(latestContent) !== state.originalJson && !confirm("Site-ul a fost modificat din alt loc de când ai deschis panoul. Publici peste acele modificări?")) {
      throw Object.assign(new Error("Publicare anulată."), { cancelled: true });
    }
    const sections = changedSections();
    const message = `Actualizare din panoul de administrare${sections.length ? `: ${sections.join(", ")}` : ""}`;
    const { html } = buildHtml(latest.text, state.content);
    const result = await putFile("index.html", utf8ToB64(html), message, latest.sha);
    state.html = html;
    state.sha = result.content.sha;
    state.originalJson = JSON.stringify(state.content);
    state.uploads = [];
    changed();
    showPublished();
    watchLive(JSON.stringify(state.content));
  } catch (error) {
    if (!error.cancelled) toast(explainGitHubError(error), "error");
  } finally {
    state.busy = false;
    button.disabled = false;
    button.textContent = "Publică";
  }
}
function showProblems(problems) {
  const overlay = el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "problems-title" },
    el("div", { class: "modal-card" },
      el("h2", { id: "problems-title", text: "Mai e ceva de corectat" }),
      el("ul", { class: "problems" }, problems.map((problem) => el("li", { text: problem }))),
      el("div", { class: "actions" }, el("button", { type: "button", class: "btn btn-primary", onClick: () => overlay.remove() }, "Am înțeles")),
    ),
  );
  document.body.append(overlay);
  overlay.querySelector("button").focus();
}
function showPublished() {
  const status = el("p", { class: "live-status", id: "live-status", text: "Site-ul se actualizează. Durează de obicei aproximativ un minut…" });
  const overlay = el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "done-title" },
    el("div", { class: "modal-card" },
      el("span", { class: "done-icon" }, icon("a-check")),
      el("h2", { id: "done-title", text: "Modificările au fost publicate" }),
      status,
      el("div", { class: "actions" },
        el("a", { class: "btn btn-ghost", href: SITE_URL, target: "_blank", rel: "noopener" }, icon("a-link"), "Deschide site-ul"),
        el("button", { type: "button", class: "btn btn-primary", onClick: () => overlay.remove() }, "Închide"),
      ),
    ),
  );
  document.body.append(overlay);
}
async function watchLive(expectedJson) {
  for (let attempt = 0; attempt < 24; attempt++) {
    await sleep(10000);
    try {
      const response = await fetch(`../index.html?v=${Date.now()}`, { cache: "no-store" });
      const html = await response.text();
      const content = readContent(new DOMParser().parseFromString(html, "text/html"));
      if (JSON.stringify(content) === expectedJson) {
        const status = document.getElementById("live-status");
        if (status) {
          status.textContent = "Gata! Modificările sunt acum vizibile pe site.";
          status.classList.add("ok");
        }
        toast("Modificările sunt acum vizibile pe site.", "ok");
        return;
      }
    } catch {}
  }
}

/* ---------------------------------------------------------------------------
   Cadrul aplicației
--------------------------------------------------------------------------- */
function renderApp(section = state.section) {
  app.className = "app-view";
  app.replaceChildren();
  const nav = el("nav", { class: "side", "aria-label": "Secțiunile panoului" },
    el("a", { class: "side-brand", href: "../", target: "_blank", rel: "noopener" }, el("img", { src: "../assets/logo-mark.svg", alt: "", width: 40, height: 40 }), el("span", {}, el("strong", { text: "Arr Grooming" }), el("small", { text: "Panou de administrare" }))),
    el("div", { class: "side-search" },
      el("label", { class: "visually-hidden", for: "field-search", text: "Caută un text" }),
      icon("a-search"),
      el("input", { type: "search", id: "field-search", placeholder: "Caută un text…", autocomplete: "off", spellcheck: "false", enterkeyhint: "search", onInput: onSearchInput, onKeydown: (event) => {
        // Pe telefon, tasta de căutare închide meniul ca să se vadă rezultatele.
        if (event.key !== "Enter") return;
        event.preventDefault();
        onSearchInput(event, true);
        document.body.classList.remove("nav-open");
        event.target.blur();
      } }),
    ),
    el("ul", {}, SECTIONS.map((item) => [
      item.group ? el("li", { class: "side-group", "aria-hidden": "true", text: item.group }) : null,
      el("li", {}, el("button", { type: "button", class: "side-link", "data-section": item.id, onClick: () => openSection(item.id) }, icon(item.icon), el("span", { text: item.label }))),
    ])),
  );
  const menuButton = el("button", { type: "button", class: "icon-btn menu-btn", "aria-label": "Meniu", onClick: () => document.body.classList.toggle("nav-open") }, icon("a-menu"));
  const top = el("header", { class: "top" },
    menuButton,
    el("span", { class: `pill ${state.token ? "ok" : "warn"}`, text: state.token ? "Conectat la GitHub" : "Doar previzualizare" }),
    el("span", { class: "pill dirty", id: "dirty-pill" }),
    el("div", { class: "top-actions" },
      el("button", { type: "button", class: "btn btn-ghost", onClick: openPreview }, icon("a-eye"), el("span", { class: "hide-sm", text: "Previzualizează" })),
      el("button", { type: "button", class: "btn btn-primary", id: "publish-btn", onClick: publish }, "Publică"),
      el("button", { type: "button", class: "icon-btn", "aria-label": "Ieși din panou", title: "Ieși din panou", onClick: logout }, icon("a-out")),
    ),
  );
  const main = el("div", { class: "content", id: "content", tabindex: "-1" });
  app.append(nav, el("div", { class: "main" }, top, main), el("div", { class: "nav-scrim", onClick: () => document.body.classList.remove("nav-open") }));
  changed();
  openSection(section, false);
}
function openSection(id, focus = true, cardIndex = null) {
  const section = SECTIONS.find((item) => item.id === id) || SECTIONS[0];
  state.section = section.id;
  if (state.searching) {
    state.searching = false;
    const search = document.getElementById("field-search");
    if (search) search.value = "";
  }
  document.body.classList.remove("nav-open");
  document.querySelectorAll(".side-link").forEach((link) => link.setAttribute("aria-current", link.dataset.section === section.id ? "page" : "false"));
  const main = document.getElementById("content");
  const body = section.cards ? renderSectionCards(section) : [section.render()].flat();
  main.replaceChildren(el("h1", { class: "section-title", text: section.label }), ...body);
  if (section.id === "start") main.querySelector(".section-title").remove();
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  if (focus) main.focus({ preventScroll: true });
  if (cardIndex != null) document.getElementById(`card-${section.id}-${cardIndex}`)?.scrollIntoView({ block: "start" });
}

/* ---------------------------------------------------------------------------
   Pornire
--------------------------------------------------------------------------- */
if (!window.crypto?.subtle) {
  app.replaceChildren(el("p", { class: "noscript", text: "Browserul acesta nu poate deschide panoul în siguranță. Folosește o versiune recentă de Chrome, Edge, Firefox sau Safari." }));
} else {
  renderLogin();
}
