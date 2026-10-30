(async function () {
  let d;
  try { d = await api("/api/dashboard"); }
  catch (e) { showError($("#kpis"), e.message); return; }
  const [c1, c2, , c4] = palette();

  // KPI
  const k = d.kpis;
  const kpis = [
    ["Avis analysés", nf.format(k.avis), `${k.destinations} destinations`],
    ["Établissements", nf.format(k.etablissements), ""],
    ["Note moyenne", `${k.note_moyenne.toLocaleString("fr-FR")} / 10`, ""],
    ["Avis positifs", `${k.part_positifs.toLocaleString("fr-FR")} %`, "note ≥ 8"],
    ["Avis négatifs", `${k.part_negatifs.toLocaleString("fr-FR")} %`, "note < 6"],
  ];
  $("#kpis").replaceChildren(...kpis.map(([l, v, n]) =>
    el("div", { class: "card kpi" }, [el("div", { class: "label", text: l }), el("div", { class: "value", text: v }), el("div", { class: "note", text: n })])));

  // Note par destination
  makeChart($("#ch-notes"), {
    type: "bar",
    data: { labels: d.note_destination.labels, datasets: [{ data: d.note_destination.valeurs, backgroundColor: c1, borderRadius: 4, maxBarThickness: 18 }] },
    options: { indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.x.toFixed(2)} / 10` } } },
               scales: { x: { min: 5, max: 9 }, y: { grid: { display: false } } } },
  });

  // Demande : historique + prévision
  const dt = d.demande_totale;
  const labels = [...dt.hist_labels, ...dt.prev_labels];
  const pad = new Array(dt.hist.length - 1).fill(null);
  makeChart($("#ch-demande"), {
    type: "line",
    data: { labels, datasets: [
      { label: "Historique", data: [...dt.hist, ...new Array(dt.prev.length).fill(null)], borderColor: c1, backgroundColor: c1, pointRadius: 0, tension: .25, borderWidth: 2 },
      { label: "Prévision", data: [...pad, dt.hist[dt.hist.length - 1], ...dt.prev], borderColor: c2, backgroundColor: c2, borderDash: [6, 4], pointRadius: 2, tension: .25, borderWidth: 2 },
    ] },
    options: { interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom" } },
               scales: { x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } }, y: { beginAtZero: false } } },
  });

  // Carte de chaleur des aspects
  heatTable($("#heat-aspects"), d.aspects.destinations, d.aspects.aspects, d.aspects.valeurs,
    { mode: "diverging", limit: 1, format: (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2).replace(".", ",") });

  // Saisonnalité des prix
  const sp = d.saisonnalite_prix;
  makeChart($("#ch-prix"), {
    type: "bar",
    data: { labels: sp.labels, datasets: [{ data: sp.valeurs, backgroundColor: sp.valeurs.map((v) => (v >= 1 ? c2 : c1)), borderRadius: 4 }] },
    options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.y.toFixed(2)} (${c.parsed.y >= 1 ? "+" : ""}${((c.parsed.y - 1) * 100).toFixed(0)} %)` } } },
               scales: { y: { min: 0.7 }, x: { grid: { display: false } } } },
  });

  // Segments
  const head = el("thead", {}, el("tr", {}, ["Profil", "Établissements", "Note moyenne", "Prix moyen (MAD)", "Occupation"].map((t, i) => el("th", { class: i ? "num" : "", text: t }))));
  const body = el("tbody", {}, d.segments.map((s) => el("tr", {}, [
    el("td", { text: s.profil }), el("td", { class: "num", text: nf.format(s.n) }),
    el("td", { class: "num", text: s.note.toFixed(2).replace(".", ",") }), el("td", { class: "num", text: nf.format(Math.round(s.prix)) }),
    el("td", { class: "num", text: Math.round(s.occ * 100) + " %" })])));
  $("#segments").replaceChildren(el("table", {}, [head, body]));
})();
