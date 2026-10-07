"""Tests voor salespaneel_data.py op een handvol nagemaakte JSONL-regels.

Draaien: python3 -m unittest scripts/test_salespaneel_data.py
"""

import datetime as dt
import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import salespaneel_data as sd  # noqa: E402

NU = dt.datetime(2026, 10, 7, 7, 45, tzinfo=dt.timezone.utc)

KANSEN = [
    {"id": 1, "name": "Pilot groep 7", "party": {"id": 10, "name": "De Regenboog"},
     "milestone": {"name": "Voorstel"}, "value": {"amount": 2500, "currency": "EUR"},
     "lastContactAt": "2026-09-27T10:00:00Z", "expectedCloseOn": "2026-10-10",
     "owner": {"name": "Menno"}},
    {"id": 2, "name": "Teamtraining", "party": {"id": 10, "name": "De Regenboog"},
     "milestone": {"name": "Lead"}, "value": {"amount": None},
     "updatedAt": "2026-10-06T09:00:00Z"},
    {"id": 3, "name": "Afgerond", "party": {"id": 11, "name": "Het Kompas"},
     "milestone": {"name": "Won"}, "value": {"amount": 9000}},
    {"id": 4, "name": "Verloren", "party": {"id": 11, "name": "Het Kompas"},
     "milestone": {"name": "Lost"}, "value": {"amount": 100}},
    {"id": 5, "name": "Zonder school", "milestone": {"name": "Lead"}, "value": None},
]
TAKEN = [
    {"id": 100, "description": "Bellen", "dueOn": "2026-10-04", "status": "OPEN",
     "party": {"id": 10, "name": "De Regenboog"}},
    {"id": 101, "description": "Klaar", "dueOn": "2026-10-01", "status": "COMPLETED",
     "party": {"id": 10, "name": "De Regenboog"}},
    {"id": 102, "description": "Via kans", "dueOn": "2026-10-09", "status": "OPEN",
     "opportunity": {"id": 1}},
]
PARTIES = [
    {"id": 10, "name": "De Regenboog", "about": "Directeur: J. Jansen\n06-12345678\n\nib@regenboog.test"},
]


class SnapshotTest(unittest.TestCase):
    def setUp(self):
        self.s = sd.bouw_snapshot(KANSEN, TAKEN, PARTIES, NU)
        self.scholen = {x["naam"]: x for x in self.s["scholen"]}

    def test_dagen_stil(self):
        regenboog = self.scholen["De Regenboog"]
        kansen = {k["titel"]: k for k in regenboog["kansen"]}
        self.assertEqual(kansen["Pilot groep 7"]["dagen_stil"], 10)
        self.assertEqual(kansen["Teamtraining"]["dagen_stil"], 1)
        self.assertEqual(regenboog["laatste_contact"], "2026-10-06")
        self.assertEqual(regenboog["dagen_stil"], 1)

    def test_kansen_zonder_waarde_tellen_als_onbekend(self):
        fases = {f["naam"]: f for f in self.s["fases"]}
        self.assertEqual(fases["Lead"]["aantal"], 2)
        self.assertEqual(fases["Lead"]["zonder_waarde"], 2)
        self.assertEqual(fases["Lead"]["waarde"], 0)
        self.assertEqual(fases["Voorstel"]["waarde"], 2500)
        self.assertEqual(fases["Voorstel"]["zonder_waarde"], 0)
        self.assertIsNone(self.scholen["De Regenboog"]["kansen"][1]["waarde"])

    def test_won_lost_eruit_maar_geteld(self):
        self.assertNotIn("Het Kompas", self.scholen)
        self.assertEqual(self.s["gesloten"], {"won": 1, "lost": 1})
        self.assertNotIn("Won", [f["naam"] for f in self.s["fases"]])

    def test_regel_zonder_party_niet_fataal(self):
        zonder = self.scholen[sd.ZONDER_SCHOOL]
        self.assertEqual([k["titel"] for k in zonder["kansen"]], ["Zonder school"])
        self.assertEqual(self.s["scholen"][-1]["naam"], sd.ZONDER_SCHOOL)

    def test_taken(self):
        taken = {t["titel"]: t for t in self.scholen["De Regenboog"]["taken"]}
        self.assertEqual(taken["Bellen"]["dagen_te_laat"], 3)
        self.assertEqual(taken["Via kans"]["dagen_te_laat"], 0)
        self.assertNotIn("Klaar", taken)

    def test_contactregels_en_eigenaar(self):
        r = self.scholen["De Regenboog"]
        self.assertEqual(r["contact"], ["Directeur: J. Jansen", "06-12345678", "ib@regenboog.test"])
        self.assertEqual(r["eigenaar"], "Menno")

    def test_leeg_snapshot(self):
        s = sd.bouw_snapshot([], [], [], NU)
        self.assertTrue(s["leeg"])
        self.assertEqual(s["scholen"], [])
        self.assertEqual(s["gegenereerd"], "2026-10-07T07:45:00+00:00")


class ScriptTest(unittest.TestCase):
    def schrijf(self, d, naam, regels):
        with open(os.path.join(d, naam), "w") as f:
            for r in regels:
                f.write(r if isinstance(r, str) else json.dumps(r))
                f.write("\n")

    def run_script(self, d, out):
        script = os.path.join(os.path.dirname(__file__), "salespaneel_data.py")
        return subprocess.run([sys.executable, script, "--capsule-dir", d, "--out", out,
                               "--now", "2026-10-07T07:45:00+02:00"],
                              capture_output=True, text=True)

    def test_schrijft_json(self):
        with tempfile.TemporaryDirectory() as d:
            self.schrijf(d, "opportunities.jsonl", KANSEN)
            self.schrijf(d, "tasks.jsonl", TAKEN)
            out = os.path.join(d, "uit", "salespaneel.json")
            r = self.run_script(d, out)
            self.assertEqual(r.returncode, 0, r.stderr)
            with open(out) as f:
                s = json.load(f)
            self.assertEqual(len(s["scholen"]), 2)
            self.assertEqual(s["gegenereerd"], "2026-10-07T07:45:00+02:00")

    def test_faalt_hard_bij_kapotte_regel(self):
        with tempfile.TemporaryDirectory() as d:
            self.schrijf(d, "opportunities.jsonl", ['{"id": 1', ])
            self.schrijf(d, "tasks.jsonl", [])
            r = self.run_script(d, os.path.join(d, "s.json"))
            self.assertEqual(r.returncode, 1)
            self.assertIn("kapotte regel 1", r.stderr)

    def test_faalt_hard_bij_ontbrekend_bestand(self):
        with tempfile.TemporaryDirectory() as d:
            r = self.run_script(d, os.path.join(d, "s.json"))
            self.assertEqual(r.returncode, 1)
            self.assertIn("invoer ontbreekt", r.stderr)


if __name__ == "__main__":
    unittest.main()
