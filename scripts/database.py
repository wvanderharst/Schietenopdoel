#!/usr/bin/env python3
"""Bouwt de historische Schotstand-database in data/ op met de scraper.

Per competitie en seizoen komt er een bestand data/seizoenen/<code>/<seizoen>.json.
Seizoenen die al binnen zijn worden niet opnieuw opgehaald, behalve het huidige
en het vorige seizoen (die kunnen nog veranderen). Seizoenen zonder schoten op
doel bij football-data.co.uk worden onthouden en niet steeds opnieuw geprobeerd.

Daarna worden data/samenvatting.json (echte stand en schotstand per team per
seizoen) en data/index.json opnieuw berekend.

Gebruik:
    python3 scripts/database.py                 # bijwerken
    python3 scripts/database.py --vernieuw      # alles opnieuw ophalen
    python3 scripts/database.py --leagues N1    # alleen Eredivisie

Alleen standaardbibliotheek (Python 3.8+).
"""
import argparse
import json
import sys
import time
import urllib.error
from pathlib import Path

from schotstand_scraper import BASE, LEAGUES, current_season, download, parse_csv

DATA = Path(__file__).resolve().parent.parent / "data"
EERSTE_JAAR = 1993  # football-data.co.uk begint bij 1993/94

WEDSTRIJD_KOLOMMEN = ["datum", "thuis", "uit", "thuisOpDoel", "uitOpDoel", "thuisGoals", "uitGoals"]
STAND_KOLOMMEN = [
    "team", "gespeeld",
    "schotW", "schotG", "schotV", "schotVoor", "schotTegen", "schotPunten", "schotPositie",
    "echtW", "echtG", "echtV", "echtVoor", "echtTegen", "echtPunten", "echtPositie",
]


def seizoen_code(start):
    return f"{start % 100:02d}{(start + 1) % 100:02d}"


def seizoen_start(code):
    """'9394' -> 1993, '2627' -> 2026."""
    jaar = int(code[:2])
    return (1900 if jaar >= 90 else 2000) + jaar


def alle_seizoenen(huidig):
    return [seizoen_code(j) for j in range(EERSTE_JAAR, seizoen_start(huidig) + 1)]


def lees_json(pad, standaard):
    try:
        return json.loads(pad.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return standaard


def schrijf_json(pad, inhoud):
    pad.parent.mkdir(parents=True, exist_ok=True)
    pad.write_text(json.dumps(inhoud, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def seizoen_pad(code, seizoen):
    return DATA / "seizoenen" / code / f"{seizoen}.json"


def ophalen(code, seizoen):
    """Geeft (wedstrijden, overgeslagen) of None als het bestand niet bestaat."""
    url = BASE.format(season=seizoen, code=code)
    try:
        tekst = download(url)
    except urllib.error.HTTPError as err:
        if err.code == 404:
            return None
        raise
    return parse_csv(tekst, LEAGUES[code])


def stand(wedstrijden, thuis_key, uit_key):
    """Stand op basis van twee scorevelden: punten, saldo, voor, naam."""
    teams = {}
    for m in wedstrijden:
        for team in (m["thuis"], m["uit"]):
            teams.setdefault(team, {"w": 0, "g": 0, "v": 0, "voor": 0, "tegen": 0})
        thuis, uit = teams[m["thuis"]], teams[m["uit"]]
        ht, ut = m[thuis_key], m[uit_key]
        thuis["voor"] += ht
        thuis["tegen"] += ut
        uit["voor"] += ut
        uit["tegen"] += ht
        if ht > ut:
            thuis["w"] += 1
            uit["v"] += 1
        elif ht < ut:
            uit["w"] += 1
            thuis["v"] += 1
        else:
            thuis["g"] += 1
            uit["g"] += 1
    for t in teams.values():
        t["ptn"] = 3 * t["w"] + t["g"]
    volgorde = sorted(teams, key=lambda n: (-teams[n]["ptn"], -(teams[n]["voor"] - teams[n]["tegen"]), -teams[n]["voor"], n))
    for pos, naam in enumerate(volgorde, 1):
        teams[naam]["pos"] = pos
    return teams, volgorde


def samenvatting_seizoen(rijen):
    wedstrijden = [dict(zip(WEDSTRIJD_KOLOMMEN, r)) for r in rijen]
    schot, volgorde = stand(wedstrijden, "thuisOpDoel", "uitOpDoel")
    echt, _ = stand(wedstrijden, "thuisGoals", "uitGoals")
    uit = []
    for naam in volgorde:
        s, e = schot[naam], echt[naam]
        uit.append([
            naam, s["w"] + s["g"] + s["v"],
            s["w"], s["g"], s["v"], s["voor"], s["tegen"], s["ptn"], s["pos"],
            e["w"], e["g"], e["v"], e["voor"], e["tegen"], e["ptn"], e["pos"],
        ])
    return uit


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--leagues", nargs="+", default=list(LEAGUES), help="competitiecodes: " + ", ".join(LEAGUES))
    parser.add_argument("--vernieuw", action="store_true", help="alle seizoenen opnieuw ophalen")
    parser.add_argument("--pauze", type=float, default=0.5, help="seconden tussen downloads")
    args = parser.parse_args()

    huidig = current_season()
    vorig = seizoen_code(seizoen_start(huidig) - 1)
    index_oud = lees_json(DATA / "index.json", {})
    zonder = {k: set(v) for k, v in index_oud.get("zonderSchotdata", {}).items()}
    mislukt = 0

    for code in (c.upper() for c in args.leagues):
        if code not in LEAGUES:
            print(f"{code}: onbekende competitie, overgeslagen", file=sys.stderr)
            mislukt += 1
            continue
        zonder.setdefault(code, set())
        for seizoen in alle_seizoenen(huidig):
            recent = seizoen in (huidig, vorig)
            if not (args.vernieuw or recent) and (seizoen_pad(code, seizoen).exists() or seizoen in zonder[code]):
                continue
            try:
                resultaat = ophalen(code, seizoen)
            except (urllib.error.URLError, TimeoutError) as err:
                print(f"{LEAGUES[code]} {seizoen}: ophalen mislukt ({err})", file=sys.stderr)
                mislukt += 1
                continue
            finally:
                time.sleep(args.pauze)
            wedstrijden, overgeslagen = resultaat or ([], 0)
            if not wedstrijden:
                if seizoen != huidig:
                    zonder[code].add(seizoen)
                print(f"{LEAGUES[code]} {seizoen}: geen schoten op doel")
                continue
            zonder[code].discard(seizoen)
            wedstrijden.sort(key=lambda m: (m["date"], m["home"]))
            schrijf_json(seizoen_pad(code, seizoen), {
                "competitie": code,
                "seizoen": seizoen,
                "overgeslagen": overgeslagen,
                "kolommen": WEDSTRIJD_KOLOMMEN,
                "wedstrijden": [
                    [m["date"], m["home"], m["away"], m["homeShots"], m["awayShots"], m["homeGoals"], m["awayGoals"]]
                    for m in wedstrijden
                ],
            })
            note = f", {overgeslagen} zonder schoten overgeslagen" if overgeslagen else ""
            print(f"{LEAGUES[code]} {seizoen}: {len(wedstrijden)} wedstrijden{note}")

    # Samenvatting en index altijd opnieuw opbouwen uit wat er op schijf staat.
    samenvatting = {"kolommen": STAND_KOLOMMEN}
    competities = []
    for code, naam in LEAGUES.items():
        seizoenen = []
        for pad in sorted((DATA / "seizoenen" / code).glob("*.json"), key=lambda p: seizoen_start(p.stem), reverse=True):
            bestand = lees_json(pad, {})
            rijen = bestand.get("wedstrijden", [])
            if not rijen:
                continue
            samenvatting.setdefault(code, {})[pad.stem] = samenvatting_seizoen(rijen)
            seizoenen.append({
                "code": pad.stem,
                "wedstrijden": len(rijen),
                "overgeslagen": bestand.get("overgeslagen", 0),
                "tot": rijen[-1][0],
            })
        if seizoenen:
            competities.append({"code": code, "naam": naam, "seizoenen": seizoenen})

    schrijf_json(DATA / "samenvatting.json", samenvatting)
    schrijf_json(DATA / "index.json", {
        "competities": competities,
        "zonderSchotdata": {k: sorted(v, key=seizoen_start) for k, v in zonder.items() if v},
    })
    totaal = sum(len(c["seizoenen"]) for c in competities)
    print(f"Database: {len(competities)} competities, {totaal} seizoenen")
    if not competities:
        sys.exit(1)
    if mislukt:
        sys.exit(2)


if __name__ == "__main__":
    main()
