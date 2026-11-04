"""Tests rapides : python -m unittest -v"""
import unittest

from app import app


class TestAtlasInsight(unittest.TestCase):
    def setUp(self):
        self.c = app.test_client()

    def test_pages(self):
        for url in ("/", "/avis", "/demande", "/prix", "/health"):
            self.assertEqual(self.c.get(url).status_code, 200, url)

    def test_sentiment(self):
        r = self.c.post("/api/sentiment", json={"textes": ["Séjour exceptionnel ! Personnel adorable et chambre impeccable.",
                                                           "Très déçus. Chambre sale, personnel désagréable."]})
        self.assertEqual(r.status_code, 200)
        res = r.get_json()["resultats"]
        self.assertEqual([x["sentiment"] for x in res], ["positif", "négatif"])

    def test_sentiment_vide(self):
        self.assertEqual(self.c.post("/api/sentiment", json={"textes": []}).status_code, 400)

    def test_demande(self):
        d = self.c.get("/api/demande/Marrakech").get_json()
        self.assertEqual(len(d["prevision"]), 12)
        self.assertGreater(d["total_12m_prevu"], 0)
        self.assertEqual(self.c.get("/api/demande/Paris").status_code, 400)

    def test_prix(self):
        body = {"destination": "Agadir", "type_hebergement": "Hôtel", "etoiles": 4, "capacite_chambres": 80,
                "distance_centre_km": 1.0, "piscine": 1, "spa": 0, "petit_dej_inclus": 1, "note_moyenne_hotel": 8.0}
        r = self.c.post("/api/prix", json=body).get_json()
        self.assertEqual(len(r["mois"]), 12)
        # une demande plus forte ne doit pas faire baisser le prix moyen recommandé
        haut = self.c.post("/api/prix", json={**body, "ajustement_demande_pct": 30}).get_json()
        self.assertGreater(haut["prix_moyen"], r["prix_moyen"])

    def test_prix_invalide(self):
        for body in ({"destination": "Paris"}, {"destination": "Agadir", "type_hebergement": "Riad", "etoiles": 9,
                                                "capacite_chambres": 5, "distance_centre_km": 1, "note_moyenne_hotel": 7}):
            self.assertEqual(self.c.post("/api/prix", json=body).status_code, 400)

    def test_hotel_inconnu(self):
        self.assertEqual(self.c.get("/api/hotels/ZZZ").status_code, 404)

    def test_api_destinations(self):
        r = self.c.get("/api/destinations")
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertEqual(len(data), 10)
        self.assertIn("destination", data[0])
        self.assertIn("etablissements", data[0])

    def test_api_dashboard(self):
        r = self.c.get("/api/dashboard")
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertIn("kpis", data)
        self.assertIn("repartition_types", data)
        self.assertIn("repartition_etoiles", data)
        self.assertIn("repartition_sentiment", data)
        self.assertEqual(data["kpis"]["destinations"], 10)

        # Test avec destination filtrée
        r_dest = self.c.get("/api/dashboard/destination/Marrakech")
        self.assertEqual(r_dest.status_code, 200)
        data_dest = r_dest.get_json()
        self.assertLess(data_dest["kpis"]["etablissements"], data["kpis"]["etablissements"])

        # Destination inconnue
        self.assertEqual(self.c.get("/api/dashboard/destination/Inconnue").status_code, 400)

    def test_demande_multi(self):
        r = self.c.get("/api/demande-multi?destinations=Marrakech,Agadir")
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertIn("Marrakech", data)
        self.assertIn("Agadir", data)
        self.assertEqual(len(data["Marrakech"]["prevision"]), 12)

        # Sans paramètre
        self.assertEqual(self.c.get("/api/demande-multi").status_code, 400)

    def test_calendrier(self):
        r = self.c.get("/api/calendrier")
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertEqual(len(data["destinations"]), 10)
        self.assertEqual(len(data["mois"]), 12)

    def test_hotels(self):
        r = self.c.get("/api/hotels")
        self.assertEqual(r.status_code, 200)
        hotels = r.get_json()
        self.assertEqual(len(hotels), 240)
        hotel_id = hotels[0]["hotel_id"]

        r_one = self.c.get(f"/api/hotels/{hotel_id}")
        self.assertEqual(r_one.status_code, 200)
        self.assertEqual(r_one.get_json()["hotel_id"], hotel_id)

    def test_sentiment_trop_long(self):
        # Plus de 200 avis doit être rejeté (HTTP 400)
        textes = ["Avis test"] * 201
        r = self.c.post("/api/sentiment", json={"textes": textes})
        self.assertEqual(r.status_code, 400)


if __name__ == "__main__":
    unittest.main()
