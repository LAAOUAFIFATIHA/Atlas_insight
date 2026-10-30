(function () {
  const select = $("#destination");
  const NIVEAU = (i) => (i >= 1.12 ? ["up", "▲ Haute"] : i <= 0.88 ? ["down", "▼ Basse"] : ["flat", "● Moyenne"]);

  async function charger() {
    let d;
    try { d = await api("/api/demande/" + encodeURIComponent(select.value)); }
    catch (e) { showError($("#kpis"), e.message); return; }
    const [c1, c2] = palette();
    const signe = d.croissance_pct >= 0 ? "+" : "−";

    const kpis = [
      ["Arrivées prévues (12 mois)", nf.format(d.total_12m_prevu) + " k", `contre ${nf.format(d.total_12m_precedent)} k sur les 12 mois précédents`],
      ["Évolution", `${signe}${Math.abs(d.croissance_pct).toLocaleString("fr-FR")} %`, "par rapport aux 12 derniers mois"],
      ["Mois les plus chargés", d.mois_forts[0], d.mois_forts.slice(1).join(", ")],
      ["Mois les plus calmes", d.mois_faibles[0], d.mois_faibles.slice(1).join(", ")],
    ];
    $("#kpis").replaceChildren(...kpis.map(([l, v, n]) =>
      el("div", { class: "card kpi" }, [el("div", { class: "label", text: l }), el("div", { class: "value", text: v }), el("div", { class: "note", text: n })])));

    const h = d.historique, p = d.prevision;
    makeChart($("#ch-demande"), {
      type: "line",
      data: { labels: [...h.map((x) => x.label), ...p.map((x) => x.label)], datasets: [
        { label: "Observé", data: [...h.map((x) => x.valeur), ...p.map(() => null)], borderColor: c1, backgroundColor: c1, pointRadius: 0, tension: .25, borderWidth: 2 },
        { label: "Prévision", data: [...h.slice(0, -1).map(() => null), h[h.length - 1].valeur, ...p.map((x) => x.valeur)], borderColor: c2, backgroundColor: c2, borderDash: [6, 4], pointRadius: 3, tension: .25, borderWidth: 2 },
      ] },
      options: { interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom" } },
                 scales: { x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: "Milliers" } } } },
    });

    const head = el("thead", {}, el("tr", {}, ["Mois", "Arrivées (k)", "Indice", "Fréquentation"].map((t, i) => el("th", { class: i && i < 3 ? "num" : "", text: t }))));
    const body = el("tbody", {}, p.map((x) => { const [cls, txt] = NIVEAU(x.indice); return el("tr", {}, [
      el("td", { text: x.label }), el("td", { class: "num", text: nf.format(Math.round(x.valeur)) }),
      el("td", { class: "num", text: x.indice.toFixed(2).replace(".", ",") }), el("td", {}, el("span", { class: `badge ${cls}`, text: txt }))]); }));
    $("#table-prev").replaceChildren(el("table", {}, [head, body]));
  }

  select.addEventListener("change", charger);
  charger();
  api("/api/calendrier").then((c) => heatTable($("#calendrier"), c.destinations, c.mois, c.valeurs,
    { mode: "sequential", format: (v) => v.toFixed(2).replace(".", ",") })).catch((e) => showError($("#calendrier"), e.message));
})();
