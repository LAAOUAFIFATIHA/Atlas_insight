/* ============================================================
   AtlasInsight — Utilitaires partagés (app.js)
   ============================================================ */

"use strict";

/* ---- Sélecteurs ---- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---- Formatage ---- */
const nf = new Intl.NumberFormat("fr-FR");
const pct = (v, dec = 1) => `${v >= 0 ? "+" : ""}${v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec })} %`;
const mad = (v) => `${nf.format(Math.round(v))} MAD`;
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ============================================================
   THÈME (mode sombre / clair)
   ============================================================ */
(function initTheme() {
  const stored = localStorage.getItem("atlas-theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = stored ? stored === "dark" : prefersDark;
  applyTheme(dark, false);
})();

function applyTheme(dark, save = true) {
  const html = document.documentElement;
  html.setAttribute("data-theme", dark ? "dark" : "light");
  if (save) localStorage.setItem("atlas-theme", dark ? "dark" : "light");
  // Mise à jour icônes + labels — desktop
  const sunD = $("#iconSun"), moonD = $("#iconMoon"), labelD = $("#themeLabel");
  const sunM = $("#iconSunMobile"), moonM = $("#iconMoonMobile");
  if (sunD) sunD.style.display = dark ? "none" : "block";
  if (moonD) moonD.style.display = dark ? "block" : "none";
  if (labelD) labelD.textContent = dark ? "Mode clair" : "Mode sombre";
  if (sunM) sunM.style.display = dark ? "none" : "block";
  if (moonM) moonM.style.display = dark ? "block" : "none";
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  applyTheme(!isDark);
}

document.addEventListener("DOMContentLoaded", () => {
  const t1 = $("#themeToggle");
  const t2 = $("#themeToggleMobile");
  if (t1) t1.addEventListener("click", toggleTheme);
  if (t2) t2.addEventListener("click", toggleTheme);

  // Adaptation automatique si l'OS change de thème et qu'aucune préférence n'a été sauvegardée
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem("atlas-theme")) applyTheme(e.matches, false);
  });
});

/* ============================================================
   SIDEBAR MOBILE
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  const sidebar = $("#sidebar");
  const overlay = $("#sidebarOverlay");
  const menuBtn = $("#menuToggle");
  if (!sidebar || !menuBtn) return;

  function openSidebar() {
    sidebar.classList.add("open");
    overlay.classList.add("visible");
    menuBtn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }
  function closeSidebar() {
    sidebar.classList.remove("open");
    overlay.classList.remove("visible");
    menuBtn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  menuBtn.addEventListener("click", () => {
    sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
  });
  overlay.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sidebar.classList.contains("open")) closeSidebar();
  });

  // Fermer la sidebar sur clic d'un lien de navigation (mobile uniquement)
  $$(".nav-link", sidebar).forEach((link) => {
    link.addEventListener("click", () => {
      if (window.innerWidth < 768) closeSidebar();
    });
  });
});

/* ============================================================
   API JSON
   ============================================================ */
let _pendingRequests = 0;
function _setLoading(active) {
  _pendingRequests += active ? 1 : -1;
  if (_pendingRequests < 0) _pendingRequests = 0;
  document.documentElement.classList.toggle("loading", _pendingRequests > 0);
}

async function api(url, options) {
  _setLoading(true);
  try {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.erreur || `Erreur ${res.status}`);
    return data;
  } finally {
    _setLoading(false);
  }
}

const postJSON = (url, body) =>
  api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/* ============================================================
   CONSTRUCTION DOM
   ============================================================ */
/** Crée un élément DOM. textContent pour les textes (pas d'injection HTML). */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text")  node.textContent = v;
    else if (k === "html")  node.innerHTML = v;
    else if (k === "style") Object.assign(node.style, v);
    else node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(
    (c) => c != null && node.append(typeof c === "string" ? document.createTextNode(c) : c)
  );
  return node;
}

function showError(container, message) {
  container.replaceChildren(
    el("div", { class: "alert alert-error", role: "alert" }, [
      el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2",
                  "stroke-linecap": "round", "stroke-linejoin": "round", width: "16", height: "16" },
        [el("circle", { cx: "12", cy: "12", r: "10" }),
         el("line", { x1: "12", y1: "8", x2: "12", y2: "12" }),
         el("line", { x1: "12", y1: "16", x2: "12.01", y2: "16" })]),
      el("span", { text: message }),
    ])
  );
}

/** Affiche un skeleton pendant le chargement */
function showSkeleton(container, type = "kpi") {
  container.replaceChildren(el("div", { class: `skeleton skeleton-${type}` }));
}

/* ============================================================
   CHART.JS — Configurations partagées
   ============================================================ */
const palette = () => [css("--c1"), css("--c2"), css("--c3"), css("--c4"), css("--c5")];

function makeChart(canvas, config) {
  Chart.defaults.color = css("--text-3");
  Chart.defaults.borderColor = css("--line");
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;
  if (canvas._chart) canvas._chart.destroy();
  config.options = Object.assign(
    { responsive: true, maintainAspectRatio: false, animation: { duration: 400 } },
    config.options || {}
  );
  canvas._chart = new Chart(canvas, config);
  return canvas._chart;
}

/* ============================================================
   EXPORT PNG (Chart.js)
   ============================================================ */
function exportChartPng(canvas, filename) {
  const link = document.createElement("a");
  link.download = filename || "graphique.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

/** Bouton export PNG ajouté au-dessus d'un canvas */
function addExportPng(canvas, filename) {
  const toolbar = el("div", { class: "chart-toolbar" });
  const btn = el("button", { class: "btn btn-ghost btn-sm", "aria-label": "Exporter en PNG" }, [
    el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
                "stroke-width": "2", "stroke-linecap": "round", width: "14", height: "14" },
      [el("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
       el("polyline", { points: "7 10 12 15 17 10" }),
       el("line", { x1: "12", y1: "15", x2: "12", y2: "3" })]),
    "PNG",
  ]);
  btn.addEventListener("click", () => exportChartPng(canvas, filename));
  toolbar.append(btn);
  canvas.parentNode.insertBefore(toolbar, canvas);
}

/* ============================================================
   EXPORT CSV
   ============================================================ */
function exportCsv(rows, filename) {
  if (!rows || !rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(";"),
    ...rows.map(r => headers.map(h => {
      const v = r[h] ?? "";
      return String(v).includes(";") ? `"${v}"` : v;
    }).join(";")),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename || "export.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/* ============================================================
   HEATMAP TABLE
   mode "diverging" : bleu (>0) / orange (<0), centré sur 0
   mode "sequential" : bleu, min→max
   La valeur est toujours écrite dans la cellule.
   ============================================================ */
function heatTable(target, rows, cols, values, { format, mode = "sequential", limit = 1 } = {}) {
  const flat = values.flat();
  const min = Math.min(...flat), max = Math.max(...flat);
  const thead = el("thead", {}, el("tr", {}, [
    el("th", { text: "" }),
    ...cols.map((c) => el("th", { text: c })),
  ]));
  const tbody = el("tbody");
  rows.forEach((r, i) => {
    const tr = el("tr", {}, el("th", { scope: "row", text: r }));
    values[i].forEach((v) => {
      let bg;
      if (mode === "diverging") {
        const a = Math.min(Math.abs(v) / limit, 1) * 0.65;
        bg = `color-mix(in srgb, ${v >= 0 ? css("--c1") : css("--c2")} ${Math.round(a * 100)}%, transparent)`;
      } else {
        const a = ((v - min) / (max - min || 1)) * 0.65;
        bg = `color-mix(in srgb, ${css("--c1")} ${Math.round(a * 100)}%, transparent)`;
      }
      tr.append(el("td", { text: format(v), style: { background: bg } }));
    });
    tbody.append(tr);
  });
  target.replaceChildren(el("table", { class: "heat" }, [thead, tbody]));
}

/* ============================================================
   KPI CARD BUILDER
   ============================================================ */
function kpiCard({ label, value, note, trend, trendDir, icon, tooltip, colorClass } = {}) {
  const parts = [];

  if (icon) {
    parts.push(el("div", { class: "kpi-icon" }, [icon]));
  }

  const labelWrap = el("div", { class: "kpi-label" }, [label]);
  if (tooltip) {
    const wrap = el("div", { class: "kpi-tooltip-wrap flex gap-4", style: { alignItems: "center" } }, [
      labelWrap,
      el("span", { class: "kpi-tooltip-icon", "aria-label": tooltip, tabindex: "0" }, ["?"]),
    ]);
    wrap.querySelector(".kpi-tooltip-icon").append(
      el("span", { class: "tooltip-bubble", role: "tooltip", text: tooltip })
    );
    parts.push(wrap);
  } else {
    parts.push(labelWrap);
  }

  parts.push(el("div", { class: "kpi-value mono", text: value }));
  if (note) parts.push(el("div", { class: "kpi-note", text: note }));
  if (trend != null) parts.push(el("div", { class: `kpi-trend ${trendDir || "flat"}`, text: trend }));

  return el("div", { class: `card kpi${colorClass ? " " + colorClass : ""}` }, parts);
}
