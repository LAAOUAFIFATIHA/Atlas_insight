"use strict";
/* ============================================================
   AtlasInsight — Analyse des avis (sentiment.js)
   ============================================================ */

(function () {
  const MAX_AVIS_UI = 200;

  const EXEMPLES = [
    "Séjour exceptionnel ! Le personnel est adorable et aux petits soins. La chambre était impeccable et très propre. Excellent rapport qualité prix. Nous reviendrons avec plaisir.",
    "Très déçus de ce séjour. La chambre n'était pas propre et la salle de bain était sale. Personnel désagréable et service très lent. Beaucoup trop cher pour ce que c'est.",
    "Séjour mitigé. Le petit-déjeuner était correct mais peu varié. L'emplacement est correct mais il faut prendre un taxi. Le service était correct mais un peu lent.",
    "Excellente expérience, le riad est magnifique et le petit-déjeuner délicieux. Cuisine marocaine excellente au restaurant de l'hôtel.\n" +
    "Matelas inconfortable et climatisation en panne. Chambre très bruyante, impossible de dormir. Je ne recommande pas.\n" +
    "Bon séjour dans l'ensemble. Emplacement parfait, au cœur de la ville et proche de tout. La propreté était correcte sans plus.",
  ];

  const SYMBOLE = {
    positif: "▲ Positif",
    neutre:  "● Neutre",
    négatif: "▼ Négatif",
  };

  const form      = $("#form-avis");
  const zone      = $("#texte");
  const erreurEl  = $("#erreur");
  const csvInput  = $("#csv-import");
  let lastResultats = [];

  /* ---- Exemples ---- */
  $$("[data-exemple]").forEach((b) =>
    b.addEventListener("click", () => { zone.value = EXEMPLES[+b.dataset.exemple]; zone.focus(); })
  );

  /* ---- Import CSV ---- */
  csvInput.addEventListener("change", () => {
    const file = csvInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      // Heuristique : si CSV, on prend la première ou dernière colonne texte
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      // Si la première ligne ressemble à un header, on l'ignore
      let avis = lines;
      // Nettoyer les guillemets CSV
      avis = avis.map(l => l.replace(/^["']|["']$/g, "").trim()).filter(Boolean);
      if (avis.length > MAX_AVIS_UI) {
        // On ne prend que les 200 premiers et on avertit
        zone.value = avis.slice(0, MAX_AVIS_UI).join("\n");
        erreurEl.replaceChildren(
          el("div", { class: "alert alert-warn", role: "alert" },
            [`Le fichier contient ${avis.length} lignes. Seules les ${MAX_AVIS_UI} premières ont été chargées.`])
        );
      } else {
        zone.value = avis.join("\n");
        erreurEl.replaceChildren();
      }
      csvInput.value = "";
    };
    reader.readAsText(file, "UTF-8");
  });

  /* ---- Badge sentiment ---- */
  const badge = (s, texte) => el("span", { class: `badge ${s}`, text: texte || SYMBOLE[s] });

  /* ---- Carte résultat individuel ---- */
  function carte(r) {
    const probas = Object.entries(r.probabilites).map(([cls, p]) =>
      el("div", { class: "bar-row" }, [
        el("span", { text: cls }),
        el("div", { class: "bar" },
          el("span", { style: { width: `${p * 100}%`, background: cls === "positif" ? css("--good") : cls === "négatif" ? css("--bad") : css("--warn") } })
        ),
        el("span", { class: "num muted small", text: `${Math.round(p * 100)} %` }),
      ])
    );

    const parts = [
      el("div", { class: "result-head" }, [
        badge(r.sentiment),
        el("span", { class: "muted small", text: `confiance ${Math.round(r.confiance * 100)} %` }),
      ]),
      el("blockquote", { text: r.texte }),
      el("div", { class: "mt-8" }, probas),
    ];

    if (r.mots_cles.length || r.mots_contraires.length) {
      parts.push(el("div", { class: "small muted mt-8", text: "Mots décisifs" }));
      const chips = [
        ...r.mots_cles.map((m)     => el("span", { class: "chip pos", text: `+ ${m}` })),
        ...r.mots_contraires.map(m => el("span", { class: "chip neg", text: `− ${m}` })),
      ];
      parts.push(el("div", { class: "chips" }, chips));
    }

    if (r.aspects.length) {
      parts.push(el("div", { class: "small muted mt-12", text: "Aspects du séjour cités" }));
      const aspTable = el("div", { class: "mt-4" }, r.aspects.map(a =>
        el("div", { class: "aspect" }, [
          el("strong", { text: a.aspect }),
          badge(a.tonalite),
          el("span", { class: "muted small", text: `« ${a.phrase} »` }),
        ])
      ));
      parts.push(aspTable);
    }

    return el("div", { class: "result" }, parts);
  }

  /* ---- Graphique résumé ---- */
  function rendreResumeSentiment(resume, total) {
    const cnv = $("#ch-resume-sent");
    makeChart(cnv, {
      type: "doughnut",
      data: {
        labels: ["Positifs", "Neutres", "Négatifs"],
        datasets: [{
          data: [resume.positif, resume.neutre, resume.négatif],
          backgroundColor: [css("--good"), css("--warn"), css("--bad")],
          borderWidth: 2, borderColor: css("--surface"),
        }],
      },
      options: {
        cutout: "55%",
        plugins: {
          legend: { position: "right", labels: { usePointStyle: true, padding: 10, font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => ` ${c.label} : ${c.parsed} / ${total}` } },
        },
      },
    });
  }

  /* ---- Résumé aspects ---- */
  function rendreResumeAspects(resultats) {
    // Agréger les scores d'aspects sur tous les résultats
    const scores = {};
    const counts = {};
    resultats.forEach(r => {
      r.aspects.forEach(a => {
        scores[a.aspect] = (scores[a.aspect] || 0) + a.score;
        counts[a.aspect] = (counts[a.aspect] || 0) + 1;
      });
    });
    const container = $("#resume-aspects");
    if (!Object.keys(scores).length) {
      container.replaceChildren(el("p", { class: "muted small", text: "Aucun aspect détecté." }));
      return;
    }
    const items = Object.entries(scores)
      .map(([asp, s]) => ({ asp, score: s / counts[asp] }))
      .sort((a, b) => b.score - a.score);

    const rows = items.map(({ asp, score }) => {
      const ton = score > 0.25 ? "positif" : score < -0.25 ? "négatif" : "neutre";
      return el("div", { class: "bar-row", style: { gridTemplateColumns: "120px 1fr 60px" } }, [
        el("span", { text: asp }),
        el("div", { class: "bar" },
          el("span", { style: {
            width: `${Math.abs(score) * 50 + 50}%`,
            background: score >= 0 ? css("--good") : css("--bad"),
          }})
        ),
        badge(ton, ton === "positif" ? "+" : ton === "négatif" ? "−" : "~"),
      ]);
    });
    container.replaceChildren(
      el("div", { class: "small caps mb-8", text: "Score moyen par aspect" }),
      ...rows
    );
  }

  /* ---- Soumission ---- */
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    erreurEl.replaceChildren();
    const textes = zone.value.split("\n").map(t => t.trim()).filter(Boolean);
    if (!textes.length) { showError(erreurEl, "Saisissez au moins un avis."); return; }
    if (textes.length > MAX_AVIS_UI) {
      showError(erreurEl, `Maximum ${MAX_AVIS_UI} avis par analyse. Vous en avez saisi ${textes.length}.`); return;
    }

    const btn = $("#btn-analyser");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-inline"></span> Analyse…`;

    try {
      const data = await postJSON("/api/sentiment", { textes });
      lastResultats = data.resultats;

      // Résumé badges
      $("#resume").replaceChildren(
        el("strong", { text: `${data.total} avis analysé${data.total > 1 ? "s" : ""} :` }),
        ...["positif", "neutre", "négatif"].map(s => badge(s, `${SYMBOLE[s]} · ${data.resume[s]}`))
      );

      // Graphique
      rendreResumeSentiment(data.resume, data.total);
      rendreResumeAspects(data.resultats);

      // Liste détaillée
      $("#liste").replaceChildren(...data.resultats.map(carte));
      $("#resultats").hidden = false;
      $("#resultats").scrollIntoView({ behavior: "smooth", block: "nearest" });

    } catch (e) {
      showError(erreurEl, e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Analyser`;
    }
  });

  /* ---- Export CSV ---- */
  $("#exportAvisBtn").addEventListener("click", () => {
    if (!lastResultats.length) return;
    exportCsv(
      lastResultats.map(r => ({
        texte: r.texte,
        sentiment: r.sentiment,
        confiance_pct: Math.round(r.confiance * 100),
        prob_positif: r.probabilites.positif,
        prob_neutre: r.probabilites.neutre,
        prob_negatif: r.probabilites["négatif"],
        mots_cles: r.mots_cles.join(" | "),
        aspects: r.aspects.map(a => `${a.aspect}:${a.tonalite}`).join(" | "),
      })),
      "analyse-avis.csv"
    );
  });
})();
