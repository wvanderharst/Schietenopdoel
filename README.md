# Schotstand

De voetbalstand alsof elk schot op doel een doelpunt was.

Een statische website (HTML/CSS/JS, geen build-stap) die de stand berekent uit de
schoten op doel per wedstrijd (kolommen `HST`/`AST` van
[football-data.co.uk](https://www.football-data.co.uk/)) voor de Eredivisie,
Premier League, La Liga, Serie A en Bundesliga.

- Meer schoten op doel dan de tegenstander = winst (3 punten), evenveel = gelijk (1 punt).
- Volgorde bij gelijke punten: saldo, meer schoten op doel voor, naam.

## Hoe het werkt

| Onderdeel | Wat |
| --- | --- |
| `scripts/schotstand_scraper.py` | Haalt de CSV's op en schrijft `data/wedstrijden.json` |
| `.github/workflows/schotstand.yml` | Draait de scraper dagelijks (06:17 UTC), commit nieuwe data en zet de site in de branch `gh-pages` (GitHub Pages) |
| `index.html`, `style.css`, `app.js` | De site; rekent de stand in de browser uit |

## Site

https://wvanderharst.github.io/Schietenopdoel/

Bijwerken op verzoek: **Actions → "Schotstand bijwerken en publiceren" → Run workflow**.
Werkt de site niet? Controleer of **Settings → Pages** de branch `gh-pages` (map `/`) als bron heeft.

## Lokaal draaien

```sh
python3 scripts/schotstand_scraper.py --out data/wedstrijden.json
python3 -m http.server
# open http://localhost:8000
```
