(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const WEDDING = new Date(CONFIG.weddingDate);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let lang = "ar";
  let statusKind = "";
  let autoScroll = !reduceMotion;
  let scrolling = false;

  const t = () => CONFIG.i18n[lang];

  function applyLang() {
    const dict = t();
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === "ar" ? "rtl" : "ltr";
    document.title = dict.pageTitle;

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (Object.prototype.hasOwnProperty.call(dict, key) && typeof dict[key] === "string") {
        el.textContent = dict[key];
      }
    });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
      el.placeholder = dict[el.dataset.i18nPh] || "";
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      el.setAttribute("aria-label", dict[el.dataset.i18nAria] || "");
    });

    $("langBtn").textContent = lang === "ar" ? "EN" : "عربي";
    renderTimeline();
    tick();
    if (statusKind) setStatus(statusKind);
  }

  $("langBtn").addEventListener("click", () => {
    lang = lang === "ar" ? "en" : "ar";
    applyLang();
  });

  /* ---------- Timeline ---------- */
  function renderTimeline() {
    const items = t().timeline || [];
    const root = $("timeline");
    const mid = Math.floor((items.length - 1) / 2);
    root.innerHTML = items
      .map(
        (item, i) =>
          `<li class="${i === mid ? "star" : ""}"><time>${item.time}</time><i></i><strong>${item.title}</strong></li>`
      )
      .join("");
  }

  /* ---------- Countdown ---------- */
  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function tick() {
    const dict = t();
    const diff = Math.max(0, WEDDING.getTime() - Date.now());
    const parts = [
      [Math.floor(diff / 864e5), dict.d],
      [Math.floor(diff / 36e5) % 24, dict.h],
      [Math.floor(diff / 6e4) % 60, dict.m],
      [Math.floor(diff / 1e3) % 60, dict.s]
    ];
    const root = $("countdown");
    const cells = root.querySelectorAll("[data-unit]");
    if (cells.length !== 4) {
      root.innerHTML = parts
        .map(
          ([value, label], i) =>
            `<div><b data-unit="${i}">${pad(value)}</b><span>${label}</span></div>`
        )
        .join("");
      return;
    }
    parts.forEach(([value, label], i) => {
      cells[i].textContent = pad(value);
      cells[i].nextElementSibling.textContent = label;
    });
  }

  window.setInterval(tick, 1000);

  /* ---------- Calendar ---------- */
  function icsStamp(date) {
    const p = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}T${p(date.getHours())}${p(date.getMinutes())}00`;
  }

  $("calBtn").addEventListener("click", () => {
    const dict = t();
    const end = new Date(WEDDING.getTime() + CONFIG.durationHours * 36e5);
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Ahmed Toka//Invitation//EN",
      "BEGIN:VEVENT",
      `UID:ahmed-toka-${icsStamp(WEDDING)}@invitation`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `SUMMARY:${dict.calendarSummary}`,
      `DTSTART:${icsStamp(WEDDING)}`,
      `DTEND:${icsStamp(end)}`,
      `LOCATION:${dict.venueName}`,
      `DESCRIPTION:${dict.weddingOf}`,
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = CONFIG.calendarFile || "wedding.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  $("mapBtn").href = CONFIG.mapsUrl;

  /* ---------- RSVP ---------- */
  function setStatus(kind) {
    statusKind = kind;
    const status = $("status");
    status.classList.toggle("is-error", kind === "error");
    status.textContent = kind ? t()[kind] : "";
  }

  $("rsvpForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const btn = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    data.lang = lang;
    data.submittedAt = new Date().toISOString();
    setStatus("");

    const name = typeof data.name === "string" ? data.name.trim() : "";
    const attendingOk = data.attending === "yes" || data.attending === "no";
    if (!name) {
      setStatus("nameMissing");
      form.querySelector('[name="name"]').focus();
      return;
    }
    if (!attendingOk || !CONFIG.rsvpEndpoint) {
      setStatus("error");
      return;
    }
    data.name = name;

    const endpoint = CONFIG.rsvpEndpoint;
    const isAppsScript = /^https?:/i.test(endpoint) && !/formspree\.io/i.test(endpoint);
    btn.disabled = true;
    btn.textContent = t().sending;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        mode: isAppsScript ? "no-cors" : "cors",
        headers: {
          "Content-Type": isAppsScript ? "text/plain;charset=utf-8" : "application/json"
        },
        body: JSON.stringify(data)
      });
      if (!isAppsScript && !response.ok) throw new Error("rsvp");
      setStatus("thanks");
      form.reset();
      form.querySelector('input[value="yes"]').checked = true;
    } catch (_err) {
      setStatus("error");
    } finally {
      btn.disabled = false;
      btn.textContent = t().send;
    }
  });

  /* ---------- Music ---------- */
  const bgm = $("bgm");
  const muteBtn = $("muteBtn");
  if (CONFIG.music) bgm.src = CONFIG.music;

  muteBtn.addEventListener("click", () => {
    if (bgm.paused) {
      bgm.play().catch(() => {});
      muteBtn.classList.remove("is-muted");
      muteBtn.setAttribute("aria-pressed", "false");
    } else {
      bgm.pause();
      muteBtn.classList.add("is-muted");
      muteBtn.setAttribute("aria-pressed", "true");
    }
  });

  /* ---------- Auto-scroll ---------- */
  const scrollBtn = $("scrollBtn");

  function setAuto(on) {
    autoScroll = on && !reduceMotion;
    scrollBtn.classList.toggle("is-paused", !autoScroll);
    scrollBtn.setAttribute("aria-pressed", autoScroll ? "true" : "false");
  }

  function step() {
    if (autoScroll && !document.body.classList.contains("locked")) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (window.scrollY >= max - 2) setAuto(false);
      else window.scrollBy(0, 0.55);
    }
    window.requestAnimationFrame(step);
  }

  scrollBtn.addEventListener("click", () => setAuto(!autoScroll));
  window.addEventListener("wheel", () => setAuto(false), { passive: true });
  window.addEventListener("touchstart", () => { scrolling = true; }, { passive: true });
  window.addEventListener("touchmove", () => { if (scrolling) setAuto(false); }, { passive: true });

  /* ---------- Open ---------- */
  const intro = $("intro");
  let opened = false;

  $("openBtn").addEventListener("click", () => {
    if (opened) return;
    opened = true;
    intro.classList.add("opening");
    document.body.classList.remove("locked");
    if (CONFIG.music) {
      bgm.play().catch(() => {});
      muteBtn.hidden = false;
    }
    scrollBtn.hidden = false;
    setAuto(!reduceMotion);
    const fade = reduceMotion ? 250 : 1100;
    window.setTimeout(() => intro.classList.add("done"), fade);
    window.setTimeout(() => intro.remove(), fade + 900);
  });

  if (!reduceMotion) window.requestAnimationFrame(step);
  applyLang();
})();
