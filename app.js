// Schotstand: de competitiestand alsof elk schot op doel een doelpunt was.
// Data komt uit data/ (gebouwd door scripts/database.py):
//   index.json        competities en seizoenen
//   samenvatting.json schotstand en echte stand per team per seizoen
//   seizoenen/<competitie>/<seizoen>.json  wedstrijden

const app = document.getElementById("app");
const tip = document.getElementById("tip");

const S = { index: null, samenvatting: null, clubs: new Map(), seizoenen: new Map(), sorteer: { kol: "delta", op: false } };
let charts = [];

// ---------- hulpjes ----------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const seizoenStart = (code) => { const j = +code.slice(0, 2); return (j >= 90 ? 1900 : 2000) + j; };
const seizoenLabel = (code) => `${seizoenStart(code)}/${code.slice(2)}`;
const huidigSeizoen = (() => {
  const d = new Date();
  const start = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return String(start % 100).padStart(2, "0") + String((start + 1) % 100).padStart(2, "0");
})();
const nf = (dec) => new Intl.NumberFormat("nl-NL", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const f0 = nf(0), f1 = nf(1), f2 = nf(2);
const pct = new Intl.NumberFormat("nl-NL", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const metTeken = (n, fmt = f0) => (n > 0 ? "+" + fmt.format(n) : n < 0 ? "−" + fmt.format(-n) : fmt.format(0));
const datumFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });
const formatDatum = (iso) => datumFmt.format(new Date(iso + "T12:00:00"));
const clubLink = (team) => `<a href="#/club/${encodeURIComponent(team)}">${esc(team)}</a>`;
const compNaam = (code) => S.index.competities.find((c) => c.code === code)?.naam ?? code;

async function laadJson(pad) {
  const res = await fetch(pad, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${pad}: ${res.status}`);
  return res.json();
}

// Rij uit samenvatting.json (kolomvolgorde: zie STAND_KOLOMMEN in scripts/database.py).
function teamRij(r) {
  return {
    team: r[0], gs: r[1],
    schot: { w: r[2], g: r[3], v: r[4], voor: r[5], tegen: r[6], ptn: r[7], pos: r[8] },
    echt: { w: r[9], g: r[10], v: r[11], voor: r[12], tegen: r[13], ptn: r[14], pos: r[15] },
  };
}

const stand = (comp, seizoen) => (S.samenvatting[comp]?.[seizoen] ?? []).map(teamRij);

async function wedstrijden(comp, seizoen) {
  const key = comp + "/" + seizoen;
  if (!S.seizoenen.has(key)) {
    S.seizoenen.set(key, laadJson(`data/seizoenen/${comp}/${seizoen}.json`).then((d) =>
      d.wedstrijden.map(([datum, thuis, uit, ts, us, tg, ug]) => ({ datum, thuis, uit, ts, us, tg, ug }))
    ));
  }
  return S.seizoenen.get(key);
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

// ---------- grafieken (SVG, breedte = container) ----------

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((m) => m >= v);
}

function balkPad(x0, x1, y, h, r = 4) {
  const w = Math.abs(x1 - x0);
  if (w < 0.5) return "";
  r = Math.min(r, w, h / 2);
  const s = x1 >= x0 ? 1 : -1;
  return `M${x0},${y}H${x1 - s * r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 - s * r},${y + h}H${x0}Z`;
}

// Liggende balken rond nul. items: [{label, waarde, tip}]
function divergerendeBalken(el, items, { fmt = f0, as = "" } = {}) {
  const breedte = el.clientWidth;
  const rij = 24, balk = 14, boven = 8, onder = 26;
  const labelW = Math.min(150, Math.round(breedte * 0.34));
  const tekstRuimte = 40;
  const x0 = labelW + tekstRuimte, x1 = breedte - tekstRuimte;
  const max = niceMax(Math.max(...items.map((d) => Math.abs(d.waarde)), 0.0001));
  const x = (v) => x0 + ((v + max) / (2 * max)) * (x1 - x0);
  const hoogte = boven + items.length * rij + onder;
  const nul = x(0);
  const ticks = [-max, -max / 2, 0, max / 2, max];
  let svg = `<svg width="${breedte}" height="${hoogte}" role="img" aria-label="${esc(as)}">`;
  for (const t of ticks) {
    svg += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${boven}" y2="${hoogte - onder + 4}"/>`;
    svg += `<text class="as" x="${x(t)}" y="${hoogte - 8}" text-anchor="middle">${metTeken(t, fmt)}</text>`;
  }
  items.forEach((d, i) => {
    const y = boven + i * rij + (rij - balk) / 2;
    const cls = d.waarde >= 0 ? "pos" : "neg";
    svg += `<g class="hit" data-tip="${esc(d.tip)}">`;
    svg += `<rect x="0" y="${boven + i * rij}" width="${breedte}" height="${rij}" fill="transparent"/>`;
    svg += `<text class="label" x="${labelW}" y="${y + balk / 2}" dy="0.35em" text-anchor="end">${esc(d.label)}</text>`;
    svg += `<path class="${cls}" d="${balkPad(nul, x(d.waarde), y, balk)}"/>`;
    const tx = x(d.waarde) + (d.waarde >= 0 ? 6 : -6);
    svg += `<text class="waarde" x="${tx}" y="${y + balk / 2}" dy="0.35em" text-anchor="${d.waarde >= 0 ? "start" : "end"}">${metTeken(d.waarde, fmt)}</text>`;
    svg += `</g>`;
  });
  svg += `<line class="nul" x1="${nul}" x2="${nul}" y1="${boven}" y2="${hoogte - onder + 4}"/></svg>`;
  el.innerHTML = svg;
}

// Lijngrafiek over seizoenen. reeksen: [{naam, cls, waarden: Map(seizoen -> getal)}]
function lijnGrafiek(el, seizoenen, reeksen, { yMax, fmt = f2, tipExtra = () => "" }) {
  const breedte = el.clientWidth, hoogte = 240;
  const m = { l: 36, r: 16, t: 12, b: 28 };
  const iw = breedte - m.l - m.r, ih = hoogte - m.t - m.b;
  const stap = seizoenen.length > 1 ? iw / (seizoenen.length - 1) : 0;
  const x = (i) => m.l + (seizoenen.length > 1 ? i * stap : iw / 2);
  const y = (v) => m.t + ih - (v / yMax) * ih;
  let svg = `<svg width="${breedte}" height="${hoogte}" role="img" aria-label="Punten per wedstrijd per seizoen">`;
  for (let t = 0; t <= yMax; t += yMax / 3) {
    svg += `<line class="grid" x1="${m.l}" x2="${breedte - m.r}" y1="${y(t)}" y2="${y(t)}"/>`;
    svg += `<text class="as" x="${m.l - 6}" y="${y(t)}" dy="0.35em" text-anchor="end">${f1.format(t)}</text>`;
  }
  const elke = Math.max(1, Math.ceil((seizoenen.length * 52) / iw));
  seizoenen.forEach((s, i) => {
    if ((seizoenen.length - 1 - i) % elke === 0) {
      svg += `<text class="as" x="${x(i)}" y="${hoogte - 8}" text-anchor="middle">${seizoenLabel(s).slice(2)}</text>`;
    }
  });
  for (const r of reeksen) {
    let d = "", pen = false;
    seizoenen.forEach((s, i) => {
      const v = r.waarden.get(s);
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i)},${y(v)}`;
      pen = true;
    });
    svg += `<path class="lijn ${r.cls}" d="${d}"/>`;
    seizoenen.forEach((s, i) => {
      const v = r.waarden.get(s);
      if (v != null) svg += `<circle class="punt ${r.cls}" cx="${x(i)}" cy="${y(v)}" r="4"/>`;
    });
  }
  // Hover-kolommen met dradenkruis.
  seizoenen.forEach((s, i) => {
    const regels = reeksen.map((r) => `${r.naam}: ${r.waarden.has(s) ? fmt.format(r.waarden.get(s)) : "–"}`);
    const tekst = [seizoenLabel(s), ...regels, tipExtra(s)].filter(Boolean).join("\n");
    const w = Math.max(stap, 12);
    svg += `<g class="kolom" data-tip="${esc(tekst)}"><rect x="${x(i) - w / 2}" y="${m.t}" width="${w}" height="${ih}" fill="transparent"/>`;
    svg += `<line class="kruis" x1="${x(i)}" x2="${x(i)}" y1="${m.t}" y2="${m.t + ih}"/></g>`;
  });
  el.innerHTML = svg + "</svg>";
}

function tekenGrafieken() {
  for (const c of charts) c();
}
let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(tekenGrafieken, 150); });

// Tooltip voor alles met data-tip.
function toonTip(e) {
  const doel = e.target.closest?.("[data-tip]");
  if (!doel) { tip.hidden = true; return; }
  tip.textContent = doel.dataset.tip;
  tip.hidden = false;
  const p = e.touches?.[0] ?? e;
  const r = tip.getBoundingClientRect();
  let left = p.clientX + 14, top = p.clientY + 14;
  if (left + r.width > innerWidth - 8) left = p.clientX - r.width - 14;
  if (top + r.height > innerHeight - 8) top = p.clientY - r.height - 14;
  tip.style.left = Math.max(8, left) + "px";
  tip.style.top = Math.max(8, top) + "px";
}
document.addEventListener("mousemove", toonTip);
document.addEventListener("touchstart", toonTip, { passive: true });
document.addEventListener("scroll", () => (tip.hidden = true), { passive: true });

// ---------- gedeelde stukken ----------

function compTabs(actief, href) {
  return `<nav class="tabs" aria-label="Competitie">${S.index.competities
    .map((c) => `<a href="${href(c)}" ${c.code === actief ? 'aria-current="page"' : ""}>${esc(c.naam)}</a>`)
    .join("")}</nav>`;
}

function seizoenKeuze(comp, actief, { alle = false } = {}) {
  const c = S.index.competities.find((c) => c.code === comp);
  const opties = (alle ? [`<option value="" ${!actief ? "selected" : ""}>Alle seizoenen</option>`] : []).concat(
    c.seizoenen.map((s) => `<option value="${s.code}" ${s.code === actief ? "selected" : ""}>${seizoenLabel(s.code)}</option>`)
  );
  return `<label class="keuze">Seizoen <select data-comp="${comp}">${opties.join("")}</select></label>`;
}

function tegel(waarde, label, uitleg = "") {
  return `<div class="tegel"><div class="tegel-waarde">${waarde}</div><div class="tegel-label">${label}</div>${
    uitleg ? `<div class="tegel-uitleg">${uitleg}</div>` : ""
  }</div>`;
}

const uitslagRegel = (m, nadruk) => `
  <li>
    <span class="datum">${formatDatum(m.datum)}</span>
    <span class="thuis ${m.ts > m.us ? "winnaar" : ""} ${m.thuis === nadruk ? "nadruk" : ""}">${clubLink(m.thuis)}</span>
    <span class="score" data-tip="Echte uitslag ${m.tg}–${m.ug}">${m.ts} – ${m.us}<small>${m.tg}–${m.ug}</small></span>
    <span class="uit ${m.us > m.ts ? "winnaar" : ""} ${m.uit === nadruk ? "nadruk" : ""}">${clubLink(m.uit)}</span>
  </li>`;

// ---------- pagina: stand ----------

async function paginaStand(comp, seizoen) {
  const c = S.index.competities.find((x) => x.code === comp) ?? S.index.competities[0];
  comp = c.code;
  const info = c.seizoenen.find((s) => s.code === seizoen) ?? c.seizoenen[0];
  seizoen = info.code;
  const rijen = stand(comp, seizoen);
  const lijst = await wedstrijden(comp, seizoen);

  const vorm = new Map();
  for (const m of lijst) {
    const r = m.ts > m.us ? ["W", "V"] : m.ts < m.us ? ["V", "W"] : ["G", "G"];
    vorm.set(m.thuis, [...(vorm.get(m.thuis) ?? []), r[0]]);
    vorm.set(m.uit, [...(vorm.get(m.uit) ?? []), r[1]]);
  }

  const toon = 40;
  app.innerHTML = `
    ${compTabs(comp, (x) => `#/stand/${x.code}`)}
    <div class="sectiekop">
      <h1>${esc(c.naam)} ${seizoenLabel(seizoen)}</h1>
      ${seizoenKeuze(comp, seizoen)}
    </div>
    <p class="meta">${info.wedstrijden} wedstrijden t/m ${formatDatum(info.tot)}${
      info.overgeslagen ? ` · ${info.overgeslagen} wedstrijden zonder schotdata niet meegeteld` : ""
    } · <a href="#/analyse/${comp}/${seizoen}">analyse van dit seizoen</a></p>
    <div class="tabelwrap">
      <table class="tabel">
        <thead><tr>
          <th class="num">#</th><th>Team</th>
          <th class="num" title="Gespeeld">GS</th>
          <th class="num" title="Gewonnen">W</th><th class="num" title="Gelijk">G</th><th class="num" title="Verloren">V</th>
          <th class="num smal-weg" title="Schoten op doel voor">Voor</th>
          <th class="num smal-weg" title="Schoten op doel tegen">Tegen</th>
          <th class="num" title="Saldo schoten op doel">+/−</th>
          <th class="num" title="Punten in de schotstand">Ptn</th>
          <th class="num scheiding" title="Punten en positie in de echte stand">Echt</th>
          <th class="num" title="Echte punten min schotpunten">Verschil</th>
          <th class="smal-weg">Vorm</th>
        </tr></thead>
        <tbody>${rijen.map((t) => `
          <tr>
            <td class="num zacht">${t.schot.pos}</td>
            <td class="team">${clubLink(t.team)}</td>
            <td class="num">${t.gs}</td>
            <td class="num">${t.schot.w}</td><td class="num">${t.schot.g}</td><td class="num">${t.schot.v}</td>
            <td class="num smal-weg">${t.schot.voor}</td><td class="num smal-weg">${t.schot.tegen}</td>
            <td class="num">${metTeken(t.schot.voor - t.schot.tegen)}</td>
            <td class="num vet">${t.schot.ptn}</td>
            <td class="num scheiding">${t.echt.ptn} <span class="zacht">(${t.echt.pos}e)</span></td>
            <td class="num">${metTeken(t.echt.ptn - t.schot.ptn)}</td>
            <td class="vorm smal-weg">${(vorm.get(t.team) ?? []).slice(-5).map((r) => `<span class="${r}">${r}</span>`).join("")}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <h2>Uitslagen <span class="zacht klein">schoten op doel, echte uitslag eronder</span></h2>
    <ol class="uitslagen">${[...lijst].reverse().slice(0, toon).map((m) => uitslagRegel(m)).join("")}</ol>
    ${lijst.length > toon ? `<button class="knop" id="meer">Alle ${lijst.length} wedstrijden tonen</button>` : ""}`;

  document.getElementById("meer")?.addEventListener("click", (e) => {
    app.querySelector(".uitslagen").innerHTML = [...lijst].reverse().map((m) => uitslagRegel(m)).join("");
    e.target.remove();
  });
}

// ---------- pagina: club ----------

async function paginaClub(team) {
  const seizoenen = S.clubs.get(team);
  if (!seizoenen) {
    app.innerHTML = `<h1>${esc(team)}</h1><p class="leeg">Deze club staat niet in de database.</p>`;
    return;
  }
  // seizoenen: [{comp, seizoen, rij, aantalTeams}], oplopend
  const tot = seizoenen.reduce((a, s) => {
    a.gs += s.rij.gs; a.sp += s.rij.schot.ptn; a.ep += s.rij.echt.ptn;
    a.sv += s.rij.schot.voor; a.st += s.rij.schot.tegen; a.ev += s.rij.echt.voor; a.et += s.rij.echt.tegen;
    return a;
  }, { gs: 0, sp: 0, ep: 0, sv: 0, st: 0, ev: 0, et: 0 });
  const comps = [...new Set(seizoenen.map((s) => compNaam(s.comp)))];
  const laatste = seizoenen[seizoenen.length - 1];
  const delta = tot.ep - tot.sp;

  // X-as: elk seizoen van eerste tot laatste, ook als de club ontbrak.
  const as = [];
  for (let j = seizoenStart(seizoenen[0].seizoen); j <= seizoenStart(laatste.seizoen); j++) {
    as.push(String(j % 100).padStart(2, "0") + String((j + 1) % 100).padStart(2, "0"));
  }
  const perSeizoen = new Map(seizoenen.map((s) => [s.seizoen, s]));

  app.innerHTML = `
    <div class="sectiekop"><h1>${esc(team)}</h1></div>
    <p class="meta">${esc(comps.join(", "))} · ${seizoenen.length} seizoenen met schotdata (${seizoenLabel(seizoenen[0].seizoen)} – ${seizoenLabel(laatste.seizoen)})</p>
    <div class="tegels">
      ${tegel(f2.format(tot.sp / tot.gs), "punten per wedstrijd in de schotstand")}
      ${tegel(f2.format(tot.ep / tot.gs), "punten per wedstrijd in het echt")}
      ${tegel(metTeken(delta), "punten verschil in totaal", delta >= 0 ? "meer echte punten dan de schoten verdienden" : "minder echte punten dan de schoten verdienden")}
      ${tegel(pct.format(tot.ev / tot.sv), "van de eigen schoten op doel is raak", `tegenstanders: ${pct.format(tot.et / tot.st)}`)}
    </div>
    <h2>Punten per wedstrijd per seizoen</h2>
    <div class="legenda"><span class="sleutel schot"></span>Schotstand <span class="sleutel echt"></span>Echte stand</div>
    <div class="grafiek" id="lijn"></div>
    <h2>Seizoenen</h2>
    <div class="tabelwrap">
      <table class="tabel">
        <thead><tr>
          <th>Seizoen</th><th class="smal-weg">Competitie</th><th class="num">GS</th>
          <th class="num" title="Positie en punten in de schotstand">Schotstand</th>
          <th class="num" title="Positie en punten in de echte stand">Echt</th>
          <th class="num" title="Echte punten min schotpunten">Verschil</th>
          <th class="num smal-weg" title="Deel van de eigen schoten op doel dat een doelpunt was">Raak</th>
          <th class="num smal-weg" title="Deel van de schoten op doel van tegenstanders dat een doelpunt was">Raak tegen</th>
        </tr></thead>
        <tbody>${[...seizoenen].reverse().map((s) => `
          <tr>
            <td><a href="#/stand/${s.comp}/${s.seizoen}">${seizoenLabel(s.seizoen)}</a></td>
            <td class="smal-weg">${esc(compNaam(s.comp))}</td>
            <td class="num">${s.rij.gs}</td>
            <td class="num">${s.rij.schot.pos}e · ${s.rij.schot.ptn}</td>
            <td class="num">${s.rij.echt.pos}e · ${s.rij.echt.ptn}</td>
            <td class="num">${metTeken(s.rij.echt.ptn - s.rij.schot.ptn)}</td>
            <td class="num smal-weg">${s.rij.schot.voor ? pct.format(s.rij.echt.voor / s.rij.schot.voor) : "–"}</td>
            <td class="num smal-weg">${s.rij.schot.tegen ? pct.format(s.rij.echt.tegen / s.rij.schot.tegen) : "–"}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <h2>Wedstrijden ${seizoenLabel(laatste.seizoen)} <span class="zacht klein">${esc(compNaam(laatste.comp))}</span></h2>
    <ol class="uitslagen" id="clubuitslagen"><li class="zacht">Laden…</li></ol>`;

  const lijn = document.getElementById("lijn");
  const ppg = (kant) => new Map(seizoenen.map((s) => [s.seizoen, s.rij[kant].ptn / s.rij.gs]));
  charts.push(() => lijnGrafiek(lijn, as, [
    { naam: "Schotstand", cls: "schot", waarden: ppg("schot") },
    { naam: "Echt", cls: "echt", waarden: ppg("echt") },
  ], {
    yMax: 3,
    tipExtra: (s) => {
      const x = perSeizoen.get(s);
      return x ? `${compNaam(x.comp)}: schot ${x.rij.schot.pos}e, echt ${x.rij.echt.pos}e` : "geen schotdata";
    },
  }));
  tekenGrafieken();

  const lijst = (await wedstrijden(laatste.comp, laatste.seizoen)).filter((m) => m.thuis === team || m.uit === team);
  document.getElementById("clubuitslagen").innerHTML = [...lijst].reverse().map((m) => uitslagRegel(m, team)).join("");
}

// ---------- pagina: analyse ----------

function aggregeer(comp) {
  const teams = new Map();
  for (const [seizoen, rijen] of Object.entries(S.samenvatting[comp] ?? {})) {
    for (const r of rijen.map(teamRij)) {
      const a = teams.get(r.team) ?? { team: r.team, seizoenen: 0, gs: 0, sp: 0, ep: 0, sv: 0, st: 0, ev: 0, et: 0 };
      a.seizoenen++; a.gs += r.gs; a.sp += r.schot.ptn; a.ep += r.echt.ptn;
      a.sv += r.schot.voor; a.st += r.schot.tegen; a.ev += r.echt.voor; a.et += r.echt.tegen;
      teams.set(r.team, a);
    }
  }
  return [...teams.values()].map((a) => ({ ...a, delta: (a.ep - a.sp) / a.gs, raak: a.ev / a.sv, raakTegen: a.et / a.st }));
}

function competitieKengetallen(comp) {
  const seizoenen = Object.entries(S.samenvatting[comp] ?? {});
  const xs = [], ys = [];
  let afgerond = 0, zelfdeKampioen = 0, sv = 0, ev = 0;
  for (const [code, rijen] of seizoenen) {
    const t = rijen.map(teamRij);
    for (const r of t) { xs.push(r.schot.ptn / r.gs); ys.push(r.echt.ptn / r.gs); sv += r.schot.voor; ev += r.echt.voor; }
    if (code !== huidigSeizoen) {
      afgerond++;
      if (t.find((r) => r.schot.pos === 1)?.team === t.find((r) => r.echt.pos === 1)?.team) zelfdeKampioen++;
    }
  }
  return { r: pearson(xs, ys), afgerond, zelfdeKampioen, raak: ev / sv };
}

const KOLOMMEN = [
  { kol: "team", label: "Team", tekst: true },
  { kol: "seizoenen", label: "Seizoenen" },
  { kol: "gs", label: "GS", smal: true },
  { kol: "spg", label: "Schot ptn/w", titel: "Punten per wedstrijd in de schotstand", smal: true },
  { kol: "epg", label: "Echt ptn/w", titel: "Echte punten per wedstrijd", smal: true },
  { kol: "delta", label: "Verschil/w", titel: "Echte punten min schotpunten, per wedstrijd" },
  { kol: "raak", label: "Raak", titel: "Deel van de eigen schoten op doel dat een doelpunt was" },
  { kol: "raakTegen", label: "Raak tegen", titel: "Deel van de schoten op doel van tegenstanders dat een doelpunt was", smal: true },
];

function paginaAnalyse(comp, seizoen) {
  const c = S.index.competities.find((x) => x.code === comp) ?? S.index.competities[0];
  comp = c.code;
  if (seizoen && !c.seizoenen.some((s) => s.code === seizoen)) seizoen = null;

  const kop = `
    ${compTabs(comp, (x) => `#/analyse/${x.code}`)}
    <div class="sectiekop">
      <h1>Analyse ${esc(c.naam)}${seizoen ? " " + seizoenLabel(seizoen) : ""}</h1>
      ${seizoenKeuze(comp, seizoen, { alle: true })}
    </div>`;

  if (seizoen) {
    const rijen = stand(comp, seizoen);
    const items = rijen
      .map((t) => ({ t, d: t.echt.ptn - t.schot.ptn }))
      .sort((a, b) => b.d - a.d || a.t.team.localeCompare(b.t.team, "nl"));
    const raak = rijen.reduce((a, t) => [a[0] + t.echt.voor, a[1] + t.schot.voor], [0, 0]);
    const schotKampioen = rijen.find((t) => t.schot.pos === 1)?.team;
    const echtKampioen = rijen.find((t) => t.echt.pos === 1)?.team;
    app.innerHTML = `${kop}
      <div class="tegels">
        ${tegel(esc(schotKampioen ?? "–"), "bovenaan in de schotstand", `echt: ${esc(echtKampioen ?? "–")}`)}
        ${tegel(pct.format(raak[0] / raak[1]), "van alle schoten op doel was raak")}
        ${tegel(f2.format(pearson(rijen.map((t) => t.schot.ptn), rijen.map((t) => t.echt.ptn))), "correlatie schotpunten – echte punten", "1 = schotstand voorspelt de stand perfect")}
      </div>
      <h2>Echte punten min schotpunten</h2>
      <p class="uitleg">Rechts: meer punten gehaald dan de schoten op doel rechtvaardigen (efficiënt, sterke keeper of geluk). Links: minder.</p>
      <div class="grafiek" id="balken"></div>
      <div class="tabelwrap">
        <table class="tabel">
          <thead><tr>
            <th>Team</th><th class="num">Schotstand</th><th class="num">Echt</th>
            <th class="num" title="Plaatsen verschil (positief = echt hoger geëindigd)">Plaatsen</th>
            <th class="num">Verschil ptn</th>
            <th class="num smal-weg" title="Deel van de eigen schoten op doel dat een doelpunt was">Raak</th>
            <th class="num smal-weg" title="Deel van de schoten op doel van tegenstanders dat een doelpunt was">Raak tegen</th>
          </tr></thead>
          <tbody>${items.map(({ t, d }) => `
            <tr>
              <td>${clubLink(t.team)}</td>
              <td class="num">${t.schot.pos}e · ${t.schot.ptn}</td>
              <td class="num">${t.echt.pos}e · ${t.echt.ptn}</td>
              <td class="num">${metTeken(t.schot.pos - t.echt.pos)}</td>
              <td class="num vet">${metTeken(d)}</td>
              <td class="num smal-weg">${t.schot.voor ? pct.format(t.echt.voor / t.schot.voor) : "–"}</td>
              <td class="num smal-weg">${t.schot.tegen ? pct.format(t.echt.tegen / t.schot.tegen) : "–"}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
    const el = document.getElementById("balken");
    charts.push(() => divergerendeBalken(el, items.map(({ t, d }) => ({
      label: t.team, waarde: d,
      tip: `${t.team}\nSchotstand: ${t.schot.pos}e, ${t.schot.ptn} ptn\nEcht: ${t.echt.pos}e, ${t.echt.ptn} ptn\nVerschil: ${metTeken(d)}`,
    })), { as: "Echte punten min schotpunten per team" }));
    tekenGrafieken();
    return;
  }

  // Alle seizoenen
  const k = competitieKengetallen(comp);
  const teams = aggregeer(comp).map((a) => ({ ...a, spg: a.sp / a.gs, epg: a.ep / a.gs }));
  const { kol, op } = S.sorteer;
  const richting = op ? 1 : -1;
  teams.sort((a, b) => (kol === "team" ? richting * a.team.localeCompare(b.team, "nl") : richting * (a[kol] - b[kol])) || a.team.localeCompare(b.team, "nl"));
  const minSeizoenen = 3;
  const grafiekTeams = aggregeer(comp).filter((a) => a.seizoenen >= minSeizoenen).sort((a, b) => b.delta - a.delta);

  app.innerHTML = `${kop}
    <p class="meta">${c.seizoenen.length} seizoenen met schotdata (${seizoenLabel(c.seizoenen.at(-1).code)} – ${seizoenLabel(c.seizoenen[0].code)})</p>
    <div class="tegels">
      ${tegel(`${k.zelfdeKampioen}/${k.afgerond}`, "afgeronde seizoenen waarin de schotkampioen ook echt kampioen werd")}
      ${tegel(pct.format(k.raak), "van alle schoten op doel was raak")}
      ${tegel(f2.format(k.r), "correlatie schotpunten – echte punten", "per team per seizoen, punten per wedstrijd")}
    </div>
    <h2>Wie haalt structureel meer of minder dan de schoten?</h2>
    <p class="uitleg">Gemiddeld verschil tussen echte punten en schotpunten per wedstrijd, teams met minstens ${minSeizoenen} seizoenen. +0,10 is ongeveer 3,4 punten extra per seizoen van 34 wedstrijden.</p>
    <div class="grafiek" id="balken"></div>
    <h2>Alle teams</h2>
    <div class="tabelwrap">
      <table class="tabel sorteerbaar">
        <thead><tr>${KOLOMMEN.map((x) => `
          <th class="${x.tekst ? "" : "num"} ${x.smal ? "smal-weg" : ""}" ${x.titel ? `title="${esc(x.titel)}"` : ""}
              aria-sort="${x.kol === kol ? (op ? "ascending" : "descending") : "none"}">
            <button data-sorteer="${x.kol}">${x.label}${x.kol === kol ? (op ? " ▲" : " ▼") : ""}</button>
          </th>`).join("")}
        </tr></thead>
        <tbody>${teams.map((a) => `
          <tr>
            <td>${clubLink(a.team)}</td>
            <td class="num">${a.seizoenen}</td>
            <td class="num smal-weg">${a.gs}</td>
            <td class="num smal-weg">${f2.format(a.spg)}</td>
            <td class="num smal-weg">${f2.format(a.epg)}</td>
            <td class="num vet">${metTeken(a.delta, f2)}</td>
            <td class="num">${pct.format(a.raak)}</td>
            <td class="num smal-weg">${pct.format(a.raakTegen)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  app.querySelectorAll("[data-sorteer]").forEach((b) => b.addEventListener("click", () => {
    const nieuw = b.dataset.sorteer;
    S.sorteer = { kol: nieuw, op: S.sorteer.kol === nieuw ? !S.sorteer.op : nieuw === "team" };
    const y = scrollY;
    paginaAnalyse(comp, null);
    scrollTo(0, y);
  }));
  const el = document.getElementById("balken");
  charts = [() => divergerendeBalken(el, grafiekTeams.map((a) => ({
    label: a.team, waarde: a.delta,
    tip: `${a.team} (${a.seizoenen} seizoenen)\nSchot: ${f2.format(a.sp / a.gs)} ptn/w\nEcht: ${f2.format(a.ep / a.gs)} ptn/w\nRaak: ${pct.format(a.raak)}, tegen: ${pct.format(a.raakTegen)}`,
  })), { fmt: f2, as: "Gemiddeld puntenverschil per wedstrijd per team" })];
  tekenGrafieken();
}

// ---------- routering ----------

async function render() {
  charts = [];
  tip.hidden = true;
  const [pad, a, b] = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const sectie = pad || "stand";
  document.querySelectorAll(".hoofdnav a").forEach((n) => n.toggleAttribute("aria-current", n.dataset.sectie === sectie));
  try {
    if (sectie === "club" && a) {
      document.title = `${a} – Schotstand`;
      await paginaClub(a);
    } else if (sectie === "analyse") {
      document.title = "Analyse – Schotstand";
      paginaAnalyse(a, b);
    } else {
      document.title = "Schotstand";
      await paginaStand(a, b);
    }
  } catch (err) {
    app.innerHTML = `<p class="leeg">Er ging iets mis bij het laden (${esc(err.message)}).</p>`;
  }
}

app.addEventListener("change", (e) => {
  const sel = e.target.closest("select[data-comp]");
  if (!sel) return;
  const sectie = location.hash.startsWith("#/analyse") ? "analyse" : "stand";
  location.hash = `#/${sectie}/${sel.dataset.comp}${sel.value ? "/" + sel.value : ""}`;
});

document.getElementById("zoek").addEventListener("submit", (e) => {
  e.preventDefault();
  const veld = document.getElementById("zoekveld");
  const q = veld.value.trim().toLowerCase();
  const club = [...S.clubs.keys()].find((n) => n.toLowerCase() === q) ?? [...S.clubs.keys()].find((n) => n.toLowerCase().includes(q));
  if (club) { location.hash = `#/club/${encodeURIComponent(club)}`; veld.value = ""; veld.blur(); }
});
document.getElementById("zoekveld").addEventListener("input", (e) => {
  if (S.clubs.has(e.target.value)) e.target.form.requestSubmit();
});

(async function start() {
  try {
    [S.index, S.samenvatting] = await Promise.all([laadJson("data/index.json"), laadJson("data/samenvatting.json")]);
  } catch (err) {
    app.innerHTML = `<p class="leeg">Nog geen data. De database wordt gevuld door GitHub Actions (${esc(err.message)}).</p>`;
    return;
  }
  if (!S.index.competities.length) {
    app.innerHTML = `<p class="leeg">Nog geen data. De database wordt gevuld door GitHub Actions.</p>`;
    return;
  }
  for (const c of S.index.competities) {
    for (const s of [...c.seizoenen].reverse()) {
      for (const rij of stand(c.code, s.code)) {
        if (!S.clubs.has(rij.team)) S.clubs.set(rij.team, []);
        S.clubs.get(rij.team).push({ comp: c.code, seizoen: s.code, rij });
      }
    }
  }
  for (const lijst of S.clubs.values()) lijst.sort((a, b) => seizoenStart(a.seizoen) - seizoenStart(b.seizoen));
  document.getElementById("clubs").innerHTML = [...S.clubs.keys()].sort((a, b) => a.localeCompare(b, "nl")).map((n) => `<option value="${esc(n)}">`).join("");
  window.addEventListener("hashchange", () => { render(); scrollTo(0, 0); });
  render();
})();
