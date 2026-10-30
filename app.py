import os

from flask import Flask, jsonify, render_template, request

from core import DESTINATIONS, TYPES_HEBERGEMENT, Atlas, ValidationError

app = Flask(__name__)
app.config["JSON_AS_ASCII"] = False
app.json.ensure_ascii = False                      # accents lisibles dans les réponses JSON

atlas = Atlas()                                    # modèles chargés UNE fois au démarrage

MAX_AVIS = 200
MAX_CARACTERES = 3000


# ------------------------------------------------------------------ pages HTML
@app.get("/")
def accueil():
    return render_template("index.html", page="accueil")


@app.get("/avis")
def page_avis():
    return render_template("sentiment.html", page="avis")


@app.get("/demande")
def page_demande():
    return render_template("demande.html", page="demande", destinations=DESTINATIONS)


@app.get("/prix")
def page_prix():
    return render_template("prix.html", page="prix", destinations=DESTINATIONS, types=TYPES_HEBERGEMENT)


# ------------------------------------------------------------------------ API
@app.get("/api/dashboard")
def api_dashboard():
    return jsonify(atlas.tableau_de_bord())


@app.post("/api/sentiment")
def api_sentiment():
    """Corps JSON : {"textes": ["avis 1", "avis 2", ...]}"""
    data = request.get_json(silent=True) or {}
    textes = data.get("textes")
    if not isinstance(textes, list) or not textes:
        raise ValidationError("Envoyez une liste « textes » non vide.")
    if len(textes) > MAX_AVIS:
        raise ValidationError(f"Maximum {MAX_AVIS} avis par requête.")
    textes = [str(t).strip()[:MAX_CARACTERES] for t in textes if str(t).strip()]
    if not textes:
        raise ValidationError("Les avis sont vides.")
    resultats = atlas.analyser_avis(textes)
    n = len(resultats)
    resume = {s: sum(r["sentiment"] == s for r in resultats) for s in ("positif", "neutre", "négatif")}
    return jsonify({"resultats": resultats, "resume": resume, "total": n})


@app.get("/api/demande/<destination>")
def api_demande(destination):
    return jsonify(atlas.demande(destination))


@app.get("/api/calendrier")
def api_calendrier():
    return jsonify(atlas.calendrier_demande())


@app.get("/api/hotels")
def api_hotels():
    return jsonify(atlas.liste_hotels())


@app.get("/api/hotels/<hotel_id>")
def api_hotel(hotel_id):
    try:
        return jsonify(atlas.hotel(hotel_id))
    except ValidationError as e:
        return jsonify({"erreur": str(e)}), 404


@app.post("/api/prix")
def api_prix():
    """Corps JSON : caractéristiques de l'établissement (voir README)."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValidationError("Corps JSON attendu.")
    return jsonify(atlas.recommander_prix(data))


@app.get("/health")
def health():
    return jsonify({"status": "ok", "derniere_date_donnees": atlas.derniere_date.strftime("%Y-%m")})


# ------------------------------------------------------------------- erreurs
@app.errorhandler(ValidationError)
def erreur_validation(e):
    return jsonify({"erreur": str(e)}), 400


@app.errorhandler(404)
def erreur_404(e):
    if request.path.startswith("/api/"):
        return jsonify({"erreur": "Ressource introuvable."}), 404
    return render_template("erreur.html", page="", message="Page introuvable."), 404


@app.errorhandler(500)
def erreur_500(e):
    if request.path.startswith("/api/"):
        return jsonify({"erreur": "Erreur interne du serveur."}), 500
    return render_template("erreur.html", page="", message="Une erreur interne est survenue."), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5000)), debug=os.environ.get("FLASK_DEBUG") == "1")
