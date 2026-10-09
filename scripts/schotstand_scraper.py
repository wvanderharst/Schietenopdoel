#!/usr/bin/env python3
"""Haalt schoten op doel per wedstrijd op bij football-data.co.uk en schrijft
een JSON-bestand dat je op de Schotstand-pagina kunt importeren.

Gebruik:
    python3 schotstand_scraper.py                       # alle vijf competities, huidig seizoen
    python3 schotstand_scraper.py --leagues N1 E0       # alleen Eredivisie en Premier League
    python3 schotstand_scraper.py --season 2526         # een ouder seizoen
    python3 schotstand_scraper.py --out mijn_data.json

Alleen standaardbibliotheek, geen installatie nodig (Python 3.8+).
"""
import argparse
import csv
import io
import json
import sys
import urllib.error
import urllib.request
from datetime import date, datetime

BASE = "https://www.football-data.co.uk/mmz4281/{season}/{code}.csv"

LEAGUES = {
    "N1": "Eredivisie",
    "E0": "Premier League",
    "SP1": "La Liga",
    "I1": "Serie A",
    "D1": "Bundesliga",
}


def current_season(today=None):
    """Seizoenscode zoals football-data die gebruikt, bijv. 2627 voor 2026/27."""
    today = today or date.today()
    start = today.year if today.month >= 7 else today.year - 1
    return f"{start % 100:02d}{(start + 1) % 100:02d}"


def parse_date(text):
    text = (text or "").strip()
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def to_int(text):
    try:
        value = float((text or "").strip())
    except ValueError:
        return None
    if value < 0 or value != int(value):
        return None
    return int(value)


def parse_csv(text, comp):
    """Zet de CSV-tekst om naar wedstrijden. Rijen zonder schoten op doel worden overgeslagen."""
    matches, skipped = [], 0
    for row in csv.DictReader(io.StringIO(text)):
        home = (row.get("HomeTeam") or "").strip()
        away = (row.get("AwayTeam") or "").strip()
        day = parse_date(row.get("Date"))
        hst = to_int(row.get("HST"))
        ast = to_int(row.get("AST"))
        if not (home and away and day) or hst is None or ast is None:
            if home or away:
                skipped += 1
            continue
        matches.append(
            {
                "comp": comp,
                "date": day,
                "home": home,
                "away": away,
                "homeShots": hst,
                "awayShots": ast,
            }
        )
    return matches, skipped


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (schotstand-scraper)"})
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read()
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("latin-1")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--season", default=current_season(), help="seizoenscode, bijv. 2627 (standaard: huidig seizoen)")
    parser.add_argument("--leagues", nargs="+", default=list(LEAGUES), help="competitiecodes: " + ", ".join(LEAGUES))
    parser.add_argument("--out", default="schotstand-import.json", help="uitvoerbestand")
    args = parser.parse_args()

    result, failed = [], 0
    for code in args.leagues:
        code = code.upper()
        if code not in LEAGUES:
            print(f"{code}: onbekende competitie, overgeslagen (kies uit {', '.join(LEAGUES)})", file=sys.stderr)
            failed += 1
            continue
        url = BASE.format(season=args.season, code=code)
        try:
            text = download(url)
        except (urllib.error.URLError, TimeoutError) as err:
            print(f"{LEAGUES[code]}: ophalen mislukt ({err})", file=sys.stderr)
            failed += 1
            continue
        matches, skipped = parse_csv(text, LEAGUES[code])
        note = f", {skipped} zonder schoten op doel overgeslagen" if skipped else ""
        print(f"{LEAGUES[code]}: {len(matches)} wedstrijden{note}")
        result.extend(matches)

    if not result:
        print("Geen wedstrijden gevonden, er is niets geschreven.", file=sys.stderr)
        sys.exit(1)

    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=1)
    print(f"{len(result)} wedstrijden geschreven naar {args.out}")
    if failed:
        sys.exit(2)


if __name__ == "__main__":
    main()
