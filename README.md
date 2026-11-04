# AtlasInsight — Plateforme d'analyse intelligente du tourisme au Maroc

Application web Flask qui expose trois modèles de Machine Learning à destination des professionnels du tourisme marocain : hôtels, riads, agences de voyage, gestionnaires de destinations.

> **Données synthétiques** — Ces résultats ne sont pas des statistiques officielles du tourisme marocain. Réentraîner les modèles sur des données réelles avant tout usage décisionnel.

---

## Fonctionnalités

| Page | Modèle utilisé | Ce qu'elle fait |
|---|---|---|
| **Tableau de bord** | Données prétraitées | 7 KPI, satisfaction par destination, filtre par ville, répartitions types/étoiles/sentiments, heatmap aspects, saisonnalité des prix, segments K-Means |
| **Analyse des avis** | `modele_sentiment.joblib` | Sentiment + mots décisifs + aspects + graphique donut + import CSV + export CSV |
| **Demande touristique** | `modele_demande.joblib` | Prévision 12 mois, comparaison multi-destinations, calendrier heatmap, exports CSV/PNG |
| **Tarification** | `modele_prix.joblib` + demande prévue | Prix recommandé/mois, scénarios rapides pessimiste/référence/optimiste, repère marché, exports CSV/PNG |

---

## Lancer en local

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux
pip install -r requirements.txt
python app.py                 # → http://127.0.0.1:5000
```

Tests : `python -m unittest -v`

> **Important** : la version de scikit-learn doit être **`1.9.1`**, celle utilisée pour entraîner les modèles.
> Un fichier `.joblib` n'est pas garanti compatible entre deux versions.

---

## Structure

```
Atlas_insight/
├── app.py            Routes Flask (pages + API JSON) + logging + cache HTTP
├── core.py           Logique métier : chargement modèles, prédictions, agrégats
├── requirements.txt
├── test_app.py
├── models/           3 fichiers .joblib
│   ├── modele_sentiment.joblib   Pipeline TF-IDF + LogisticRegression
│   ├── modele_demande.joblib     Pipeline Ridge (log-linéaire, lag-12)
│   └── modele_prix.joblib        Pipeline ColumnTransformer + HistGradientBoosting
├── data/             CSV prétraités
│   ├── hotels_enrichi.csv        240 établissements × 14 colonnes
│   ├── avis_clean.csv            8 922 avis × 25 colonnes
│   ├── demande_clean.csv         1 050 lignes × 14 colonnes (janv. 2018 → sept. 2026)
│   ├── prix_clean.csv            10 800 lignes × 29 colonnes
│   └── segments_etablissements.csv  240 lignes × 13 colonnes (K-Means)
├── templates/        Pages HTML (Jinja2)
└── static/
    ├── css/style.css   Design system complet (variables, sidebar, responsive, mode sombre)
    └── js/
        ├── app.js      Utilitaires partagés (api, el, kpiCard, heatTable, exportCsv, exportChartPng, thème)
        ├── index.js    Tableau de bord
        ├── sentiment.js  Analyse des avis
        ├── demande.js  Prévision de la demande
        └── prix.js     Tarification dynamique
```

---

## API

| Méthode | URL | Rôle |
|---|---|---|
| GET | `/api/dashboard` | Données complètes du tableau de bord |
| GET | `/api/dashboard/destination/<dest>` | Tableau de bord filtré par destination |
| GET | `/api/destinations` | Statistiques de base par destination |
| POST | `/api/sentiment` | `{"textes": ["avis 1", …]}` — max 200 avis |
| GET | `/api/demande/<destination>` | Historique + prévision 12 mois |
| GET | `/api/calendrier` | Indice de demande, toutes destinations |
| GET | `/api/demande-multi?destinations=A,B` | Prévision multi-destinations (max 5) |
| GET | `/api/hotels`, `/api/hotels/<id>` | Liste et fiche des établissements |
| POST | `/api/prix` | Prix recommandé par mois |
| GET | `/health` | État du service |

Les erreurs de saisie renvoient HTTP 400 avec `{"erreur": "..."}`.

```bash
# Exemple tarification
curl -X POST http://127.0.0.1:5000/api/prix \
  -H "Content-Type: application/json" \
  -d '{"destination":"Marrakech","type_hebergement":"Riad","etoiles":4,
       "capacite_chambres":12,"distance_centre_km":0.5,"piscine":1,"spa":0,
       "petit_dej_inclus":1,"note_moyenne_hotel":8.2,"ajustement_demande_pct":0}'
```

---

## Modèles ML

| Modèle | Architecture | Features | Cible |
|---|---|---|---|
| **Sentiment** | TF-IDF (1-2 grams, 1418 tokens) + LogisticRegression (balanced) | Texte avis français nettoyé | positif / neutre / négatif |
| **Demande** | Pipeline OHE + Ridge | mois_sin/cos, ramadan_part, d_ramadan, evenement_can, d_can, lag_12 | Résidu log-linéaire → arrivées en milliers |
| **Prix** | ColumnTransformer + HistGradientBoostingRegressor | 15 features (destination, type, étoiles, capacité, distance, services, note, calendrier, idx_demande) | log(prix_moyen_nuit) → MAD |

---

## Mise en production

```bash
gunicorn -w 2 -b 0.0.0.0:8000 app:app
```

Chaque worker charge les modèles en mémoire (~5 s au démarrage). Pour un déploiement public :
- Reverse proxy HTTPS (Nginx, Caddy)
- Authentification si les données sont réelles
- Variable d'environnement `FLASK_DEBUG=0`

---

## Mettre à jour les données

1. Relancer le notebook d'entraînement → il régénère `models/*.joblib` et `data/*.csv`.
2. Remplacer les fichiers dans `models/` et `data/` (mêmes noms).
3. Redémarrer l'application : la prévision démarre au mois suivant la dernière date des données.

---

## Limites

- Données et modèles **synthétiques** : à réentraîner sur des données réelles avant tout usage décisionnel.
- Le modèle de sentiment est entraîné sur du français uniquement : prévoir un modèle multilingue pour de vrais avis.
- Les prix recommandés sont en MAD constants, sans projection d'inflation future.
- scikit-learn **1.9.1** requis pour la compatibilité des fichiers `.joblib`.
