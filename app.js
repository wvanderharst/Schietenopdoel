// Schotstand: berekent de competitiestand alsof elk schot op doel een doelpunt was.
// Data: data/wedstrijden.json, geschreven door scripts/schotstand_scraper.py.

const VOORKEUR_VOLGORDE = ["Eredivisie", "Premier League", "La Liga", "Serie A", "Bundesliga"];
const PER_PAGINA = 30;

const state = { wedstrijden: [], comp: null, team: null, toon: PER_PAGINA };
const $ = (id) => document.getElementById(id);

function berekenStand(wedstrijden) {
  const teams = new Map();
  const team = (naam) => {
    if (!teams.has(naam)) teams.set(naam, { naam, gs: 0, w: 0, g: 0, v: 0, voor: 0, tegen: 0, ptn: 0, vorm: [] });
    return teams.get(naam);
  };
  const opDatum = [...wedstrijden].sort((a, b) => a.date.localeCompare(b.date));
  for (const m of opDatum) {
    const thuis = team(m.home);
    const uit = team(m.away);
    thuis.gs++; uit.gs++;
    thuis.voor += m.homeShots; thuis.tegen += m.awayShots;
    uit.voor += m.awayShots; uit.tegen += m.homeShots;
    if (m.homeShots > m.awayShots) {
      thuis.w++; thuis.ptn += 3; uit.v++;
      thuis.vorm.push("W"); uit.vorm.push("V");
    } else if (m.homeShots < m.awayShots) {
      uit.w++; uit.ptn += 3; thuis.v++;
      uit.vorm.push("W"); thuis.vorm.push("V");
    } else {
      thuis.g++; uit.g++; thuis.ptn++; uit.ptn++;
      thuis.vorm.push("G"); uit.vorm.push("G");
    }
  }
  return [...teams.values()].sort(
    (a, b) =>
      b.ptn - a.ptn ||
      (b.voor - b.tegen) - (a.voor - a.tegen) ||
      b.voor - a.voor ||
      a.naam.localeCompare(b.naam, "nl")
  );
}

function el(tag, props = {}, ...kinderen) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kinderen);
  return node;
}

const datumFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });
const formatDatum = (iso) => datumFmt.format(new Date(iso + "T12:00:00"));
const saldo = (n) => (n > 0 ? "+" + n : n < 0 ? "−" + Math.abs(n) : "0");

function renderTabs(comps) {
  const nav = $("competities");
  nav.replaceChildren(
    ...comps.map((comp) =>
      el("button", {
        textContent: comp,
        ariaPressed: String(comp === state.comp),
        onclick: () => {
          state.comp = comp; state.team = null; state.toon = PER_PAGINA;
          try { localStorage.setItem("schotstand-comp", comp); } catch {}
          render();
        },
      })
    )
  );
}

function renderStand(wedstrijden) {
  const stand = berekenStand(wedstrijden);
  const tbody = $("stand").querySelector("tbody");
  tbody.replaceChildren(
    ...stand.map((t, i) => {
      const ds = t.voor - t.tegen;
      const vorm = el("td", { className: "vorm verberg-smal" },
        ...t.vorm.slice(-5).map((r) => el("span", { className: r, textContent: r })));
      const tr = el("tr", {},
        el("td", { className: "num pos", textContent: i + 1 }),
        el("td", { className: "team" }, el("button", {
          textContent: t.naam,
          onclick: () => { state.team = state.team === t.naam ? null : t.naam; state.toon = PER_PAGINA; render(); },
        })),
        el("td", { className: "num", textContent: t.gs }),
        el("td", { className: "num", textContent: t.w }),
        el("td", { className: "num", textContent: t.g }),
        el("td", { className: "num", textContent: t.v }),
        el("td", { className: "num verberg-smal", textContent: t.voor }),
        el("td", { className: "num verberg-smal", textContent: t.tegen }),
        el("td", { className: "num", textContent: saldo(ds) }),
        el("td", { className: "num ptn", textContent: t.ptn }),
        vorm
      );
      if (t.naam === state.team) tr.className = "actief";
      return tr;
    })
  );
  $("stand").hidden = stand.length === 0;
  $("leeg").hidden = stand.length > 0;
}

function renderUitslagen(wedstrijden) {
  const lijst = wedstrijden
    .filter((m) => !state.team || m.home === state.team || m.away === state.team)
    .sort((a, b) => b.date.localeCompare(a.date) || a.home.localeCompare(b.home, "nl"));
  $("uitslagen").replaceChildren(
    ...lijst.slice(0, state.toon).map((m) =>
      el("li", {},
        el("span", { className: "datum", textContent: formatDatum(m.date) }),
        el("span", { className: "thuis" + (m.homeShots > m.awayShots ? " winnaar" : ""), textContent: m.home }),
        el("span", { className: "score", textContent: `${m.homeShots} – ${m.awayShots}` }),
        el("span", { className: "uit" + (m.awayShots > m.homeShots ? " winnaar" : ""), textContent: m.away })
      )
    )
  );
  $("meer").hidden = lijst.length <= state.toon;
  $("filter").hidden = !state.team;
  $("filter").textContent = `${state.team} ✕`;
}

function render() {
  const comps = [...new Set(state.wedstrijden.map((m) => m.comp))].sort(
    (a, b) => (VOORKEUR_VOLGORDE.indexOf(a) + 1 || 99) - (VOORKEUR_VOLGORDE.indexOf(b) + 1 || 99) || a.localeCompare(b)
  );
  if (!comps.includes(state.comp)) state.comp = comps[0] ?? null;
  renderTabs(comps);
  const wedstrijden = state.wedstrijden.filter((m) => m.comp === state.comp);
  const laatste = wedstrijden.reduce((max, m) => (m.date > max ? m.date : max), "");
  $("meta").textContent = wedstrijden.length
    ? `${wedstrijden.length} wedstrijden · t/m ${formatDatum(laatste)}`
    : "";
  renderStand(wedstrijden);
  renderUitslagen(wedstrijden);
}

$("meer").onclick = () => { state.toon += PER_PAGINA; render(); };
$("filter").onclick = () => { state.team = null; state.toon = PER_PAGINA; render(); };

(async function start() {
  try { state.comp = localStorage.getItem("schotstand-comp"); } catch {}
  try {
    const res = await fetch("data/wedstrijden.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    state.wedstrijden = await res.json();
  } catch (err) {
    $("leeg").textContent = "Kon de wedstrijddata niet laden (" + err.message + ").";
  }
  render();
})();
