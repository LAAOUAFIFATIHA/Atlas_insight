"use strict";
/* ============================================================
   AtlasInsight — Tableau de bord (index.js)
   ============================================================ */

(async function () {
  const filterDest = $("#filterDest");
  const resetBtn   = $("#resetFilters");

  let dashData = null;
  let chNotes = null, chDemande = null, chPrix = null, chTypes = null, chSent = null, chEtoiles = null;

  /* ---- Icônes SVG inline pour les KPI ---- */
  function svgIcon(path) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "2");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("width", "18");
    s.setAttribute("height", "18");
    s.innerHTML = path;
    return s;
  }

  /* ---- Chargement ---- */
  async function charger(destination = "") {
    // Skeletons pendant le chargement
    const kpiEl = $("#kpis");
    kpiEl.replaceChildren(
      ...Array.from({ length: 7 }, () => el("div", { class: "skeleton skeleton-kpi" }))
    );

    const url = destination
      ? `/api/dashboard/destination/${encodeURIComponent(destination)}`
      : "/api/dashboard";

    try {
      dashData = await api(url);
    } catch (e) {
      showError(kpiEl, e.message);
      return;
    }

    rendreKpis(dashData.kpis);
    rendreNotes(dashData.note_destination);
    rendreDemande(dashData.demande_totale);
    rendreAspects(dashData.aspects);
    rendrePrixSaisonnalite(dashData.saisonnalite_prix);
    rendreTypes(dashData.repartition_types);
    rendreSentiment(dashData.repartition_sentiment);
    rendreEtoiles(dashData.repartition_etoiles);
    rendreSegments(dashData.segments);
  }

  /* ---- KPIs ---- */
  function rendreKpis(k) {
    const defs = [
      { label: "Avis analysés",     value: nf.format(k.avis),    note: `${k.destinations} destinations`,
        icon: svgIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
        tooltip: "Total des avis clients inclus dans l'analyse" },
      { label: "Établissements",    value: nf.format(k.etablissements), note: "hôtels, riads, resorts…",
        icon: svgIcon('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>') },
      { label: "Note moyenne",      value: k.note_moyenne != null ? `${k.note_moyenne.toLocaleString("fr-FR")} / 10` : "—",
        note: "satisfaction clients",
        icon: svgIcon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
        tooltip: "Moyenne des notes globales de tous les avis" },
      { label: "Avis positifs",     value: k.part_positifs != null ? `${k.part_positifs.toLocaleString("fr-FR")} %` : "—",
        icon: svgIcon('<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>'),
        tooltip: "Part des avis classés positifs par le modèle de sentiment" },
      { label: "Avis négatifs",     value: k.part_negatifs != null ? `${k.part_negatifs.toLocaleString("fr-FR")} %` : "—",
        icon: svgIcon('<path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>'),
        tooltip: "Part des avis classés négatifs par le modèle de sentiment" },
      { label: "Prix moyen / nuit", value: k.prix_moyen_nuit != null ? `${nf.format(k.prix_moyen_nuit)} MAD` : "—",
        note: "toutes catégories",
        icon: svgIcon('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'),
        tooltip: "Prix moyen de la nuitée observé sur les données disponibles (MAD constants)" },
      { label: "Taux d'occupation", value: k.taux_occupation_moy != null ? `${k.taux_occupation_moy.toLocaleString("fr-FR")} %` : "—",
        note: "taux moyen",
        icon: svgIcon('<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>'),
        tooltip: "Taux d'occupation moyen des établissements sur la période disponible" },
    ];
    $("#kpis").replaceChildren(...defs.map(d => kpiCard(d)));
  }

  /* ---- Satisfaction par destination ---- */
  function rendreNotes(nd) {
    const [c1] = palette();
    const cnv = $("#ch-notes");
    chNotes = makeChart(cnv, {
      type: "bar",
      data: {
        labels: nd.labels,
        datasets: [{
          data: nd.valeurs,
          backgroundColor: c1,
          borderRadius: 5,
          maxBarThickness: 20,
        }],
      },
      options: {
        indexAxis: "y",
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => ` ${c.parsed.x.toFixed(2)} / 10` } },
        },
        scales: {
          x: { min: 5, max: 10, grid: { color: css("--line") } },
          y: { grid: { display: false } },
        },
      },
    });
    $("#exportNotesBtn").onclick = () => exportChartPng(cnv, "satisfaction-destinations.png");
  }

  /* ---- Demande totale ---- */
  function rendreDemande(dt) {
    const [c1, c2] = palette();
    const labels = [...dt.hist_labels, ...dt.prev_labels];
    const pad = new Array(dt.hist.length - 1).fill(null);
    const cnv = $("#ch-demande");
    chDemande = makeChart(cnv, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Historique", data: [...dt.hist, ...new Array(dt.prev.length).fill(null)],
            borderColor: c1, backgroundColor: `color-mix(in srgb, ${c1} 15%, transparent)`,
            fill: true, pointRadius: 0, tension: .3, borderWidth: 2 },
          { label: "Prévision IA", data: [...pad, dt.hist[dt.hist.length - 1], ...dt.prev],
            borderColor: c2, backgroundColor: "transparent",
            borderDash: [6, 4], pointRadius: 2, tension: .3, borderWidth: 2 },
        ],
      },
      options: {
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom", labels: { usePointStyle: true, pointStyleWidth: 20, padding: 16 } },
          tooltip: { callbacks: { label: (c) => ` ${nf.format(Math.round(c.parsed.y))} k` } },
        },
        scales: {
          x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } },
          y: { beginAtZero: false, title: { display: true, text: "Milliers de touristes" } },
        },
      },
    });
    $("#exportDemandeBtn").onclick = () => exportChartPng(cnv, "demande-historique-prevision.png");
  }

  /* ---- Heatmap aspects ---- */
  function rendreAspects(asp) {
    heatTable($("#heat-aspects"), asp.destinations, asp.aspects, asp.valeurs, {
      mode: "diverging", limit: 1,
      format: (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2).replace(".", ","),
    });
  }

  /* ---- Saisonnalité des prix ---- */
  function rendrePrixSaisonnalite(sp) {
    const [c1, c2] = palette();
    const cnv = $("#ch-prix");
    chPrix = makeChart(cnv, {
      type: "bar",
      data: {
        labels: sp.labels,
        datasets: [{
          data: sp.valeurs,
          backgroundColor: sp.valeurs.map((v) => (v >= 1 ? c2 : c1)),
          borderRadius: 5,
        }],
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => ` ${c.parsed.y.toFixed(2)} (${c.parsed.y >= 1 ? "+" : ""}${((c.parsed.y - 1) * 100).toFixed(0)} %)` } },
        },
        scales: {
          y: { min: 0.7, title: { display: true, text: "Indice (1 = prix moyen)" } },
          x: { grid: { display: false } },
        },
      },
    });
    $("#exportPrixSaisBtn").onclick = () => exportChartPng(cnv, "saisonnalite-prix.png");
  }

  /* ---- Répartition par étoiles ---- */
  function rendreEtoiles(re) {
    if (!re) return;
    const cnv = $("#ch-etoiles");
    if (!cnv) return;
    chEtoiles = makeChart(cnv, {
      type: "bar",
      data: {
        labels: re.labels,
        datasets: [{
          data: re.valeurs,
          backgroundColor: palette(),
          borderRadius: 5,
          maxBarThickness: 32,
        }],
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => ` ${c.parsed.y} établissements` } },
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: "Établissements" } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  /* ---- Répartition types d'hébergement ---- */
  function rendreTypes(rt) {
    if (!rt) return;
    const cols = palette();
    const cnv = $("#ch-types");
    chTypes = makeChart(cnv, {
      type: "doughnut",
      data: {
        labels: rt.labels,
        datasets: [{ data: rt.valeurs, backgroundColor: cols, borderWidth: 2, borderColor: css("--surface") }],
      },
      options: {
        cutout: "55%",
        plugins: {
          legend: { position: "right", labels: { usePointStyle: true, padding: 12 } },
          tooltip: { callbacks: { label: (c) => ` ${c.label} : ${c.parsed} établissements` } },
        },
      },
    });
  }

  /* ---- Répartition sentiments ---- */
  function rendreSentiment(rs) {
    if (!rs) return;
    const cnv = $("#ch-sentiment");
    chSent = makeChart(cnv, {
      type: "doughnut",
      data: {
        labels: ["Positifs", "Neutres", "Négatifs"],
        datasets: [{
          data: [rs.positif, rs.neutre, rs.négatif],
          backgroundColor: [css("--good"), css("--warn"), css("--bad")],
          borderWidth: 2, borderColor: css("--surface"),
        }],
      },
      options: {
        cutout: "55%",
        plugins: {
          legend: { position: "right", labels: { usePointStyle: true, padding: 12 } },
          tooltip: { callbacks: { label: (c) => ` ${c.label} : ${nf.format(c.parsed)} avis` } },
        },
      },
    });
  }

  /* ---- Segments ---- */
  function rendreSegments(segs) {
    if (!segs || !segs.length) {
      $("#segments").replaceChildren(el("p", { class: "muted small", text: "Aucun segment disponible." }));
      return;
    }
    $("#nb-segments").textContent = `${segs.length} profil${segs.length > 1 ? "s" : ""}`;
    const cols = ["Profil", "Établissements", "Note moy.", "Prix moy. (MAD)", "Occupation"];
    const head = el("thead", {}, el("tr", {}, cols.map((t, i) => el("th", { class: i ? "num" : "", text: t }))));
    const body = el("tbody", {}, segs.map((s) => el("tr", {}, [
      el("td", { text: s.profil }),
      el("td", { class: "num", text: nf.format(s.n) }),
      el("td", { class: "num", text: s.note.toFixed(2).replace(".", ",") }),
      el("td", { class: "num", text: nf.format(Math.round(s.prix)) }),
      el("td", { class: "num", text: Math.round(s.occ * 100) + " %" }),
    ])));
    $("#segments").replaceChildren(el("table", {}, [head, body]));

    // Export CSV
    $("#exportSegmentsBtn").onclick = () => exportCsv(
      segs.map(s => ({
        profil: s.profil,
        etablissements: s.n,
        note_moyenne: s.note.toFixed(2),
        prix_moyen_mad: Math.round(s.prix),
        occupation_pct: Math.round(s.occ * 100),
      })),
      "segments-etablissements.csv"
    );
  }

  /* ---- Filtres ---- */
  filterDest.addEventListener("change", () => charger(filterDest.value));
  resetBtn.addEventListener("click", () => {
    filterDest.value = "";
    charger("");
  });

  /* ---- Init ---- */
  await charger();
})();
