import logging
import os
from functools import wraps

from flask import Flask, jsonify, make_response, render_template, request

from core import DESTINATIONS, TYPES_HEBERGEMENT, Atlas, ValidationError

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("atlasinsight")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.config["JSON_AS_ASCII"] = False
app.json.ensure_ascii = False  # accents lisibles dans les réponses JSON

logger.info("Chargement des modèles et des données…")
atlas = Atlas()  # modèles chargés UNE fois au démarrage
logger.info("AtlasInsight prêt — dernière date données : %s", atlas.derniere_date.strftime("%Y-%m"))

MAX_AVIS = 200
MAX_CARACTERES = 3000
CACHE_DASHBOARD = 300  # secondes (5 min)


# ---------------------------------------------------------------------------
# Utilitaire cache HTTP simple (Cache-Control)
# ---------------------------------------------------------------------------
def cache(seconds: int):
    """Décorateur ajoutant Cache-Control public sur les réponses GET."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            resp = make_response(f(*args, **kwargs))
            resp.headers["Cache-Control"] = f"public, max-age={seconds}"
            return resp
        return decorated
    return decorator


# ---------------------------------------------------------------------------
# Pages HTML
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# API — données de référence
# ---------------------------------------------------------------------------
@app.get("/api/destinations")
@cache(3600)
def api_destinations():
    """Liste des destinations avec statistiques de base."""
    return jsonify(atlas.stats_destinations())


@app.get("/api/dashboard")
@cache(CACHE_DASHBOARD)
def api_dashboard():
    return jsonify(atlas.tableau_de_bord())


@app.get("/api/dashboard/destination/<destination>")
@cache(CACHE_DASHBOARD)
def api_dashboard_destination(destination):
    """Tableau de bord filtré par destination."""
    if destination not in DESTINATIONS:
        raise ValidationError(f"Destination inconnue : {destination}")
    return jsonify(atlas.tableau_de_bord(destination=destination))


# ---------------------------------------------------------------------------
# API — sentiment
# ---------------------------------------------------------------------------
@app.post("/api/sentiment")
def api_sentiment():
    """Corps JSON : {"textes": ["avis 1", "avis 2", ...]}"""
    data = request.get_json(silent=True) or {}
    textes = data.get("textes")
    if not isinstance(textes, list) or not textes:
        raise ValidationError("Envoyez une liste « textes » non vide.")
    if len(textes) > MAX_AVIS:
        raise ValidationError(f"Maximum {MAX_AVIS} avis par requête.")
    textes = [str(t).strip()[:MAX_CARACTERES] for t in textes if t is not None and str(t).strip()]
    if not textes:
        raise ValidationError("Les avis sont vides.")
    logger.info("Analyse sentiment — %d avis", len(textes))
    resultats = atlas.analyser_avis(textes)
    n = len(resultats)
    resume = {s: sum(r["sentiment"] == s for r in resultats) for s in ("positif", "neutre", "négatif")}
    return jsonify({"resultats": resultats, "resume": resume, "total": n})


# ---------------------------------------------------------------------------
# API — demande
# ---------------------------------------------------------------------------
@app.get("/api/demande/<destination>")
@cache(CACHE_DASHBOARD)
def api_demande(destination):
    return jsonify(atlas.demande(destination))


@app.get("/api/calendrier")
@cache(CACHE_DASHBOARD)
def api_calendrier():
    return jsonify(atlas.calendrier_demande())


# ---------------------------------------------------------------------------
# API — hôtels
# ---------------------------------------------------------------------------
@app.get("/api/hotels")
@cache(3600)
def api_hotels():
    return jsonify(atlas.liste_hotels())


@app.get("/api/hotels/<hotel_id>")
@cache(3600)
def api_hotel(hotel_id):
    try:
        return jsonify(atlas.hotel(hotel_id))
    except ValidationError as e:
        return jsonify({"erreur": str(e)}), 404


# ---------------------------------------------------------------------------
# API — prix
# ---------------------------------------------------------------------------
@app.post("/api/prix")
def api_prix():
    """Corps JSON : caractéristiques de l'établissement (voir README)."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValidationError("Corps JSON attendu.")
    logger.info("Prédiction prix — destination=%s", data.get("destination", "?"))
    return jsonify(atlas.recommander_prix(data))


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "derniere_date_donnees": atlas.derniere_date.strftime("%Y-%m"),
        "destinations": len(DESTINATIONS),
        "etablissements": int(len(atlas.hotels)),
    })


# ---------------------------------------------------------------------------
# Gestion des erreurs
# ---------------------------------------------------------------------------
@app.errorhandler(ValidationError)
def erreur_validation(e):
    logger.warning("Validation — %s", e)
    return jsonify({"erreur": str(e)}), 400


@app.errorhandler(404)
def erreur_404(e):
    if request.path.startswith("/api/"):
        return jsonify({"erreur": "Ressource introuvable."}), 404
    return render_template("erreur.html", page="", message="Page introuvable."), 404


@app.errorhandler(500)
def erreur_500(e):
    logger.error("Erreur interne : %s", e)
    if request.path.startswith("/api/"):
        return jsonify({"erreur": "Erreur interne du serveur."}), 500
    return render_template("erreur.html", page="", message="Une erreur interne est survenue."), 500


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=int(os.environ.get("PORT", 5000)),
        debug=os.environ.get("FLASK_DEBUG") == "1",
    )
