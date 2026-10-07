#!/usr/bin/env python3
"""Snapshot voor het salespaneel.

Leest de Capsule-export (data/capsule/opportunities.jsonl, tasks.jsonl en,
als die er is, parties.jsonl) en schrijft data/salespaneel.json: per school
de open kansen, open taken, eigenaar, laatste contact en de contactregels
uit het about-veld, plus fase-totalen en het tijdstip van de pull.

Gesloten kansen (Won/Lost) blijven weg, behalve in de telling. Het script
faalt hard (exit 1, melding op stderr) bij een ontbrekend of kapot
invoerbestand, want het draait in een cron waar je het anders niet merkt.

Gebruik:
    python3 scripts/salespaneel_data.py [--capsule-dir data/capsule]
                                        [--out data/salespaneel.json]
                                        [--now 2026-10-07T07:45:00+02:00]
"""

import argparse
import datetime as dt
import json
import os
import sys

GESLOTEN_FASES = ("won", "lost")
ZONDER_SCHOOL = "(zonder school)"


def fout(melding):
    sys.stderr.write("salespaneel_data: " + melding + "\n")
    sys.exit(1)


def lees_jsonl(pad, verplicht=True):
    """Leest een JSONL-bestand; ontbrekend bestand is fataal als verplicht.

    Een lege of kapotte regel is fataal: liever geen snapshot dan een half.
    """
    if not os.path.exists(pad):
        if verplicht:
            fout("invoer ontbreekt: " + pad)
        return []
    regels = []
    with open(pad, encoding="utf-8") as f:
        for nr, regel in enumerate(f, 1):
            regel = regel.strip()
            if not regel:
                continue
            try:
                regels.append(json.loads(regel))
            except ValueError as e:
                fout("kapotte regel %d in %s: %s" % (nr, pad, e))
    return regels


def parse_datum(waarde):
    """Zet een Capsule-datum (ISO, met of zonder tijd) om naar een date."""
    if not waarde:
        return None
    tekst = str(waarde)
    try:
        if len(tekst) == 10:
            return dt.date.fromisoformat(tekst)
        return dt.datetime.fromisoformat(tekst.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def dagen_sinds(datum, vandaag):
    return None if datum is None else (vandaag - datum).days


def naam_van(obj, sleutel="name"):
    if isinstance(obj, dict):
        return obj.get(sleutel) or obj.get("username")
    return None


def is_gesloten(kans):
    fase = (naam_van(kans.get("milestone")) or "").strip().lower()
    return fase in GESLOTEN_FASES or bool(kans.get("closedOn"))


def contactregels(party):
    about = (party or {}).get("about") or ""
    return [r.strip() for r in str(about).splitlines() if r.strip()]


def bouw_snapshot(kansen, taken, parties, nu):
    vandaag = nu.date()
    scholen = {}
    gesloten = {"won": 0, "lost": 0}
    fases = {}
    party_per_id = {p.get("id"): p for p in parties if isinstance(p, dict)}

    def school_voor(party_obj):
        pid = (party_obj or {}).get("id")
        naam = naam_van(party_obj) or ZONDER_SCHOOL
        sleutel = pid if pid is not None else naam
        if sleutel not in scholen:
            party = party_per_id.get(pid, {})
            scholen[sleutel] = {
                "id": pid,
                "naam": naam,
                "eigenaar": None,
                "laatste_contact": None,
                "dagen_stil": None,
                "contact": contactregels(party),
                "kansen": [],
                "taken": [],
            }
        return scholen[sleutel]

    for kans in kansen:
        if not isinstance(kans, dict):
            continue
        fase = naam_van(kans.get("milestone")) or "(geen fase)"
        if is_gesloten(kans):
            sleutel = fase.strip().lower()
            if sleutel in gesloten:
                gesloten[sleutel] += 1
            continue
        waarde = (kans.get("value") or {}).get("amount")
        waarde = float(waarde) if isinstance(waarde, (int, float)) else None
        tot = fases.setdefault(fase, {"naam": fase, "aantal": 0, "waarde": 0.0, "zonder_waarde": 0})
        tot["aantal"] += 1
        if waarde is None:
            tot["zonder_waarde"] += 1
        else:
            tot["waarde"] += waarde
        contact = parse_datum(kans.get("lastContactAt")) or parse_datum(kans.get("updatedAt"))
        school = school_voor(kans.get("party"))
        school["kansen"].append({
            "id": kans.get("id"),
            "titel": kans.get("name") or "(zonder titel)",
            "fase": fase,
            "waarde": waarde,
            "dagen_stil": dagen_sinds(contact, vandaag),
            "verwachte_sluiting": kans.get("expectedCloseOn"),
        })
        if school["eigenaar"] is None:
            school["eigenaar"] = naam_van(kans.get("owner"))
        if contact and (school["laatste_contact"] is None or contact.isoformat() > school["laatste_contact"]):
            school["laatste_contact"] = contact.isoformat()

    for taak in taken:
        if not isinstance(taak, dict):
            continue
        status = str(taak.get("status") or "OPEN").upper()
        if status == "COMPLETED" or taak.get("completedAt"):
            continue
        party_obj = taak.get("party")
        if not party_obj and isinstance(taak.get("opportunity"), dict):
            # Taak hangt aan een kans: zoek de school via die kans.
            kans_id = taak["opportunity"].get("id")
            for k in kansen:
                if isinstance(k, dict) and k.get("id") == kans_id:
                    party_obj = k.get("party")
                    break
        school = school_voor(party_obj)
        verval = parse_datum(taak.get("dueOn"))
        te_laat = dagen_sinds(verval, vandaag)
        school["taken"].append({
            "id": taak.get("id"),
            "titel": taak.get("description") or "(zonder titel)",
            "vervaldatum": verval.isoformat() if verval else None,
            "dagen_te_laat": te_laat if te_laat is not None and te_laat > 0 else 0,
        })
        if school["eigenaar"] is None:
            school["eigenaar"] = naam_van(taak.get("owner"))

    for school in scholen.values():
        school["dagen_stil"] = dagen_sinds(parse_datum(school["laatste_contact"]), vandaag)
        school["kansen"].sort(key=lambda k: -(k["dagen_stil"] or 0))
        school["taken"].sort(key=lambda t: t["vervaldatum"] or "9999")

    lijst = sorted(scholen.values(), key=lambda s: (s["naam"] == ZONDER_SCHOOL, s["naam"].lower()))
    return {
        "gegenereerd": nu.isoformat(timespec="seconds"),
        "leeg": not kansen and not taken,
        "fases": sorted(fases.values(), key=lambda f: f["naam"]),
        "gesloten": gesloten,
        "scholen": lijst,
    }


def main(argv=None):
    p = argparse.ArgumentParser(description="Snapshot voor het salespaneel")
    p.add_argument("--capsule-dir", default="data/capsule")
    p.add_argument("--out", default="data/salespaneel.json")
    p.add_argument("--now", default=None, help="ISO-tijdstip; standaard nu (lokale tijd)")
    args = p.parse_args(argv)

    nu = dt.datetime.fromisoformat(args.now) if args.now else dt.datetime.now().astimezone()
    kansen = lees_jsonl(os.path.join(args.capsule_dir, "opportunities.jsonl"))
    taken = lees_jsonl(os.path.join(args.capsule_dir, "tasks.jsonl"))
    parties = lees_jsonl(os.path.join(args.capsule_dir, "parties.jsonl"), verplicht=False)

    snapshot = bouw_snapshot(kansen, taken, parties, nu)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    tmp = args.out + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, args.out)  # atomair: het paneel leest nooit een half bestand
    print("salespaneel: %d scholen, %d fases, won %d / lost %d -> %s" % (
        len(snapshot["scholen"]), len(snapshot["fases"]),
        snapshot["gesloten"]["won"], snapshot["gesloten"]["lost"], args.out))


if __name__ == "__main__":
    main()
