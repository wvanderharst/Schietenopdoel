# Schotstand

De voetbalstand alsof elk schot op doel een doelpunt was, met historie vanaf het
eerste seizoen waarvan [football-data.co.uk](https://www.football-data.co.uk/)
schoten op doel heeft, voor de Eredivisie, Premier League, La Liga, Serie A en Bundesliga.

**Site:** https://wvanderharst.github.io/Schietenopdoel/

- **Stand**: schotstand per competitie en seizoen, naast de echte punten en het verschil.
- **Club** (`#/club/<naam>`): alle seizoenen van een club, punten per wedstrijd in de
  schotstand en in het echt, en hoeveel van de schoten op doel raak waren.
- **Analyse**: per seizoen of over alle seizoenen het verschil tussen echte punten en
  schotpunten per team, hoe vaak de schotkampioen echt kampioen werd, en de correlatie.
- **Kampioenen**: echte kampioen naast de schotkampioen per seizoen, schotkampioenen die in de
  hele periode nooit echt kampioen werden, en welke teams het meest/minst profiteren in titels.

Meer schoten op doel dan de tegenstander = winst (3 punten), evenveel = gelijk.
Beide standen sorteren op punten, saldo en gescoord (geen puntenaftrek of onderling resultaat).

## Data

| Bestand | Inhoud |
| --- | --- |
| `data/seizoenen/<code>/<seizoen>.json` | Wedstrijden: datum, thuis, uit, schoten op doel, echte goals |
| `data/samenvatting.json` | Schotstand en echte stand per team per seizoen |
| `data/index.json` | Competities, seizoenen en seizoenen zonder schotdata |

`scripts/database.py` (gebruikt `scripts/schotstand_scraper.py`) haalt ontbrekende
seizoenen op en ververst steeds het huidige en vorige seizoen.

## GitHub Actions

`.github/workflows/schotstand.yml` draait elke dinsdag om 06:17 UTC (na de speelronde van het weekend), commit nieuwe data
naar `main` en publiceert de site naar de branch `gh-pages`.
Handmatig: **Actions → "Schotstand bijwerken en publiceren" → Run workflow**
(vink "Alle seizoenen opnieuw ophalen" aan om alles te verversen).

## Lokaal

```sh
python3 scripts/database.py
python3 -m http.server   # open http://localhost:8000
```
