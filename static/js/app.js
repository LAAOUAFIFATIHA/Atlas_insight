/* AtlasInsight — utilitaires partagés par toutes les pages */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const nf = new Intl.NumberFormat("fr-FR");
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Appel d'API JSON : lève une Error avec le message du serveur si le statut n'est pas 2xx. */
async function api(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erreur || `Erreur ${res.status}`);
  return data;
}
const postJSON = (url, body) =>
  api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Crée un élément DOM. Le texte est inséré via textContent : aucune injection HTML possible. */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "style") Object.assign(node.style, v);
    else node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => c != null && node.append(c));
  return node;
}

function showError(container, message) {
  container.replaceChildren(el("div", { class: "alert", role: "alert", text: message }));
}

/* --- Chart.js --- */
const palette = () => [css("--c1"), css("--c2"), css("--c3"), css("--c4")];
function makeChart(canvas, config) {
  Chart.defaults.color = css("--text-2");
  Chart.defaults.borderColor = css("--line");
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  if (canvas._chart) canvas._chart.destroy();
  config.options = Object.assign({ responsive: true, maintainAspectRatio: false }, config.options || {});
  canvas._chart = new Chart(canvas, config);
  return canvas._chart;
}
// recolorer les graphiques si le thème système change
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => location.reload());

/* --- tableau « carte de chaleur » ---
   mode "diverging" : bleu (> 0) / orange (< 0), centré sur 0 ; mode "sequential" : bleu, du min au max.
   La valeur est toujours écrite dans la cellule : la couleur n'est jamais le seul signal. */
function heatTable(target, rows, cols, values, { format, mode = "sequential", limit = 1 } = {}) {
  const flat = values.flat();
  const min = Math.min(...flat), max = Math.max(...flat);
  const thead = el("thead", {}, el("tr", {}, [el("th", { text: "" }), ...cols.map((c) => el("th", { text: c }))]));
  const tbody = el("tbody");
  rows.forEach((r, i) => {
    const tr = el("tr", {}, el("th", { scope: "row", text: r }));
    values[i].forEach((v) => {
      let bg;
      if (mode === "diverging") {
        const a = Math.min(Math.abs(v) / limit, 1) * 0.6;
        bg = `color-mix(in srgb, ${v >= 0 ? css("--c1") : css("--c2")} ${Math.round(a * 100)}%, transparent)`;
      } else {
        const a = ((v - min) / (max - min || 1)) * 0.6;
        bg = `color-mix(in srgb, ${css("--c1")} ${Math.round(a * 100)}%, transparent)`;
      }
      tr.append(el("td", { text: format(v), style: { background: bg } }));
    });
    tbody.append(tr);
  });
  target.replaceChildren(el("table", { class: "heat" }, [thead, tbody]));
}
