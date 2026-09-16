const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#navigation");
const header = document.querySelector(".site-header");
const mobileCall = document.querySelector(".mobile-call");
const dialog = document.querySelector("#appointment-dialog");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function closeMenu() {
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Deschide meniul");
  navigation.classList.remove("open");
}

menuButton.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute(
    "aria-label",
    open ? "Închide meniul" : "Deschide meniul",
  );
  navigation.classList.toggle("open", open);
});

navigation
  .querySelectorAll("a")
  .forEach((link) => link.addEventListener("click", closeMenu));
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

// Keep telephone links functional when JavaScript or native dialogs are unavailable.
if (typeof dialog.showModal === "function") {
  document.querySelectorAll("[data-appointment]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        return;
      event.preventDefault();
      closeMenu();
      dialog.showModal();
      mobileCall.classList.remove("visible");
    });
  });
  dialog
    .querySelector(".dialog-close")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    const box = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom)
    )
      dialog.close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const controls = [
      ...dialog.querySelectorAll("a[href], button:not([disabled])"),
    ];
    const first = controls[0],
      last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  dialog.addEventListener("close", updateScroll);
}

const sectionLinks = [...navigation.querySelectorAll('a[href^="#"]')];
const sections = sectionLinks.map((link) =>
  document.querySelector(link.getAttribute("href")),
);
const contact = document.querySelector("#contact");
let scheduled = false;
function updateScroll() {
  header.classList.toggle("scrolled", scrollY > 50);
  const range = document.documentElement.scrollHeight - innerHeight;
  header.style.setProperty(
    "--reading-progress",
    range > 0 ? Math.min(1, scrollY / range) : 0,
  );
  const contactVisible =
    contact.getBoundingClientRect().top < innerHeight * 0.75;
  mobileCall.classList.toggle(
    "visible",
    scrollY > 580 && !contactVisible && !dialog.open,
  );
  let current = null;
  sections.forEach((section, index) => {
    if (section.getBoundingClientRect().top <= header.offsetHeight + 150)
      current = index;
  });
  sectionLinks.forEach((link, index) => {
    if (index === current) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
  scheduled = false;
}
window.addEventListener(
  "scroll",
  () => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(updateScroll);
    }
  },
  { passive: true },
);
updateScroll();

const track = document.querySelector("#team-track");
const previous = document.querySelector("#team-prev");
const next = document.querySelector("#team-next");
const position = document.querySelector("#team-position");
const doctors = [...track.querySelectorAll(".doctor")];
function moveTeam(direction) {
  const step =
    doctors[0].getBoundingClientRect().width +
    parseFloat(getComputedStyle(track).gap);
  track.scrollBy({
    left: direction * step,
    behavior: reducedMotion.matches ? "instant" : "smooth",
  });
}
function updateTeam() {
  previous.disabled = track.scrollLeft < 5;
  next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 5;
  const viewport = track.getBoundingClientRect();
  const visible = doctors
    .map((doctor, index) => ({ index, box: doctor.getBoundingClientRect() }))
    .filter(
      ({ box }) =>
        Math.min(box.right, viewport.right) -
          Math.max(box.left, viewport.left) >
        box.width * 0.6,
    );
  if (visible.length) {
    const pad = (number) => String(number).padStart(2, "0");
    const first = visible[0].index + 1;
    const last = visible.at(-1).index + 1;
    const label = `${pad(first)}${first === last ? "" : " — " + pad(last)} / ${pad(doctors.length)}`;
    if (position.textContent !== label) position.textContent = label;
  }
}
previous.addEventListener("click", () => moveTeam(-1));
next.addEventListener("click", () => moveTeam(1));
track.addEventListener("scroll", updateTeam, { passive: true });
track.addEventListener("keydown", (event) => {
  if (
    event.target === track &&
    (event.key === "ArrowRight" || event.key === "ArrowLeft")
  ) {
    event.preventDefault();
    moveTeam(event.key === "ArrowRight" ? 1 : -1);
  }
});
window.addEventListener("resize", () => {
  updateTeam();
  updateScroll();
  if (innerWidth > 900) closeMenu();
});
updateTeam();
document.fonts.ready.then(updateTeam);
document.querySelector("#year").textContent = new Date().getFullYear();

if ("IntersectionObserver" in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 },
  );
  document
    .querySelectorAll(
      ".intro-grid, .section-heading, .community-copy, .contact-grid",
    )
    .forEach((element) => {
      element.classList.add("reveal");
      observer.observe(element);
    });
}
