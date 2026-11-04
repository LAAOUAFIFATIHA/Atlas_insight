"use strict";
/* ============================================================
   AtlasInsight — Demande touristique (demande.js)
   ============================================================ */

(function () {
  const select = $("#destination");
  const NIVEAU = (i) => i >= 1.12 ? ["up", "▲ Haute"] : i <= 0.88 ? ["down", "▼ Basse"] : ["flat", "● Moyenne"];

  let prevData = null;
  let chDemande = null;
  let calendrierData = null;

  /* ---- Chargement données destination ---- */
  async function charger() {
    const dest = select.value;
    const kpiEl = $("#kpis");
    kpiEl.replaceChildren(
      ...Array.from({ length: 4 }, () => el("div", { class: "skeleton skeleton-kpi" }))
    );
    $("#table-prev").replaceChildren(el("div", { class: "skeleton skeleton-chart" }));

    let d;
    try {
      d = await api("/api/demande/" + encodeURIComponent(dest));
    } catch (e) {
      showError(kpiEl, e.message);
      return;
    }
    prevData = d;

    // KPIs
    const signe = d.croissance_pct >= 0 ? "+" : "−";
    const trendDir = d.croissance_pct >= 0 ? "up" : "down";
    kpiEl.replaceChildren(
      kpiCard({
        label: "Arrivées prévues (12 mois)",
        value: `${nf.format(Math.round(d.total_12m_prevu))} k`,
        note: `vs ${nf.format(Math.round(d.total_12m_precedent))} k (12 mois précédents)`,
        trend: `${signe}${Math.abs(d.croissance_pct).toLocaleString("fr-FR")} %`,
        trendDir,
        tooltip: "Total des arrivées prévues sur les 12 prochains mois par le modèle",
      }),
      kpiCard({
        label: "Évolution prévue",
        value: `${signe}${Math.abs(d.croissance_pct).toLocaleString("fr-FR")} %`,
        note: "par rapport aux 12 derniers mois",
        trendDir,
      }),
      kpiCard({
        label: "Mois les plus chargés",
        value: d.mois_forts[0],
        note: d.mois_forts.slice(1).join(", "),
        tooltip: "Top 3 des mois avec la fréquentation prévue la plus forte",
      }),
      kpiCard({
        label: "Mois les plus calmes",
        value: d.mois_faibles[0],
        note: d.mois_faibles.slice(1).join(", "),
        tooltip: "Top 3 des mois avec la fréquentation prévue la plus faible",
      })
    );

    // Graphique
    const h = d.historique, p = d.prevision;
    const [c1, c2] = palette();
    const cnv = $("#ch-demande");
    chDemande = makeChart(cnv, {
      type: "line",
      data: {
        labels: [...h.map(x => x.label), ...p.map(x => x.label)],
        datasets: [
          { label: "Observé", data: [...h.map(x => x.valeur), ...p.map(() => null)],
            borderColor: c1, backgroundColor: `color-mix(in srgb, ${c1} 15%, transparent)`,
            fill: true, pointRadius: 0, tension: .3, borderWidth: 2.5 },
          { label: "Prévision IA",
            data: [...h.slice(0, -1).map(() => null), h[h.length - 1].valeur, ...p.map(x => x.valeur)],
            borderColor: c2, borderDash: [7, 4], pointRadius: 3, tension: .3, borderWidth: 2.5,
            backgroundColor: "transparent" },
        ],
      },
      options: {
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom", labels: { usePointStyle: true, pointStyleWidth: 24, padding: 16 } },
          tooltip: { callbacks: { label: (c) => ` ${nf.format(Math.round(c.parsed.y))} k touristes` } },
        },
        scales: {
          x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } },
          y: { beginAtZero: true, title: { display: true, text: "Milliers de touristes" } },
        },
      },
    });

    $("#exportDemandeChartBtn").onclick = () => exportChartPng(cnv, `demande-${dest}.png`);

    // Tableau
    const head = el("thead", {}, el("tr", {}, [
      "Mois", "Arrivées (k)", "Indice", "Fréquentation"
    ].map((t, i) => el("th", { class: i && i < 3 ? "num" : "", text: t }))));
    const body = el("tbody", {}, p.map(x => {
      const [cls, txt] = NIVEAU(x.indice);
      return el("tr", {}, [
        el("td", { text: x.label }),
        el("td", { class: "num", text: nf.format(Math.round(x.valeur)) }),
        el("td", { class: "num", text: x.indice.toFixed(2).replace(".", ",") }),
        el("td", {}, el("span", { class: `badge ${cls}`, text: txt })),
      ]);
    }));
    $("#table-prev").replaceChildren(el("table", {}, [head, body]));

    // Exports
    $("#exportDemandeBtn").onclick = () => exportCsv(
      p.map(x => ({ mois: x.label, arrivees_k: Math.round(x.valeur), indice: x.indice.toFixed(2) })),
      `prevision-demande-${dest}.csv`
    );
    $("#exportTableBtn").onclick = () => exportCsv(
      p.map(x => ({ mois: x.label, arrivees_k: Math.round(x.valeur), indice: x.indice.toFixed(2) })),
      `prevision-demande-${dest}.csv`
    );
  }

  /* ---- Calendrier toutes destinations ---- */
  async function chargerCalendrier() {
    try {
      calendrierData = await api("/api/calendrier");
      heatTable($("#calendrier"), calendrierData.destinations, calendrierData.mois, calendrierData.valeurs, {
        mode: "sequential",
        format: (v) => v.toFixed(2).replace(".", ","),
      });
      $("#exportCalendrierBtn").onclick = () => {
        const rows = [];
        calendrierData.destinations.forEach((dest, i) => {
          const row = { destination: dest };
          calendrierData.mois.forEach((m, j) => { row[m] = calendrierData.valeurs[i][j].toFixed(2); });
          rows.push(row);
        });
        exportCsv(rows, "calendrier-demande.csv");
      };
    } catch (e) {
      showError($("#calendrier"), e.message);
    }
  }

  /* ---- Initialisation ---- */
  select.addEventListener("change", charger);
  charger();
  chargerCalendrier();
})();
