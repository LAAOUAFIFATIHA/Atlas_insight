"""AtlasInsight : logique métier (chargement des modèles + prédictions).

Ce module est indépendant de Flask : on peut l'importer dans un script ou un test.
Les variables d'entrée des modèles sont calculées EXACTEMENT comme dans le notebook.
"""
from __future__ import annotations

import re
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

BASE = Path(__file__).resolve().parent
MODELS_DIR = BASE / "models"
DATA_DIR = BASE / "data"

# --------------------------------------------------------------------------- #
# Constantes (identiques au notebook)
# --------------------------------------------------------------------------- #
DESTINATIONS = ["Marrakech", "Casablanca", "Agadir", "Fès", "Tanger", "Rabat",
                "Essaouira", "Chefchaouen", "Ouarzazate", "Merzouga"]
VILLES_HOTES_CAN = {"Marrakech", "Casablanca", "Agadir", "Fès", "Tanger", "Rabat"}
TYPES_HEBERGEMENT = ["Hôtel", "Riad", "Resort", "Maison d'hôtes", "Auberge"]

RAMADAN = [("2018-05-16", "2018-06-14"), ("2019-05-06", "2019-06-04"), ("2020-04-24", "2020-05-23"),
           ("2021-04-13", "2021-05-12"), ("2022-04-02", "2022-05-01"), ("2023-03-23", "2023-04-20"),
           ("2024-03-11", "2024-04-09"), ("2025-03-01", "2025-03-30"), ("2026-02-18", "2026-03-19"),
           ("2027-02-08", "2027-03-09")]
CAN_2025 = [("2025-12-21", "2026-01-18")]

FEATS_DEMANDE = ["mois_sin", "mois_cos", "ramadan_part", "d_ramadan", "evenement_can", "d_can", "lag_12"]
FEATS_PRIX_CAT = ["destination", "type_hebergement"]
FEATS_PRIX_NUM = ["etoiles", "capacite_chambres", "distance_centre_km", "piscine", "spa", "petit_dej_inclus",
                  "note_moyenne_hotel", "mois_sin", "mois_cos", "ramadan_part", "evenement_can", "idx_demande", "t_annees"]

NOTES = ["note_proprete", "note_service", "note_emplacement", "note_qualite_prix", "note_nourriture", "note_confort"]
LIBELLE_ASPECT = {"note_proprete": "Propreté", "note_service": "Service", "note_emplacement": "Emplacement",
                  "note_qualite_prix": "Qualité/prix", "note_nourriture": "Nourriture", "note_confort": "Confort"}
MOIS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]

STOP_FR = set("""a à au aux avec ce ces cette cet dans de des du elle elles en et il ils je la le les leur leurs lui ma mais me mes
moi mon nos notre nous on ou par pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous y c d j l m n s t été
être est sont était étaient avons avez ont avait ai as fait font""".split())

ASPECT_MOTS = {
    "Propreté": {"propre", "propreté", "ménage", "sale", "draps", "poussière", "tachés", "propres", "sales"},
    "Service": {"personnel", "service", "accueil", "réception", "équipe"},
    "Emplacement": {"emplacement", "situé", "centre", "proche", "éloigné", "quartier", "accessible"},
    "Qualité/prix": {"prix", "tarif", "cher", "payé"},
    "Nourriture": {"déjeuner", "repas", "restaurant", "cuisine", "dîner", "nourriture", "café"},
    "Confort": {"lit", "literie", "confort", "confortable", "inconfortable", "bruit", "bruyante", "climatisation",
                "matelas", "insonorisation", "dormir", "dormi"},
}


class ValidationError(ValueError):
    """Erreur de saisie utilisateur (renvoyée en HTTP 400 par l'API)."""


# --------------------------------------------------------------------------- #
# Utilitaires texte et calendrier
# --------------------------------------------------------------------------- #
def normaliser_texte(t: str) -> str:
    t = str(t).lower()
    t = re.sub(r"[^a-zàâäçéèêëîïôöùûüÿœæ\s]", " ", t)
    return " ".join(t.split())


def nettoyer_texte(t: str) -> str:
    return " ".join(m for m in normaliser_texte(t).split() if len(m) > 1 and m not in STOP_FR)


def part_periode(date, periodes) -> float:
    """Part (0 à 1) du mois de `date` couverte par une liste de périodes (début, fin)."""
    debut = pd.Timestamp(date).replace(day=1)
    fin = debut + pd.offsets.MonthEnd(0)
    nb_jours = (fin - debut).days + 1
    total = 0
    for a, b in periodes:
        lo, hi = max(pd.Timestamp(a), debut), min(pd.Timestamp(b), fin)
        if hi >= lo:
            total += (hi - lo).days + 1
    return total / nb_jours


def calendrier(date, destination: str) -> dict:
    d = pd.Timestamp(date)
    return {"mois_sin": float(np.sin(2 * np.pi * d.month / 12)),
            "mois_cos": float(np.cos(2 * np.pi * d.month / 12)),
            "ramadan_part": part_periode(d, RAMADAN),
            "evenement_can": part_periode(d, CAN_2025) * (1 if destination in VILLES_HOTES_CAN else 0)}


def _split_phrases(texte: str) -> list[str]:
    return [p.strip() for p in re.split(r"(?<=[.!?])\s+", texte) if p.strip()]


# --------------------------------------------------------------------------- #
# Service principal
# --------------------------------------------------------------------------- #
class Atlas:
    def __init__(self) -> None:
        # 1) modèles entraînés dans le notebook
        self.m_sentiment = joblib.load(MODELS_DIR / "modele_sentiment.joblib")
        self.m_demande = joblib.load(MODELS_DIR / "modele_demande.joblib")
        self.m_prix = joblib.load(MODELS_DIR / "modele_prix.joblib")

        # 2) données prétraitées
        self.hotels = pd.read_csv(DATA_DIR / "hotels_enrichi.csv")
        self.avis = pd.read_csv(DATA_DIR / "avis_clean.csv", parse_dates=["date_avis"],
                                usecols=["review_id", "hotel_id", "destination", "date_avis", "note_globale", "sentiment",
                                         "saison", *NOTES])
        self.dm = pd.read_csv(DATA_DIR / "demande_clean.csv", parse_dates=["date"],
                              usecols=["destination", "date", "arrivees_milliers"])
        self.prix = pd.read_csv(DATA_DIR / "prix_clean.csv", parse_dates=["date"],
                                usecols=["hotel_id", "date", "destination", "etoiles", "prix_moyen_nuit",
                                         "taux_occupation", "prix_relatif_hotel", "mois", "t_annees", "saison"])
        self.segments = pd.read_csv(DATA_DIR / "segments_etablissements.csv")

        # 3) constantes dérivées des données
        self.derniere_date = self.dm["date"].max()
        self.cutoff = self.derniere_date + pd.offsets.MonthBegin(1)                 # 1er mois à prévoir
        self.t_max = float(self.prix["t_annees"].max())                              # prix exprimés en MAD « dernière date »
        self.moy_dest = self.dm[self.dm["date"] >= "2023-01-01"].groupby("destination")["arrivees_milliers"].mean()
        self.dates_futur = pd.date_range(self.cutoff, periods=12, freq="MS")

        self._cadre = self._construire_cadre()
        self.prevision = self._prevoir_demande()

    # ------------------------------------------------------------------ demande
    def _construire_cadre(self) -> pd.DataFrame:
        mois = pd.date_range("2018-01-01", self.dates_futur[-1], freq="MS")
        c = pd.DataFrame([(d, m) for d in DESTINATIONS for m in mois], columns=["destination", "date"])
        cal = {(d, m): calendrier(m, d) for d in DESTINATIONS for m in mois}
        for col in ("mois_sin", "mois_cos", "ramadan_part", "evenement_can"):
            c[col] = [cal[(d, m)][col] for d, m in zip(c["destination"], c["date"])]
        c = c.merge(self.dm, on=["destination", "date"], how="left")
        return c.sort_values(["destination", "date"]).reset_index(drop=True)

    def _prevoir_demande(self) -> pd.DataFrame:
        G = self._cadre.copy()
        G.loc[G["date"] >= self.cutoff, "arrivees_milliers"] = np.nan
        G["y"] = np.log(G["arrivees_milliers"])
        g = G.groupby("destination")
        G["lag_12"] = g["y"].shift(12)
        G["d_ramadan"] = G["ramadan_part"] - g["ramadan_part"].shift(12)
        G["d_can"] = G["evenement_can"] - g["evenement_can"].shift(12)
        f = G[G["date"].isin(self.dates_futur)].copy()
        f["prevu"] = np.exp(f["lag_12"] + self.m_demande.predict(f[["destination"] + FEATS_DEMANDE]))
        base12 = (self.dm[self.dm["date"] > self.derniere_date - pd.DateOffset(months=12)]
                  .groupby("destination")["arrivees_milliers"].mean())
        f["indice"] = f["prevu"] / f["destination"].map(base12)
        f["idx_demande"] = f["prevu"] / f["destination"].map(self.moy_dest)
        return f[["destination", "date", "prevu", "indice", "idx_demande"]].reset_index(drop=True)

    def demande(self, destination: str) -> dict:
        if destination not in DESTINATIONS:
            raise ValidationError(f"Destination inconnue : {destination}")
        hist = self.dm[(self.dm["destination"] == destination)].sort_values("date").tail(36)
        prev = self.prevision[self.prevision["destination"] == destination].sort_values("date")
        dernier12 = self.dm[(self.dm["destination"] == destination)
                            & (self.dm["date"] > self.derniere_date - pd.DateOffset(months=12))]["arrivees_milliers"].sum()
        total_prev = float(prev["prevu"].sum())
        top = prev.sort_values("prevu", ascending=False).head(3)
        bas = prev.sort_values("prevu").head(3)
        lab = lambda d: f"{MOIS_FR[d.month - 1]} {d.year}"
        return {
            "destination": destination,
            "historique": [{"date": d.strftime("%Y-%m"), "label": lab(d), "valeur": round(float(v), 1)}
                           for d, v in zip(hist["date"], hist["arrivees_milliers"])],
            "prevision": [{"date": r.date.strftime("%Y-%m"), "label": lab(r.date), "valeur": round(float(r.prevu), 1),
                           "indice": round(float(r.indice), 2)} for r in prev.itertuples()],
            "total_12m_prevu": round(total_prev, 0),
            "total_12m_precedent": round(float(dernier12), 0),
            "croissance_pct": round((total_prev / float(dernier12) - 1) * 100, 1),
            "mois_forts": [lab(d) for d in top["date"]],
            "mois_faibles": [lab(d) for d in bas["date"]],
        }

    def calendrier_demande(self) -> dict:
        p = self.prevision.pivot(index="destination", columns="date", values="indice").loc[DESTINATIONS]
        return {"mois": [f"{MOIS_FR[d.month - 1]} {str(d.year)[2:]}" for d in p.columns],
                "destinations": DESTINATIONS,
                "valeurs": [[round(float(v), 2) for v in row] for row in p.to_numpy()]}

    # -------------------------------------------------------------------- prix
    def hotel(self, hotel_id: str) -> dict:
        r = self.hotels[self.hotels["hotel_id"] == hotel_id]
        if r.empty:
            raise ValidationError(f"Établissement inconnu : {hotel_id}")
        r = r.iloc[0]
        return {"hotel_id": r["hotel_id"], "nom": r["nom"], "destination": r["destination"],
                "type_hebergement": r["type_hebergement"], "etoiles": int(r["etoiles"]),
                "capacite_chambres": int(r["capacite_chambres"]), "distance_centre_km": float(r["distance_centre_km"]),
                "piscine": int(r["piscine"]), "spa": int(r["spa"]), "petit_dej_inclus": int(r["petit_dej_inclus"]),
                "note_moyenne_hotel": round(float(r["note_moyenne_hotel"]), 2)}

    def liste_hotels(self) -> list[dict]:
        h = self.hotels.sort_values(["destination", "nom"])
        return [{"hotel_id": r.hotel_id, "nom": r.nom, "destination": r.destination, "etoiles": int(r.etoiles)}
                for r in h.itertuples()]

    @staticmethod
    def _valider_prix(p: dict) -> dict:
        def nombre(cle, lo, hi, defaut=None):
            v = p.get(cle, defaut)
            try:
                v = float(v)
            except (TypeError, ValueError):
                raise ValidationError(f"« {cle} » doit être un nombre.")
            if not (lo <= v <= hi):
                raise ValidationError(f"« {cle} » doit être compris entre {lo} et {hi}.")
            return v

        if p.get("destination") not in DESTINATIONS:
            raise ValidationError("Destination invalide.")
        if p.get("type_hebergement") not in TYPES_HEBERGEMENT:
            raise ValidationError("Type d'hébergement invalide.")
        return {
            "destination": p["destination"], "type_hebergement": p["type_hebergement"],
            "etoiles": int(nombre("etoiles", 1, 5)), "capacite_chambres": int(nombre("capacite_chambres", 1, 1000)),
            "distance_centre_km": nombre("distance_centre_km", 0, 50),
            "piscine": int(nombre("piscine", 0, 1, 0)), "spa": int(nombre("spa", 0, 1, 0)),
            "petit_dej_inclus": int(nombre("petit_dej_inclus", 0, 1, 0)),
            "note_moyenne_hotel": nombre("note_moyenne_hotel", 1, 10),
            "ajustement_demande_pct": nombre("ajustement_demande_pct", -50, 100, 0),
        }

    def _predire_prix(self, h: dict, dates, idx_demande) -> np.ndarray:
        lignes = []
        for dt, idx in zip(dates, idx_demande):
            ligne = {k: h[k] for k in FEATS_PRIX_CAT + ["etoiles", "capacite_chambres", "distance_centre_km", "piscine",
                                                         "spa", "petit_dej_inclus", "note_moyenne_hotel"]}
            ligne.update(calendrier(dt, h["destination"]))
            ligne["idx_demande"] = float(idx)
            ligne["t_annees"] = min((dt.year - 2023) + (dt.month - 1) / 12, self.t_max)
            lignes.append(ligne)
        X = pd.DataFrame(lignes)[FEATS_PRIX_CAT + FEATS_PRIX_NUM]
        return np.exp(self.m_prix.predict(X))

    def recommander_prix(self, params: dict) -> dict:
        h = self._valider_prix(params)
        prev = self.prevision[self.prevision["destination"] == h["destination"]].sort_values("date")
        idx = prev["idx_demande"].to_numpy() * (1 + h["ajustement_demande_pct"] / 100)
        prix = self._predire_prix(h, prev["date"].tolist(), idx)
        moy = float(prix.mean())
        mois = []
        for dt, p, i, ind in zip(prev["date"], prix, idx, prev["indice"]):
            var = (p / moy - 1) * 100
            action = "Augmenter" if var >= 8 else "Promotions" if var <= -8 else "Maintenir"
            mois.append({"date": dt.strftime("%Y-%m"), "label": f"{MOIS_FR[dt.month - 1]} {dt.year}",
                         "prix": int(round(p)), "variation_pct": round(var, 1),
                         "indice_demande": round(float(i), 2), "action": action})
        # repère marché : prix moyen constaté sur les 12 derniers mois, même destination et même catégorie
        recent = self.prix[(self.prix["date"] > self.derniere_date - pd.DateOffset(months=12))
                           & (self.prix["destination"] == h["destination"]) & (self.prix["etoiles"] == h["etoiles"])]
        marche = float(recent["prix_moyen_nuit"].mean()) if len(recent) else None
        meilleur = max(mois, key=lambda m: m["prix"])
        creux = min(mois, key=lambda m: m["prix"])
        return {"parametres": h, "mois": mois, "prix_moyen": round(moy), "prix_max": meilleur, "prix_min": creux,
                "repere_marche": round(marche) if marche else None,
                "ecart_marche_pct": round((moy / marche - 1) * 100, 1) if marche else None}

    # --------------------------------------------------------------- sentiment
    def analyser_avis(self, textes: list[str]) -> list[dict]:
        propres = [nettoyer_texte(t) for t in textes]
        tfidf, clf = self.m_sentiment.named_steps["tfidf"], self.m_sentiment.named_steps["clf"]
        X = tfidf.transform(propres)
        proba = clf.predict_proba(X)
        mots = np.array(tfidf.get_feature_names_out())
        classes = list(clf.classes_)
        out = []
        for i, texte in enumerate(textes):
            k = int(np.argmax(proba[i]))
            contrib = X[i].toarray().ravel() * clf.coef_[k]
            pour = [mots[j] for j in np.argsort(contrib)[::-1][:4] if contrib[j] > 0]
            contre = [mots[j] for j in np.argsort(contrib)[:3] if contrib[j] < 0]
            out.append({"texte": texte, "sentiment": classes[k],
                        "confiance": round(float(proba[i][k]), 3),
                        "probabilites": {c: round(float(p), 3) for c, p in zip(classes, proba[i])},
                        "mots_cles": pour, "mots_contraires": contre,
                        "aspects": self._aspects(texte)})
        return out

    def _aspects(self, texte: str) -> list[dict]:
        """Aspects cités + tonalité de la/des phrase(s) concernée(s) (modèle appliqué phrase par phrase)."""
        res = []
        phrases = _split_phrases(texte)
        if not phrases:
            return res
        clean = [nettoyer_texte(p) for p in phrases]
        probas = self.m_sentiment.predict_proba(clean)
        classes = list(self.m_sentiment.classes_)
        ip, ineg = classes.index("positif"), classes.index("négatif")
        for asp, kws in ASPECT_MOTS.items():
            idxs = [i for i, p in enumerate(phrases) if set(normaliser_texte(p).split()) & kws]
            if not idxs:
                continue
            score = float(np.mean([probas[i][ip] - probas[i][ineg] for i in idxs]))   # -1 (négatif) à +1 (positif)
            ton = "positif" if score > 0.25 else "négatif" if score < -0.25 else "neutre"
            res.append({"aspect": asp, "tonalite": ton, "score": round(score, 2), "phrase": phrases[idxs[0]]})
        return res

    # --------------------------------------------------------------- dashboard
    def tableau_de_bord(self) -> dict:
        a = self.avis
        par_dest = a.groupby("destination")["note_globale"].mean().sort_values(ascending=False)
        heat = a.groupby("destination")[NOTES].mean().loc[par_dest.index]
        moyenne_nat = a[NOTES].mean()
        hist = self.dm[self.dm["date"] >= self.derniere_date - pd.DateOffset(months=23)].groupby("date")["arrivees_milliers"].sum()
        fut = self.prevision.groupby("date")["prevu"].sum()
        lab = lambda d: f"{MOIS_FR[d.month - 1]} {str(d.year)[2:]}"
        prix_mois = self.prix.groupby("mois")["prix_relatif_hotel"].mean()
        seg = self.segments.groupby("profil").agg(n=("hotel_id", "count"), note=("note_moyenne_hotel", "mean"),
                                                  prix=("prix_moyen", "mean"), occ=("occupation", "mean")).reset_index()
        return {
            "kpis": {"avis": int(len(a)), "etablissements": int(len(self.hotels)), "destinations": len(DESTINATIONS),
                     "note_moyenne": round(float(a["note_globale"].mean()), 2),
                     "part_positifs": round(float((a["sentiment"] == "positif").mean() * 100), 1),
                     "part_negatifs": round(float((a["sentiment"] == "négatif").mean() * 100), 1)},
            "note_destination": {"labels": par_dest.index.tolist(), "valeurs": par_dest.round(2).tolist()},
            "aspects": {"aspects": [LIBELLE_ASPECT[c] for c in NOTES], "destinations": heat.index.tolist(),
                        "valeurs": [[round(float(v - moyenne_nat[c]), 2) for c, v in row.items()] for _, row in heat.iterrows()]},
            "demande_totale": {"hist_labels": [lab(d) for d in hist.index], "hist": hist.round(0).tolist(),
                               "prev_labels": [lab(d) for d in fut.index], "prev": fut.round(0).tolist()},
            "saisonnalite_prix": {"labels": MOIS_FR, "valeurs": [round(float(prix_mois.get(m, np.nan)), 3) for m in range(1, 13)]},
            "segments": seg.round(2).to_dict(orient="records"),
        }
