(function () {
  const form = $("#form-prix"), erreur = $("#erreur");
  const ACTION = { Augmenter: ["up", "▲ Augmenter"], Maintenir: ["flat", "● Maintenir"], Promotions: ["down", "▼ Promotions"] };
  const mad = (v) => nf.format(Math.round(v)) + " MAD";

  const ajust = $("#ajustement"), ajustVal = $("#ajustement-val");
  ajust.addEventListener("input", () => { ajustVal.textContent = `${ajust.value > 0 ? "+" : ajust.value < 0 ? "−" : ""}${Math.abs(ajust.value)} %`; });

  function remplir(h) {
    for (const k of ["destination", "type_hebergement", "etoiles", "capacite_chambres", "distance_centre_km", "note_moyenne_hotel"]) form.elements[k].value = h[k];
    for (const k of ["piscine", "spa", "petit_dej_inclus"]) form.elements[k].checked = !!h[k];
  }

  function lire() {
    const f = form.elements;
    return {
      destination: f.destination.value, type_hebergement: f.type_hebergement.value, etoiles: +f.etoiles.value,
      capacite_chambres: +f.capacite_chambres.value, distance_centre_km: +f.distance_centre_km.value,
      piscine: f.piscine.checked ? 1 : 0, spa: f.spa.checked ? 1 : 0, petit_dej_inclus: f.petit_dej_inclus.checked ? 1 : 0,
      note_moyenne_hotel: +f.note_moyenne_hotel.value, ajustement_demande_pct: +f.ajustement_demande_pct.value,
    };
  }

  function afficher(r) {
    const [c1, c2] = palette(), gris = css("--muted");
    const couleur = { Augmenter: c2, Maintenir: gris, Promotions: c1 };
    const ecart = r.ecart_marche_pct;
    const kpis = [
      ["Prix moyen recommandé", mad(r.prix_moyen), "sur les 12 prochains mois"],
      ["Prix le plus élevé", mad(r.prix_max.prix), r.prix_max.label],
      ["Prix le plus bas", mad(r.prix_min.prix), r.prix_min.label],
      ["Repère marché", r.repere_marche ? mad(r.repere_marche) : "n/d",
        ecart == null ? "" : `vous : ${ecart >= 0 ? "+" : "−"}${Math.abs(ecart).toLocaleString("fr-FR")} % vs marché (même ville, même catégorie)`],
    ];
    $("#kpis").replaceChildren(...kpis.map(([l, v, n]) =>
      el("div", { class: "card kpi" }, [el("div", { class: "label", text: l }), el("div", { class: "value", text: v }), el("div", { class: "note", text: n })])));

    const datasets = [{ type: "bar", label: "Prix recommandé", data: r.mois.map((m) => m.prix), backgroundColor: r.mois.map((m) => couleur[m.action]), borderRadius: 4 }];
    if (r.repere_marche) datasets.push({ type: "line", label: "Repère marché", data: r.mois.map(() => r.repere_marche), borderColor: css("--text-2"), borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 });
    makeChart($("#ch-prix"), {
      data: { labels: r.mois.map((m) => m.label), datasets },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.dataset.type === "line" ? ` Marché : ${mad(c.parsed.y)}` : ` ${mad(c.parsed.y)} (${r.mois[c.dataIndex].action})` } } },
                 scales: { y: { beginAtZero: true, title: { display: true, text: "MAD / nuit" } }, x: { grid: { display: false } } } },
    });

    const head = el("thead", {}, el("tr", {}, ["Mois", "Demande", "Prix (MAD)", "Variation", "Action"].map((t, i) => el("th", { class: i && i < 4 ? "num" : "", text: t }))));
    const body = el("tbody", {}, r.mois.map((m) => { const [cls, txt] = ACTION[m.action]; const v = m.variation_pct; return el("tr", {}, [
      el("td", { text: m.label }), el("td", { class: "num", text: m.indice_demande.toFixed(2).replace(".", ",") }),
      el("td", { class: "num", text: nf.format(m.prix) }),
      el("td", { class: "num", text: `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("fr-FR")} %` }),
      el("td", {}, el("span", { class: `badge ${cls}`, text: txt }))]); }));
    $("#table-prix").replaceChildren(el("table", {}, [head, body]));
    $("#sortie").hidden = false;
  }

  async function calculer() {
    erreur.replaceChildren();
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try { afficher(await postJSON("/api/prix", lire())); }
    catch (e) { showError(erreur, e.message); }
    finally { btn.disabled = false; }
  }
  form.addEventListener("submit", (ev) => { ev.preventDefault(); calculer(); });

  // liste des établissements existants (regroupés par destination)
  api("/api/hotels").then(async (hotels) => {
    const sel = $("#hotel"), groupes = {};
    hotels.forEach((h) => (groupes[h.destination] ||= []).push(h));
    Object.entries(groupes).forEach(([dest, hs]) => sel.append(el("optgroup", { label: dest }, hs.map((h) => el("option", { value: h.hotel_id, text: `${h.nom} (${h.etoiles}★)` })))));
    sel.addEventListener("change", async () => {
      if (!sel.value) return;
      try { remplir(await api("/api/hotels/" + sel.value)); calculer(); } catch (e) { showError(erreur, e.message); }
    });
    const defaut = hotels.find((h) => h.hotel_id === "H0100") || hotels[0];     // exemple affiché au chargement
    sel.value = defaut.hotel_id;
    remplir(await api("/api/hotels/" + defaut.hotel_id));
    calculer();
  }).catch((e) => showError(erreur, e.message));
})();
