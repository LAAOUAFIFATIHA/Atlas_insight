(function () {
  const EXEMPLES = [
    "Séjour exceptionnel ! Le personnel est adorable et aux petits soins. La chambre était impeccable et très propre. Excellent rapport qualité prix. Nous reviendrons avec plaisir.",
    "Très déçus de ce séjour. La chambre n'était pas propre et la salle de bain était sale. Personnel désagréable et service très lent. Beaucoup trop cher pour ce que c'est.",
    "Séjour mitigé. Le petit-déjeuner était correct mais peu varié. L'emplacement est correct mais il faut prendre un taxi. Le service était correct mais un peu lent.",
    "Excellente expérience, le riad est magnifique et le petit-déjeuner délicieux. Cuisine marocaine excellente au restaurant de l'hôtel.\n" +
    "Matelas inconfortable et climatisation en panne. Chambre très bruyante, impossible de dormir. Je ne recommande pas.\n" +
    "Bon séjour dans l'ensemble. Emplacement parfait, au cœur de la ville et proche de tout. La propreté était correcte sans plus.",
  ];
  const form = $("#form-avis"), zone = $("#texte"), erreur = $("#erreur");
  const SYMBOLE = { positif: "▲ Positif", neutre: "● Neutre", négatif: "▼ Négatif" };

  $$("[data-exemple]").forEach((b) => b.addEventListener("click", () => { zone.value = EXEMPLES[+b.dataset.exemple]; zone.focus(); }));

  const badge = (s, texte) => el("span", { class: `badge ${s}`, text: texte || SYMBOLE[s] });

  function carte(r) {
    const probas = Object.entries(r.probabilites).map(([cls, p]) =>
      el("div", { class: "bar-row" }, [el("span", { text: cls }), el("div", { class: "bar" }, el("span", { style: { width: `${p * 100}%` } })), el("span", { class: "num", text: `${Math.round(p * 100)} %` })]));
    const parts = [
      el("div", { class: "result-head" }, [badge(r.sentiment), el("span", { class: "muted", text: `confiance ${Math.round(r.confiance * 100)} %` })]),
      el("blockquote", { text: r.texte }),
      el("div", {}, probas),
    ];
    if (r.mots_cles.length) parts.push(el("div", { class: "small muted", style: { marginTop: "8px" }, text: "Mots qui ont pesé dans la décision" }),
      el("div", { class: "chips" }, r.mots_cles.map((m) => el("span", { class: "chip", text: m }))));
    if (r.aspects.length) {
      parts.push(el("div", { class: "small muted", style: { marginTop: "10px" }, text: "Aspects du séjour cités" }));
      r.aspects.forEach((a) => parts.push(el("div", { class: "aspect" }, [
        el("strong", { text: a.aspect }), badge(a.tonalite), el("span", { class: "muted", text: `« ${a.phrase} »` })])));
    }
    return el("div", { class: "result" }, parts);
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    erreur.replaceChildren();
    const textes = zone.value.split("\n").map((t) => t.trim()).filter(Boolean);
    if (!textes.length) { showError(erreur, "Saisissez au moins un avis."); return; }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "Analyse…";
    try {
      const data = await postJSON("/api/sentiment", { textes });
      $("#resume").replaceChildren(
        el("strong", { text: `${data.total} avis analysé${data.total > 1 ? "s" : ""} :` }),
        ...["positif", "neutre", "négatif"].map((s) => badge(s, `${SYMBOLE[s]} · ${data.resume[s]}`)));
      $("#liste").replaceChildren(...data.resultats.map(carte));
      $("#resultats").hidden = false;
      $("#resultats").scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e) { showError(erreur, e.message); }
    finally { btn.disabled = false; btn.textContent = "Analyser"; }
  });
})();
