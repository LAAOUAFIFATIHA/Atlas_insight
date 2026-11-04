"use strict";
/* ============================================================
   AtlasInsight — Tarification dynamique (prix.js)
   ============================================================ */

(function () {
  const form     = $("#form-prix");
  const erreurEl = $("#erreur");
  const ACTION   = {
    Augmenter: ["up",   "▲ Augmenter"],
    Maintenir: ["flat", "● Maintenir"],
    Promotions:["down", "▼ Promotions"],
  };

  /* ---- Slider scénario + boutons rapides ---- */
  const ajust    = $("#ajustement");
  const ajustVal = $("#ajustement-val");

  function updateSliderDisplay() {
    const v = +ajust.value;
    ajustVal.textContent = v > 0 ? `+${v} %` : v < 0 ? `${v} %` : "0 %";
    ajustVal.style.color = v > 0 ? css("--good") : v < 0 ? css("--bad") : css("--text-3");
  }

  ajust.addEventListener("input", updateSliderDisplay);

  // Boutons scénarios rapides
  $$("[data-scenario]").forEach(btn => {
    btn.addEventListener("click", () => {
      ajust.value = btn.dataset.scenario;
      updateSliderDisplay();
      calculer();
    });
  });

  /* ---- Pré-remplissage depuis un hôtel existant ---- */
  function remplir(h) {
    const f = form.elements;
    for (const k of ["destination", "type_hebergement", "etoiles", "capacite_chambres", "distance_centre_km", "note_moyenne_hotel"]) {
      if (f[k]) f[k].value = h[k];
    }
    for (const k of ["piscine", "spa", "petit_dej_inclus"]) {
      if (f[k]) f[k].checked = !!h[k];
    }
  }

  function lire() {
    const f = form.elements;
    return {
      destination:         f.destination.value,
      type_hebergement:    f.type_hebergement.value,
      etoiles:             +f.etoiles.value,
      capacite_chambres:   +f.capacite_chambres.value,
      distance_centre_km:  +f.distance_centre_km.value,
      piscine:             f.piscine.checked ? 1 : 0,
      spa:                 f.spa.checked ? 1 : 0,
      petit_dej_inclus:    f.petit_dej_inclus.checked ? 1 : 0,
      note_moyenne_hotel:  +f.note_moyenne_hotel.value,
      ajustement_demande_pct: +f.ajustement_demande_pct.value,
    };
  }

  /* ---- Affichage des résultats ---- */
  function afficher(r) {
    const [c1, c2] = palette();
    const couleur = { Augmenter: c2, Maintenir: css("--text-3"), Promotions: c1 };
    const ecart   = r.ecart_marche_pct;

    // KPIs
    const kpiEl = $("#kpis");
    kpiEl.replaceChildren(
      kpiCard({
        label: "Prix moyen recommandé",
        value: mad(r.prix_moyen),
        note: "sur les 12 prochains mois",
        tooltip: "Moyenne des prix recommandés mois par mois pour cet établissement",
      }),
      kpiCard({
        label: "Prix le plus élevé",
        value: mad(r.prix_max.prix),
        note: r.prix_max.label,
        trendDir: "up",
      }),
      kpiCard({
        label: "Prix le plus bas",
        value: mad(r.prix_min.prix),
        note: r.prix_min.label,
        trendDir: "down",
      }),
      kpiCard({
        label: "Repère marché",
        value: r.repere_marche ? mad(r.repere_marche) : "n/d",
        note: ecart == null ? "même destination, même catégorie" :
              `Vous : ${ecart >= 0 ? "+" : ""}${ecart.toLocaleString("fr-FR")} % vs marché`,
        trendDir: ecart == null ? "flat" : ecart >= 0 ? "up" : "down",
        tooltip: "Prix moyen observé sur les 12 derniers mois pour la même destination et le même nombre d'étoiles",
      })
    );

    // Graphique
    const cnv = $("#ch-prix");
    const datasets = [{
      type: "bar",
      label: "Prix recommandé",
      data: r.mois.map(m => m.prix),
      backgroundColor: r.mois.map(m => couleur[m.action]),
      borderRadius: 5,
    }];
    if (r.repere_marche) {
      datasets.push({
        type: "line",
        label: "Repère marché",
        data: r.mois.map(() => r.repere_marche),
        borderColor: css("--text-3"),
        borderDash: [6, 4],
        pointRadius: 0,
        borderWidth: 1.5,
      });
    }
    makeChart(cnv, {
      data: { labels: r.mois.map(m => m.label), datasets },
      options: {
        plugins: {
          legend: { display: r.repere_marche != null, position: "bottom", labels: { usePointStyle: true, padding: 14 } },
          tooltip: { callbacks: { label: (c) =>
            c.dataset.type === "line"
              ? ` Marché : ${mad(c.parsed.y)}`
              : ` ${mad(c.parsed.y)} · ${r.mois[c.dataIndex].action}` }},
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: "MAD / nuit" } },
          x: { grid: { display: false } },
        },
      },
    });

    $("#exportPrixChartBtn").onclick = () => exportChartPng(cnv, `plan-tarifaire-${lire().destination}.png`);

    // Tableau
    const head = el("thead", {}, el("tr", {}, [
      "Mois", "Demande", "Prix (MAD)", "Variation", "Action"
    ].map((t, i) => el("th", { class: i && i < 4 ? "num" : "", text: t }))));
    const body = el("tbody", {}, r.mois.map(m => {
      const [cls, txt] = ACTION[m.action];
      const v = m.variation_pct;
      return el("tr", {}, [
        el("td", { text: m.label }),
        el("td", { class: "num", text: m.indice_demande.toFixed(2).replace(".", ",") }),
        el("td", { class: "num", text: nf.format(m.prix) }),
        el("td", { class: "num", text: `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("fr-FR")} %` }),
        el("td", {}, el("span", { class: `badge ${cls}`, text: txt })),
      ]);
    }));
    $("#table-prix").replaceChildren(el("table", {}, [head, body]));

    // Export CSV
    $("#exportPrixBtn").onclick = () => exportCsv(
      r.mois.map(m => ({
        mois: m.label,
        indice_demande: m.indice_demande.toFixed(2),
        prix_recommande_mad: m.prix,
        variation_pct: m.variation_pct.toFixed(1),
        action: m.action,
      })),
      `plan-tarifaire-${lire().destination}.csv`
    );

    $("#sortie").hidden = false;
    $("#sortie").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---- Calcul ---- */
  async function calculer() {
    erreurEl.replaceChildren();
    const btn = $("#btn-calculer");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-inline"></span> Calcul…`;
    try {
      afficher(await postJSON("/api/prix", lire()));
    } catch (e) {
      showError(erreurEl, e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="11" y2="14"/></svg> Calculer les prix recommandés`;
    }
  }

  form.addEventListener("submit", (ev) => { ev.preventDefault(); calculer(); });

  /* ---- Liste des hôtels ---- */
  api("/api/hotels").then(async (hotels) => {
    const sel = $("#hotel");
    const groupes = {};
    hotels.forEach(h => (groupes[h.destination] ||= []).push(h));
    Object.entries(groupes).forEach(([dest, hs]) =>
      sel.append(el("optgroup", { label: dest },
        hs.map(h => el("option", { value: h.hotel_id, text: `${h.nom} (${h.etoiles}★)` }))
      ))
    );
    sel.addEventListener("change", async () => {
      if (!sel.value) return;
      try { remplir(await api("/api/hotels/" + sel.value)); calculer(); }
      catch (e) { showError(erreurEl, e.message); }
    });
    // Charger l'exemple par défaut
    const defaut = hotels.find(h => h.hotel_id === "H0100") || hotels[0];
    sel.value = defaut.hotel_id;
    remplir(await api("/api/hotels/" + defaut.hotel_id));
    calculer();
  }).catch(e => showError(erreurEl, e.message));
})();
