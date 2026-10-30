# AtlasInsight : application web

Application Flask qui met les 3 modèles du notebook à disposition des professionnels du tourisme.

| Page | Modèle utilisé | Ce qu'elle fait |
|---|---|---|
| Tableau de bord | données prétraitées | KPI, satisfaction par destination, points forts/faibles, saisonnalité des prix, segments |
| Analyse des avis | `modele_sentiment.joblib` | sentiment + mots décisifs + tonalité de chaque aspect cité |
| Demande touristique | `modele_demande.joblib` | prévision des arrivées à 12 mois par destination |
| Tarification | `modele_prix.joblib` + demande prévue | prix recommandé par mois pour un établissement (existant ou nouveau) |

## Lancer en local

```bash
python -m venv .venv
source .venv/bin/activate            # Windows : .venv\Scripts\activate
pip install -r requirements.txt
python app.py                        # puis ouvrir http://127.0.0.1:5000
```

Tests : `python -m unittest -v`

> **Important : la version de scikit-learn doit être `1.9.1`**, celle utilisée pour entraîner les modèles dans le notebook.
> Un fichier `.joblib` n'est pas garanti compatible entre deux versions. Si vous réentraînez avec une autre version,
> mettez à jour `requirements.txt`.

## Structure

```
app/
├── app.py            routes Flask (pages + API JSON)
├── core.py           chargement des modèles + calcul des variables (sans dépendance à Flask)
├── models/           3 fichiers .joblib produits par le notebook
├── data/             CSV prétraités produits par le notebook
├── templates/        pages HTML (Jinja2)
├── static/           css, js (Chart.js inclus : fonctionne sans internet)
└── test_app.py
```

## API

| Méthode | URL | Rôle |
|---|---|---|
| POST | `/api/sentiment` | `{"textes": ["avis 1", "avis 2"]}` (max 200 avis) |
| GET | `/api/demande/<destination>` | historique et prévision à 12 mois |
| GET | `/api/calendrier` | indice de demande prévu, toutes destinations |
| GET | `/api/hotels`, `/api/hotels/<id>` | liste et fiche des établissements |
| POST | `/api/prix` | prix recommandé par mois (JSON ci-dessous) |
| GET | `/api/dashboard`, `/health` | données du tableau de bord, état du service |

```bash
curl -X POST http://127.0.0.1:5000/api/prix -H "Content-Type: application/json" -d '{
  "destination": "Marrakech", "type_hebergement": "Riad", "etoiles": 4,
  "capacite_chambres": 12, "distance_centre_km": 0.5, "piscine": 1, "spa": 0,
  "petit_dej_inclus": 1, "note_moyenne_hotel": 8.2, "ajustement_demande_pct": 0
}'
```

Les erreurs de saisie renvoient un statut 400 avec `{"erreur": "..."}`.

## Mettre à jour avec de nouvelles données

1. Relancer le notebook avec vos données : il régénère `models/*.joblib` et `data/processed/*.csv`.
2. Copier ces fichiers dans `app/models/` et `app/data/` (mêmes noms, tableau de bord : `hotels_enrichi`, `avis_clean`,
   `demande_clean`, `prix_clean`, `segments_etablissements`).
3. Redémarrer l'application : la prévision démarre automatiquement au mois suivant la dernière date des données.

## Mise en production

```bash
gunicorn -w 2 -b 0.0.0.0:8000 app:app
```

Chaque worker charge les modèles en mémoire (environ 5 secondes au démarrage). Pour un déploiement public, placez
l'application derrière un reverse proxy HTTPS (Nginx, Caddy) et ajoutez une authentification si les données sont réelles.

## Limites

- Données et modèles issus de données **synthétiques** : à réentraîner sur des données réelles avant tout usage décisionnel.
- Le modèle de sentiment est entraîné sur du français : prévoir un modèle multilingue pour de vrais avis.
- Les prix recommandés sont en MAD constants (derniers prix observés), sans inflation future.
