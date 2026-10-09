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
| `.github/workflows/schotstand.yml` | Draait de scraper dagelijks (06:17 UTC), commit nieuwe data en publiceert de site op GitHub Pages |
| `index.html`, `style.css`, `app.js` | De site; rekent de stand in de browser uit |

## Eenmalig instellen

1. **Settings → Pages → Build and deployment → Source: _GitHub Actions_.**
2. **Settings → Actions → General → Workflow permissions: _Read and write permissions_**
   (zodat de workflow de nieuwe data kan committen).
3. **Actions → "Schotstand bijwerken en publiceren" → Run workflow** om direct de eerste data op te halen.

Daarna wordt de site elke dag automatisch bijgewerkt.

## Lokaal draaien

```sh
python3 scripts/schotstand_scraper.py --out data/wedstrijden.json
python3 -m http.server
# open http://localhost:8000
```
