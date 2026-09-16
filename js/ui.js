/**
 * The pictures on the screen.
 * This file draws buttons, tables, and pages, then listens when you click them.
 */
import * as G from "./game.js";
import { formatMoney, formatCap, formatHeight, formatRecord, ovrTone, seasonLabel, streakLabel, pointsOf, ordinal, clamp } from "./utils.js";
import { SKATER_KEYS, GOALIE_KEYS, POTENTIAL_LABEL, marketSalary, expectedRole } from "./players.js";
import { SCOUT_ASSIGNMENTS, SCOUT_REGIONS } from "./scouting.js";
import { AWARDS } from "./awards.js";
import { DIVISIONS } from "./data/teams.js";
import { calendarLabel } from "./schedule.js";

const app = document.getElementById("app");
/** Little sticky notes about which page you are on, which team you picked, etc. */
const ui = {
  screen: "title",
  view: "home",
  rosterTab: "players",
  leagueTab: "standings",
  txTab: "trades",
  setup: { teamId: "bos", difficulty: "normal", salaryCap: 88e6, ownerGoal: "playoffs" },
  selectedPlayer: null,
  trade: { teamId: "tor", give: [], get: [], picking: false },
  recap: null,
  toast: null,
  rosterFilter: "nhl",
  search: "",
};

/** Start the screen and redraw whenever the URL hash changes. */
export function initUI() {
  bindHash();
  render();
}

/** #home, #roster... in the URL switches pages. */
function bindHash() {
  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    if (h && G.hasGame()) {
      ui.view = h;
      render();
    }
  });
}

/** Wipe the page and draw the right screen for where you are. */
function render() {
  if (ui.toast) setTimeout(() => { ui.toast = null; render(); }, 2800);
  if (!G.hasGame() || ui.screen === "title" || ui.screen === "setup") {
    app.innerHTML = (ui.screen === "setup" ? setupScreen() : titleScreen()) + toastHtml();
    bind();
    return;
  }
  const s = G.getState();
  if (s.owner?.fired) {
    app.innerHTML = firedScreen(s) + toastHtml();
    bind();
    return;
  }
  app.innerHTML = shell(s);
  bind();
}

function toastHtml() {
  return ui.toast ? `<div class="toast">${esc(ui.toast)}</div>` : "";
}

/** First screen: New Franchise, Continue, Load. */
function titleScreen() {
  const saves = G.listSaves();
  return `
    <div class="title-screen">
      <div class="title-card">
        <div class="kicker">NHL Franchise Simulator</div>
        <h1>FRANCHISE</h1>
        <p class="sub">32 NHL clubs. Current rosters. Build a contender.</p>
        <p class="faint">Fan-made simulator. Not affiliated with the NHL.</p>
        <div class="title-actions">
          <button class="btn gold" data-act="new">New Franchise</button>
          <button class="btn" data-act="load-autosave" ${saves.find((x) => x.slot === "autosave" && !x.empty) ? "" : "disabled"}>Continue</button>
        </div>
        <div class="save-list">
          ${saves.filter((x) => x.slot !== "autosave").map((sv) => `
            <div class="save-row">
              <div>
                <strong>${sv.empty ? "Empty slot" : esc(sv.team)}</strong>
                <div class="faint">${sv.empty ? sv.slot : `${seasonLabel(sv.season)} · ${esc(sv.phase)} · ${esc(sv.record)}`}</div>
              </div>
              <button class="btn small" data-act="load" data-slot="${sv.slot}" ${sv.empty ? "disabled" : ""}>Load</button>
            </div>
          `).join("")}
        </div>
      </div>
    </div>`;
}

/** Pick your NHL club, difficulty, and salary cap. */
function setupScreen() {
  const teams = G.TEAM_TEMPLATES;
  const sel = teams.find((t) => t.id === ui.setup.teamId);
  return `
    <div class="wizard">
      <div class="wizard-head">
        <div>
          <div class="kicker">New Franchise</div>
          <h1>Select your club</h1>
          <p class="muted">Every market plays differently. Large markets pay more and expect more.</p>
        </div>
        <div>
          <button class="btn ghost" data-act="back-title">Back</button>
          <button class="btn primary" data-act="start">Start Franchise</button>
        </div>
      </div>
      <div class="team-grid">
        ${teams.map((t) => `
          <button class="team-pick ${t.id === ui.setup.teamId ? "selected" : ""}" data-act="pick-team" data-id="${t.id}" style="--pick:${t.colors.primary}">
            ${crest(t)}
            <div>
              <strong>${esc(t.city)} ${esc(t.name)}</strong>
              <div class="faint">${t.conference} · ${t.division} · ${t.marketSize} market</div>
              <div class="faint">${labelPhil(t.philosophy)} · ${t.ownerExpectations}</div>
            </div>
          </button>
        `).join("")}
      </div>
      <div class="setup-panel">
        <label class="field">Difficulty
          <select data-act="set-diff">
            <option value="rookie" ${ui.setup.difficulty === "rookie" ? "selected" : ""}>Rookie</option>
            <option value="normal" ${ui.setup.difficulty === "normal" ? "selected" : ""}>Normal</option>
            <option value="hard" ${ui.setup.difficulty === "hard" ? "selected" : ""}>Hard</option>
            <option value="realistic" ${ui.setup.difficulty === "realistic" ? "selected" : ""}>Realistic</option>
          </select>
        </label>
        <label class="field">Salary cap
          <select data-act="set-cap">
            <option value="${82e6}" ${ui.setup.salaryCap === 82e6 ? "selected" : ""}>$82.0M</option>
            <option value="${88e6}" ${ui.setup.salaryCap === 88e6 ? "selected" : ""}>$88.0M</option>
            <option value="${95e6}" ${ui.setup.salaryCap === 95e6 ? "selected" : ""}>$95.0M</option>
            <option value="${0}" ${ui.setup.salaryCap === 0 ? "selected" : ""}>No cap</option>
          </select>
        </label>
        <label class="field">Franchise goal
          <select data-act="set-goal">
            <option value="rebuild">Rebuild</option>
            <option value="playoffs" selected>Make playoffs</option>
            <option value="cup">Win the Cup</option>
            <option value="develop">Develop prospects</option>
          </select>
        </label>
        <div>
          <div class="faint">Selected</div>
          <div class="stat sm">${esc(sel.city)} ${esc(sel.name)}</div>
          <div class="muted">${esc(sel.arena)} · Budget ${formatMoney(sel.budget)}</div>
        </div>
      </div>
    </div>`;
}

/** Sad screen if the owner fires you. */
function firedScreen(s) {
  return `<div class="fired">
    <div>
      <div class="kicker">Ownership decision</div>
      <h1>YOU'RE FIRED</h1>
      <p class="sub">The ${esc(s.teams[s.userTeamId].displayName)} are moving on. Legacy score: ${s.legacy.score.toLocaleString()}</p>
      <button class="btn primary" data-act="new">New Franchise</button>
    </div>
  </div>`;
}

/** The main game: sidebar on the left, page on the right. */
function shell(s) {
  const t = s.teams[s.userTeamId];
  document.documentElement.style.setProperty("--team", t.colors.primary);
  document.documentElement.style.setProperty("--team-2", t.colors.secondary);
  const views = {
    home: viewHome, roster: viewRoster, transactions: viewTx, scouting: viewScouting,
    draft: viewDraft, finances: viewFinances, league: viewLeague, calendar: viewCalendar, franchise: viewFranchise,
  };
  const fn = views[ui.view] || viewHome;
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="kicker">NHL</div>
          <h2>FRANCHISE</h2>
        </div>
        <div class="file-actions">
          <button class="btn small" data-act="save">Save</button>
          <button class="btn small ghost" data-act="title">Exit</button>
        </div>
        ${navBtn("home", "Home")}
        ${navBtn("roster", "Roster")}
        ${navBtn("transactions", "Transactions")}
        ${navBtn("scouting", "Scouting")}
        ${navBtn("draft", "Draft")}
        ${navBtn("finances", "Finances")}
        ${navBtn("league", "League")}
        ${navBtn("calendar", "Calendar")}
        ${navBtn("franchise", "Franchise")}
        <div class="side-meta">
          ${crest(t, "sm")}
          <div><strong>${esc(t.abbr)}</strong> ${formatRecord(t.record)}</div>
          <div>${seasonLabel(s.season)} · ${esc(s.phase)}</div>
          <div>Cap ${formatCap(G.capSpace(s, t.id))}</div>
        </div>
      </aside>
      <main class="main">
        ${fn(s, t)}
      </main>
    </div>
    ${ui.selectedPlayer ? playerModal(s, s.players[ui.selectedPlayer]) : ""}
    ${ui.recap ? recapModal(s, ui.recap) : ""}
    ${ui.toast ? `<div class="toast">${esc(ui.toast)}</div>` : ""}
  `;
}

/** One button in the left menu. */
function navBtn(id, label) {
  return `<button class="nav-btn ${ui.view === id ? "active" : ""}" data-act="nav" data-view="${id}">${label}</button>`;
}

/** Home dashboard: record, cap, next game, news. */
function viewHome(s, t) {
  const rank = G.userRank(s);
  const next = G.nextUserGame(s);
  const opp = next ? s.teams[next.home === t.id ? next.away : next.home] : null;
  const scorers = t.roster.map((id) => s.players[id]).filter((p) => p && p.position !== "G").sort((a, b) => (b.stats.season.p || 0) - (a.stats.season.p || 0));
  const goalie = s.players[t.lines.starter];
  const injuries = t.roster.map((id) => s.players[id]).filter((p) => p?.injury);
  const news = s.news.slice(0, 6);
  const warns = G.capWarnings(s, t.id);
  const ovr = teamOvr(s, t);
  return `
    <div class="topbar">
      <div>
        <div class="phase-chip">${esc(s.phase)} · Day ${s.day} · ${calendarLabel(s.day)}</div>
        <h1>${esc(t.displayName)}</h1>
        <div class="muted">${esc(t.arena)} · ${t.conference} / ${t.division}</div>
      </div>
      ${simControls(s)}
    </div>
    <div class="grid cols-4">
      ${kpi("Record", formatRecord(t.record), `${pointsOf(t.record)} PTS · ${ordinal(rank.rank)} of 32`)}
      ${kpi("Team OVR", ovr, "Skaters + starter")}
      ${kpi("Cap space", formatCap(G.capSpace(s, t.id)), `${formatCap(G.teamPayroll(s, t.id).total)} payroll`)}
      ${kpi("Owner", Math.round(s.owner.confidence) + "%", s.owner.goals?.[0]?.label || "Stay the course")}
    </div>
    <div class="grid dash" style="margin-top:14px">
      <div class="grid">
        <div class="card">
          <h3>Next game</h3>
          ${next ? `<div class="stat">${next.home === t.id ? "vs" : "@"} ${esc(opp.displayName)}</div>
            <div class="muted">${calendarLabel(next.day)} · ${next.home === t.id ? "Home" : "Away"} · ${esc(next.type)}</div>
            <div class="faint" style="margin-top:8px">G: ${goalie ? esc(goalie.name) : "TBD"} · Injuries: ${injuries.length}</div>` : `<div class="muted">No remaining games in this phase.</div>`}
        </div>
        <div class="card">
          <h3>Alerts</h3>
          <div class="warn-list">${warns.length ? warns.map((w) => `<div class="warn ${w.level}">${esc(w.text)}</div>`).join("") : `<div class="muted">Roster is legal.</div>`}</div>
        </div>
        <div class="card">
          <h3>Top scorers</h3>
          <table>${scorers.slice(0, 5).map((p) => `<tr class="clickable" data-act="player" data-id="${p.id}"><td>${esc(p.name)}</td><td class="num">${p.stats.season.g || 0}</td><td class="num">${p.stats.season.a || 0}</td><td class="num">${p.stats.season.p || 0}</td></tr>`).join("")}</table>
        </div>
      </div>
      <div class="grid">
        <div class="card">
          <h3>Streak / confidence</h3>
          <div class="stat">${streakLabel(t.streak)}</div>
          <div class="meter" style="margin:10px 0"><i style="width:${s.owner.confidence}%"></i></div>
          <div class="muted">Starting goalie: ${goalie ? `${esc(goalie.name)} ${goalie.ratings.overall} OVR` : "—"}</div>
        </div>
        <div class="card">
          <h3>Injuries</h3>
          ${injuries.length ? injuries.map((p) => `<div>${esc(p.name)} · ${esc(p.injury.type)} · ${p.injury.days}d</div>`).join("") : `<div class="muted">No significant injuries.</div>`}
        </div>
        <div class="card">
          <h3>News</h3>
          ${news.map((n) => `<div class="news-item"><div class="when">${seasonLabel(n.season)} · ${n.type}</div><strong>${esc(n.title)}</strong><div class="muted">${esc(n.body || "")}</div></div>`).join("") || `<div class="muted">Quiet news day.</div>`}
        </div>
      </div>
    </div>
  `;
}

/** Sim next game / week / season buttons. They change in the playoffs. */
function simControls(s) {
  if (s.phase === "playoffs") {
    return `<div class="title-actions">
      <button class="btn primary" data-act="sim-game">Sim game</button>
      <button class="btn" data-act="sim-series">Sim series</button>
      <button class="btn" data-act="sim-playoffs">Sim rest of playoffs</button>
    </div>`;
  }
  if (s.phase === "awards") {
    return `<button class="btn primary" data-act="offseason-next">Continue to draft lottery</button>`;
  }
  if (s.phase === "draft") {
    return `<div class="muted">On the clock? Use the Draft tab.</div>`;
  }
  if (s.phase === "freeAgency") {
    return `<div class="title-actions">
      <button class="btn primary" data-act="fa-day">Sim FA day (${s.faDay || 1}/10)</button>
      <button class="btn" data-act="fa-skip">Skip remaining FA</button>
    </div>`;
  }
  return `<div class="title-actions">
    <button class="btn primary" data-act="sim-game">Sim next game</button>
    <button class="btn" data-act="sim-week">Sim week</button>
    <button class="btn" data-act="sim-deadline">To deadline</button>
    <button class="btn" data-act="sim-season">Sim season</button>
  </div>`;
}

/** A little stat card, like Record 12-8-2. */
function kpi(label, value, sub) {
  return `<div class="card"><h3>${label}</h3><div class="stat">${value}</div><div class="muted">${sub || ""}</div></div>`;
}

/** Roster page with tabs for players, lines, contracts, depth. */
function viewRoster(s, t) {
  const tabs = [["players", "Players"], ["lines", "Lines"], ["contracts", "Contracts"], ["depth", "Depth / farm"]];
  return `
    <div class="topbar">
      <div><div class="phase-chip">Roster</div><h1>${esc(t.displayName)}</h1></div>
      <button class="btn" data-act="auto-lines">Auto lines</button>
    </div>
    <div class="tabs">${tabs.map(([id, l]) => `<button class="tab ${ui.rosterTab === id ? "active" : ""}" data-act="roster-tab" data-id="${id}">${l}</button>`).join("")}</div>
    ${ui.rosterTab === "players" ? rosterTable(s, t) : ""}
    ${ui.rosterTab === "lines" ? linesEditor(s, t) : ""}
    ${ui.rosterTab === "contracts" ? contractsTable(s, t) : ""}
    ${ui.rosterTab === "depth" ? depthTable(s, t) : ""}
  `;
}

/** Table of your NHL players. */
function rosterTable(s, t) {
  const players = t.roster.map((id) => s.players[id]).filter(Boolean).sort((a, b) => posOrder(a.position) - posOrder(b.position) || b.ratings.overall - a.ratings.overall);
  return `<div class="card" style="overflow:auto">
    <table>
      <thead><tr><th></th><th>Player</th><th>Pos</th><th class="num">Age</th><th class="num">OVR</th><th>Pot</th><th>Archetype</th><th class="num">G</th><th class="num">A</th><th class="num">P</th><th>Contract</th></tr></thead>
      <tbody>
        ${players.map((p) => `
          <tr class="clickable" data-act="player" data-id="${p.id}">
            <td><span class="ovr ${ovrTone(p.ratings.overall)}">${p.ratings.overall}</span></td>
            <td><div class="player-cell">${mug(p)}<span>${esc(p.name)} ${p.captain ? `<span class="badge">${p.captain}</span>` : ""} ${p.injury ? `<span class="badge bad">INJ</span>` : ""}</span></div></td>
            <td>${p.position}</td>
            <td class="num">${p.age}</td>
            <td class="num">${p.ratings.overall}</td>
            <td>${POTENTIAL_LABEL[p.potential.category] || p.potential.category}</td>
            <td class="muted">${G.ARCHETYPES[p.archetype]?.label || p.archetype}</td>
            <td class="num">${p.position === "G" ? (p.stats.season.w || 0) : (p.stats.season.g || 0)}</td>
            <td class="num">${p.position === "G" ? ((p.stats.season.svpct || 0) * 100).toFixed(1) : (p.stats.season.a || 0)}</td>
            <td class="num">${p.position === "G" ? (p.stats.season.gaa || 0).toFixed(2) : (p.stats.season.p || 0)}</td>
            <td>${formatMoney(p.contract.salary)} × ${p.contract.yearsLeft}</td>
          </tr>`).join("")}
      </tbody>
    </table>
  </div>`;
}

/** Drag-style line editor (dropdowns for each slot). */
function linesEditor(s, t) {
  const L = t.lines;
  const row = (key, label, n) => `
    <div class="line-row">
      <div class="muted">${label}</div>
      <div class="line-slots">
        ${Array.from({ length: n }, (_, i) => lineSlot(s, t, key, i, Array.isArray(L[key]) ? L[key][i] : L[key])).join("")}
      </div>
    </div>`;
  return `<div class="card lines">
    ${row("f1", "Line 1", 3)}${row("f2", "Line 2", 3)}${row("f3", "Line 3", 3)}${row("f4", "Line 4", 3)}
    ${row("d1", "Pair 1", 2)}${row("d2", "Pair 2", 2)}${row("d3", "Pair 3", 2)}
    ${row("pp1", "PP1", 5)}${row("pp2", "PP2", 5)}
    ${row("pk1", "PK1", 4)}${row("pk2", "PK2", 4)}
    <div class="line-row"><div class="muted">Goalies</div><div class="line-slots">${lineSlot(s, t, "starter", 0, L.starter)}${lineSlot(s, t, "backup", 0, L.backup)}</div></div>
  </div>`;
}

/** One dropdown on a line. */
function lineSlot(s, t, key, i, pid) {
  const p = pid ? s.players[pid] : null;
  const opts = t.roster.map((id) => s.players[id]).filter(Boolean);
  return `<label class="slot ${p ? "has" : ""}">
    <div class="faint">${p ? `${p.position} ${p.ratings.overall}` : "Empty"}</div>
    <select data-act="line" data-key="${key}" data-i="${i}">
      <option value="">—</option>
      ${opts.map((o) => `<option value="${o.id}" ${o.id === pid ? "selected" : ""}>${o.position} ${o.name} (${o.ratings.overall})</option>`).join("")}
    </select>
  </label>`;
}

/** Who is owed what money, and for how many years. */
function contractsTable(s, t) {
  const players = t.roster.map((id) => s.players[id]).filter(Boolean).sort((a, b) => b.contract.salary - a.contract.salary);
  return `<div class="card" style="overflow:auto"><table>
    <thead><tr><th>Player</th><th class="num">AAV</th><th class="num">Yrs</th><th>Type</th><th>Clause</th><th>Expiry</th><th></th></tr></thead>
    <tbody>${players.map((p) => `
      <tr>
        <td class="clickable" data-act="player" data-id="${p.id}">${esc(p.name)}</td>
        <td class="num">${formatMoney(p.contract.salary)}</td>
        <td class="num">${p.contract.yearsLeft}</td>
        <td>${p.contract.type}</td>
        <td>${p.contract.nmc ? "NMC" : p.contract.ntc ? "NTC" : "—"}</td>
        <td>${p.contract.expiry}</td>
        <td>${p.contract.yearsLeft === 1 ? `<button class="btn small" data-act="extend" data-id="${p.id}">Extend</button>` : ""}</td>
      </tr>`).join("")}</tbody>
  </table></div>`;
}

/** Chart of how deep you are at each position. */
function depthTable(s, t) {
  const farm = [...t.minors, ...t.prospects].map((id) => s.players[id]).filter(Boolean).sort((a, b) => b.potential.ceiling - a.potential.ceiling);
  return `<div class="card"><h3>Affiliate & prospects</h3>
    <table><thead><tr><th>Player</th><th>Pos</th><th>Age</th><th>OVR</th><th>Pot</th><th>Status</th><th></th></tr></thead>
    <tbody>${farm.map((p) => `<tr>
      <td class="clickable" data-act="player" data-id="${p.id}">${esc(p.name)}</td>
      <td>${p.position}</td><td>${p.age}</td><td>${p.ratings.overall}</td>
      <td>${POTENTIAL_LABEL[p.potential.category]}</td><td>${p.status}</td>
      <td><button class="btn small" data-act="callup" data-id="${p.id}">Call up</button></td>
    </tr>`).join("")}</tbody></table></div>`;
}

/** Trades, free agents, and waivers live on this page. */
function viewTx(s, t) {
  const tabs = [["trades", "Trade machine"], ["fa", "Free agency"], ["waivers", "Waivers"]];
  return `
    <div class="topbar"><div><div class="phase-chip">Transactions</div><h1>Move the needle</h1></div></div>
    <div class="tabs">${tabs.map(([id, l]) => `<button class="tab ${ui.txTab === id ? "active" : ""}" data-act="tx-tab" data-id="${id}">${l}</button>`).join("")}</div>
    ${ui.txTab === "trades" ? tradeMachine(s, t) : ui.txTab === "fa" ? faBoard(s, t) : waiverBoard(s, t)}
  `;
}

/** Two columns: you give stuff, they give stuff. */
function tradeMachine(s, t) {
  const partners = Object.values(s.teams).filter((x) => x.id !== t.id).sort((a, b) => a.displayName.localeCompare(b.displayName));
  if (!ui.trade.teamId || ui.trade.teamId === t.id || !s.teams[ui.trade.teamId]) {
    ui.trade.teamId = partners[0]?.id;
  }
  const other = s.teams[ui.trade.teamId];
  const val = G.valueLabel(estimateRatio(s, t.id, other.id));
  return `<div class="trade">
    <div class="trade-col">
      <h3>Your club — ${esc(t.abbr)}</h3>
      ${assetPicker(s, t, "give")}
      <div class="chip-list">${ui.trade.give.map((a) => chip(s, a, "give")).join("")}</div>
    </div>
    <div class="trade-col">
      <label class="field">Partner</label>
      <div class="partner-picker">
        <button type="button" class="btn partner-btn" data-act="trade-open">
          ${crest(other, "sm")}
          <span>${esc(other.displayName)}</span>
        </button>
        ${ui.trade.picking ? `<div class="partner-menu">
          ${partners.map((x) => `
            <button type="button" class="partner-opt ${x.id === other.id ? "selected" : ""}" data-act="trade-team" data-id="${x.id}">
              ${crest(x, "sm")}
              <span>${esc(x.displayName)}</span>
              <span class="faint">${esc(x.abbr)}</span>
            </button>`).join("")}
        </div>` : ""}
      </div>
      ${assetPicker(s, other, "get")}
      <div class="chip-list">${ui.trade.get.map((a) => chip(s, a, "get")).join("")}</div>
    </div>
  </div>
  <div class="card" style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
    <div><div class="faint">Balance (estimated)</div><div class="stat sm">${val.text}</div></div>
    <button class="btn primary" data-act="propose">Propose trade</button>
  </div>`;
}

/** Quick "is this trade fair?" number. */
function estimateRatio(s, fromId, toId) {
  if (!ui.trade.give.length && !ui.trade.get.length) return 1;
  const ev = G.previewTrade(toId, ui.trade.give, ui.trade.get);
  if (!ev.ratio || ev.ratio === 99) return ui.trade.get.length && !ui.trade.give.length ? 2 : 0.5;
  return 1 / ev.ratio;
}

/** Dropdowns to add a player or pick to one side of a trade. */
function assetPicker(s, team, side) {
  const players = [...team.roster, ...team.minors.slice(0, 8)].map((id) => s.players[id]).filter(Boolean);
  return `
    <label class="field">Add player
      <select data-act="add-asset" data-side="${side}" data-kind="player">
        <option value="">Select…</option>
        ${players.map((p) => `<option value="${p.id}">${p.position} ${p.name} (${p.ratings.overall}, ${formatMoney(p.contract.salary)})</option>`).join("")}
      </select>
    </label>
    <label class="field">Add pick
      <select data-act="add-asset" data-side="${side}" data-kind="pick">
        <option value="">Select…</option>
        ${team.picks.slice().sort((a, b) => a.year - b.year || a.round - b.round).map((p) => `<option value="${p.id}">${p.year} R${p.round}${p.original !== team.id ? ` (${s.teams[p.original]?.abbr})` : ""}</option>`).join("")}
      </select>
    </label>`;
}

/** A little pill showing one player or pick already in the deal. */
function chip(s, a, side) {
  const label = a.kind === "player" ? s.players[a.id]?.name : G.pickLabel(s, a.id);
  return `<span class="chip">${esc(label)} <button data-act="rm-asset" data-side="${side}" data-id="${a.id}">×</button></span>`;
}

/** List of unsigned players you can offer money to. */
function faBoard(s) {
  const list = G.faBoard(s).slice(0, 40);
  return `<div class="card" style="overflow:auto"><table>
    <thead><tr><th>Player</th><th>Pos</th><th>Age</th><th>OVR</th><th>Wants</th><th></th></tr></thead>
    <tbody>${list.map((p) => `<tr>
      <td class="clickable" data-act="player" data-id="${p.id}">${esc(p.name)}</td>
      <td>${p.position}</td><td>${p.age}</td>
      <td><span class="ovr ${ovrTone(p.ratings.overall)}">${p.ratings.overall}</span></td>
      <td class="muted">${p.faPriority || "money"}</td>
      <td><button class="btn small" data-act="offer-fa" data-id="${p.id}">Offer</button></td>
    </tr>`).join("")}</tbody></table></div>`;
}

/** Weak NHL players you might send down or waive. */
function waiverBoard(s, t) {
  const list = t.roster.map((id) => s.players[id]).filter(Boolean).sort((a, b) => a.ratings.overall - b.ratings.overall);
  return `<div class="card"><p class="muted">Send a player down or place them on waivers. Better players are more likely to be claimed.</p>
    <table><tbody>${list.map((p) => `<tr>
      <td>${esc(p.name)}</td><td>${p.position}</td><td>${p.ratings.overall}</td>
      <td><button class="btn small" data-act="senddown" data-id="${p.id}">Send down</button>
          <button class="btn small danger" data-act="waive" data-id="${p.id}">Waivers</button></td>
    </tr>`).join("")}</tbody></table></div>`;
}

/** Assign scouts and see fuzzy overalls for other teams. */
function viewScouting(s, t) {
  const scouts = t.scouts.map((id) => s.scouts[id]).filter(Boolean);
  const targets = Object.values(s.players).filter((p) => p.status === "draft" || (p.status === "prospect" && p.teamId !== t.id) || (p.status === "nhl" && p.teamId !== t.id)).sort((a, b) => (b.scout?.knowledge || 0) - (a.scout?.knowledge || 0)).slice(0, 25);
  return `
    <div class="topbar"><div><div class="phase-chip">Scouting</div><h1>Department</h1></div></div>
    <div class="grid cols-2">
      <div class="card">
        <h3>Scouts</h3>
        ${scouts.map((sc) => `
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;align-items:center">
            <strong>${esc(sc.name)}</strong>
            <select data-act="scout-assign" data-id="${sc.id}">
              ${SCOUT_ASSIGNMENTS.map((a) => `<option value="${a.id}" ${sc.assignment === a.id ? "selected" : ""}>${a.label}</option>`).join("")}
            </select>
            <select data-act="scout-region" data-id="${sc.id}">
              ${SCOUT_REGIONS.map((r) => `<option ${sc.region === r ? "selected" : ""}>${r}</option>`).join("")}
            </select>
          </div>`).join("")}
      </div>
      <div class="card">
        <h3>Reports</h3>
        <table>${targets.map((p) => {
          const r = G.reportFor(p, s.userTeamId);
          return `<tr class="clickable" data-act="player" data-id="${p.id}"><td>${esc(p.name)}</td><td>${p.position}</td><td>${r.overallText}</td><td>${r.potentialText}</td><td class="muted">${Math.round(r.knowledge)}%</td></tr>`;
        }).join("")}</table>
      </div>
    </div>`;
}

/** Draft board: whose pick it is, and the kids still available. */
function viewDraft(s) {
  if (!s.draft) {
    return `<div class="card"><h3>Draft</h3><p class="muted">The draft opens after the regular season and awards. Keep scouting in the meantime.</p>
      ${s.phase === "awards" ? `<button class="btn primary" data-act="offseason-next">Open lottery / draft</button>` : ""}</div>`;
  }
  const slot = G.currentDraftPick(s);
  const avail = G.availableProspects(s).sort((a, b) => a.draftRank - b.draftRank).slice(0, 40);
  const recent = s.draft.picks.filter((p) => p.playerId).slice(-8).reverse();
  const onClock = slot && slot.teamId === s.userTeamId;
  return `
    <div class="topbar">
      <div><div class="phase-chip">${s.draft.year} Draft</div><h1>${slot ? `${esc(s.teams[slot.teamId].abbr)} on the clock · ${ordinal(slot.overall)}` : "Draft complete"}</h1></div>
      <div class="title-actions">
        ${onClock ? `<button class="btn primary" data-act="draft-best">Auto-pick BPA</button>` : ""}
        ${slot && !onClock ? `<button class="btn" data-act="draft-sim">Sim to our pick</button>` : ""}
        ${s.draft.complete ? `<button class="btn primary" data-act="offseason-next">Continue to free agency</button>` : ""}
      </div>
    </div>
    <div class="grid dash">
      <div class="card" style="overflow:auto">
        <h3>Available</h3>
        <table><thead><tr><th>#</th><th>Player</th><th>Pos</th><th>OVR est.</th><th>Pot</th><th></th></tr></thead>
        <tbody>${avail.map((p) => {
          const r = G.reportFor(p, s.userTeamId);
          return `<tr>
            <td>${p.draftRank}</td>
            <td class="clickable" data-act="player" data-id="${p.id}">${esc(p.name)}</td>
            <td>${p.position}</td><td>${r.overallText}</td><td>${r.potentialText}</td>
            <td>${onClock ? `<button class="btn small primary" data-act="draft" data-id="${p.id}">Draft</button>` : ""}</td>
          </tr>`;
        }).join("")}</tbody></table>
      </div>
      <div class="card">
        <h3>Recent picks</h3>
        ${recent.map((pk) => {
          const p = s.players[pk.playerId];
          return `<div class="news-item"><strong>${ordinal(pk.overall)} ${esc(s.teams[pk.teamId].abbr)}</strong> — ${esc(p?.name || "")}</div>`;
        }).join("") || `<div class="muted">No picks yet.</div>`}
      </div>
    </div>`;
}

/** Cap space, payroll, and ticket money. */
function viewFinances(s, t) {
  const f = G.teamFinances(s, t.id);
  const players = t.roster.map((id) => s.players[id]).filter(Boolean).sort((a, b) => b.contract.salary - a.contract.salary);
  return `
    <div class="topbar"><div><div class="phase-chip">Finances</div><h1>Cap & books</h1></div></div>
    <div class="grid cols-4">
      ${kpi("Cap", formatCap(f.cap), "League ceiling")}
      ${kpi("Payroll", formatCap(f.total), `${formatCap(f.retained)} retained`)}
      ${kpi("Space", formatCap(f.space), f.space < 0 ? "Illegal" : "Available")}
      ${kpi("Profit", formatCap(f.profit), `Rev ${formatCap(f.revenue)}`)}
    </div>
    <div class="card" style="margin-top:14px">
      <div class="meter"><i style="width:${clamp((f.total / f.cap) * 100, 0, 100)}%"></i></div>
      <table style="margin-top:12px">${players.map((p) => `<tr class="clickable" data-act="player" data-id="${p.id}"><td>${esc(p.name)}</td><td class="num">${formatMoney(p.contract.salary)}</td><td>${p.contract.yearsLeft} yrs</td><td class="muted">${p.contract.twoWay ? "two-way" : "one-way"}</td></tr>`).join("")}</table>
    </div>`;
}

/** League page: standings, stats leaders, awards. */
function viewLeague(s) {
  const tabs = [["standings", "Standings"], ["stats", "Leaders"], ["awards", "Awards"]];
  return `
    <div class="topbar"><div><div class="phase-chip">League</div><h1>National Hockey League</h1></div></div>
    <div class="tabs">${tabs.map(([id, l]) => `<button class="tab ${ui.leagueTab === id ? "active" : ""}" data-act="league-tab" data-id="${id}">${l}</button>`).join("")}</div>
    ${ui.leagueTab === "standings" ? standingsView(s) : ui.leagueTab === "stats" ? statsView(s) : awardsView(s)}
  `;
}

/** The big table of wins, losses, and points. */
function standingsView(s) {
  return Object.keys(DIVISIONS).map((div) => {
    const rows = G.standingsList(s).filter((r) => r.team.division === div);
    return `<div class="card" style="margin-bottom:12px"><h3>${div}</h3>
      <table><thead><tr><th></th><th>Team</th><th class="num">GP</th><th class="num">W</th><th class="num">L</th><th class="num">OT</th><th class="num">PTS</th><th class="num">GF</th><th class="num">GA</th><th class="num">DIFF</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr ${r.team.id === s.userTeamId ? `style="background:color-mix(in srgb, var(--team) 16%, transparent)"` : ""}>
        <td>${i + 1}</td><td>${crest(r.team, "sm")} ${esc(r.team.displayName)}</td>
        <td class="num">${r.gp}</td><td class="num">${r.w}</td><td class="num">${r.l}</td><td class="num">${r.ot}</td>
        <td class="num"><strong>${r.pts}</strong></td><td class="num">${r.gf}</td><td class="num">${r.ga}</td><td class="num">${r.diff}</td>
      </tr>`).join("")}</tbody></table></div>`;
  }).join("");
}

/** Scoring and save-percentage leaders. */
function statsView(s) {
  const pts = G.leaders(s, "p", null, 10);
  const g = G.leaders(s, "g", "F", 8);
  const goalies = G.leaders(s, "svpct", "G", 8);
  const row = (x, extra) => `<tr class="clickable" data-act="player" data-id="${x.player.id}"><td>${esc(x.player.name)}</td><td>${s.teams[x.player.teamId]?.abbr || ""}</td><td class="num">${extra(x)}</td></tr>`;
  return `<div class="grid cols-3">
    <div class="card"><h3>Points</h3><table>${pts.map((x) => row(x, (z) => z.stats.p || (z.stats.g + z.stats.a))).join("")}</table></div>
    <div class="card"><h3>Goals</h3><table>${g.map((x) => row(x, (z) => z.stats.g)).join("")}</table></div>
    <div class="card"><h3>Goalies SV%</h3><table>${goalies.map((x) => row(x, (z) => ((z.stats.svpct || 0) * 100).toFixed(1))).join("")}</table></div>
  </div>`;
}

/** Trophy case from past seasons. */
function awardsView(s) {
  const last = s.history.awards[s.history.awards.length - 1];
  return `<div class="card">
    <h3>Award history</h3>
    ${AWARDS.map((a) => `<div class="news-item"><strong>${a.name}</strong> — ${a.desc}</div>`).join("")}
    <div class="muted" style="margin-top:12px">${last ? `Last awarded in ${last.season}` : "Awards are presented after the regular season."}</div>
    <h3 style="margin-top:18px">Champions</h3>
    ${s.history.champions.map((c) => `<div>${c.season} — ${esc(c.name)}</div>`).join("") || `<div class="muted">The Cup is still out there.</div>`}
  </div>`;
}

/** Upcoming games, or the playoff bracket when it is that time. */
function viewCalendar(s, t) {
  const games = s.schedule.filter((g) => g.home === t.id || g.away === t.id).slice(0, 40);
  const po = s.playoffs;
  return `
    <div class="topbar"><div><div class="phase-chip">Calendar</div><h1>Schedule & simulation</h1></div>${simControls(s)}</div>
    ${po ? playoffBracket(s, po) : ""}
    <div class="card" style="overflow:auto">
      <table><thead><tr><th>Day</th><th></th><th>Opponent</th><th>Result</th></tr></thead>
      <tbody>${games.map((g) => {
        const home = g.home === t.id;
        const opp = s.teams[home ? g.away : g.home];
        const res = g.result ? `${g.result.homeGoals}–${g.result.awayGoals}${g.result.ot ? " OT" : g.result.so ? " SO" : ""}` : "—";
        return `<tr class="${g.played && g.result ? "clickable" : ""}" ${g.played ? `data-act="recap" data-id="${g.id}"` : ""}>
          <td>${calendarLabel(g.day)}</td><td>${home ? "vs" : "@"}</td><td>${esc(opp.displayName)}</td><td>${res}</td>
        </tr>`;
      }).join("")}</tbody></table>
    </div>`;
}

/** Draw every series in the current playoff round. */
function playoffBracket(s, po) {
  const block = (title, arr) => `<div><h3>${title}</h3>${(arr || []).map((sr) => {
    const h = s.teams[sr.home]; const a = s.teams[sr.away];
    return `<div class="series-card"><div class="row"><span>${esc(h.abbr)}</span><strong>${sr.wins[sr.home] || 0}</strong></div>
      <div class="row"><span>${esc(a.abbr)}</span><strong>${sr.wins[sr.away] || 0}</strong></div>
      ${sr.winner ? `<div class="faint">Winner: ${s.teams[sr.winner].abbr}</div>` : ""}</div>`;
  }).join("")}</div>`;
  return `<div class="grid cols-4" style="margin-bottom:14px">
    ${block("Round 1 — East", po.rounds.R1.Eastern)}
    ${block("Round 1 — West", po.rounds.R1.Western)}
    ${block("Conf. finals", [...(po.rounds.CF.Eastern || []), ...(po.rounds.CF.Western || [])])}
    ${block("Final", po.rounds.SCF.league || [])}
  </div>`;
}

/** Cups, awards, and how the owner feels about you. */
function viewFranchise(s, t) {
  return `
    <div class="topbar"><div><div class="phase-chip">Franchise</div><h1>Legacy ${s.legacy.score.toLocaleString()}</h1></div></div>
    <div class="grid cols-4">
      ${kpi("Cups", s.legacy.cups, "As GM")}
      ${kpi("Playoff apps", s.legacy.playoffApps, "During your tenure")}
      ${kpi("Draft hits", s.legacy.draftHits, "Franchise prospects")}
      ${kpi("Trades", s.legacy.trades, "Deals you closed")}
    </div>
    <div class="card" style="margin-top:14px">
      <h3>Season log</h3>
      <table><thead><tr><th>Year</th><th>Record</th><th>Pts</th><th>Playoffs</th><th>Cup</th></tr></thead>
      <tbody>${(s.history.userSeasons || []).map((y) => `<tr>
        <td>${y.season}</td><td>${y.record.w}-${y.record.l}-${y.record.ot}</td><td>${y.pts}</td>
        <td>${y.playoffs ? "Yes" : "No"}</td><td>${y.cup ? "Yes" : ""}</td>
      </tr>`).join("") || `<tr><td colspan="5" class="muted">Your first season is still in progress.</td></tr>`}</tbody></table>
    </div>
    <div class="card" style="margin-top:14px">
      <h3>Club history</h3>
      <div class="muted">${esc(t.displayName)} · ${t.history.cups} prior Cups · ${t.history.playoffApps} playoff appearances</div>
      <div class="faint" style="margin-top:8px">Coach: ${esc(t.coach.name)} · ${t.coach.system} · OFF ${t.coach.offense} / DEF ${t.coach.defense} / DEV ${t.coach.development}</div>
    </div>`;
}

/** Big popup with one player's skills, contract, and stats. */
function playerModal(s, p) {
  if (!p) return "";
  const team = p.teamId ? s.teams[p.teamId] : null;
  const keys = p.position === "G" ? GOALIE_KEYS : SKATER_KEYS;
  const hist = (p.ovrHistory || []).map((h, i) => {
    const x = 10 + i * (220 / Math.max(1, p.ovrHistory.length - 1));
    const y = 60 - ((h.ovr - 50) / 50) * 50;
    return `${x},${y}`;
  }).join(" ");
  const st = p.stats.season || {};
  const cr = p.stats.career || {};
  return `<div class="modal-bg" data-act="close-modal">
    <div class="modal" data-stop="1">
      <div style="display:flex;justify-content:space-between;gap:12px">
        <div style="display:flex;gap:14px;align-items:start">
          ${mug(p, "lg")}
          <div>
          <div class="kicker">${p.position} · #${p.jersey} · ${p.nationality}</div>
          <h1>${esc(p.name)}</h1>
          <div class="muted">${p.age} yrs · ${formatHeight(p.height)} · ${p.weight} lbs · ${team ? esc(team.displayName) : "Free agent"} · ${G.ARCHETYPES[p.archetype]?.label || p.archetype}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div class="ovr ${ovrTone(p.ratings.overall)}" style="font-size:42px">${p.ratings.overall}</div>
          <div class="badge">${POTENTIAL_LABEL[p.potential.category] || p.potential.category}</div>
        </div>
      </div>
      <div class="tabs" style="margin-top:16px">
        <span class="badge blue">Morale ${Math.round(p.morale)}</span>
        <span class="badge">Role ${expectedRole(p)}</span>
        <span class="badge">${formatMoney(p.contract?.salary || 0)} × ${p.contract?.yearsLeft || 0}</span>
        ${p.contract?.nmc ? `<span class="badge warn">NMC</span>` : p.contract?.ntc ? `<span class="badge">NTC</span>` : ""}
        ${p.injury ? `<span class="badge bad">${p.injury.type}</span>` : ""}
        ${p.tradeRequest ? `<span class="badge bad">Trade request</span>` : ""}
      </div>
      <div class="grid cols-2" style="margin-top:14px">
        <div class="card">
          <h3>Attributes</h3>
          <div class="attrs">${keys.map((k) => `<div class="attr"><span>${labelKey(k)}</span><strong>${p.ratings[k]}</strong><div class="bar"><i style="width:${p.ratings[k]}%"></i></div></div>`).join("")}</div>
        </div>
        <div>
          <div class="card">
            <h3>Season / career</h3>
            ${p.position === "G"
              ? `<div>GP ${st.gp || 0} · ${st.w || 0}-${st.l || 0}-${st.ot || 0} · SV% ${((st.svpct || 0) * 100).toFixed(1)} · GAA ${(st.gaa || 0).toFixed(2)}</div>
                 <div class="muted">Career GP ${cr.gp || 0} · W ${cr.w || 0}</div>`
              : `<div>GP ${st.gp || 0} · ${st.g || 0}G ${st.a || 0}A ${st.p || 0}P · +/− ${st.plusMinus || 0}</div>
                 <div class="muted">Career ${cr.g || 0}G ${cr.a || 0}A ${cr.p || 0}P</div>`}
          </div>
          <div class="card" style="margin-top:10px">
            <h3>Development</h3>
            <svg class="spark" viewBox="0 0 240 70">${hist ? `<polyline fill="none" stroke="#4da3ff" stroke-width="2" points="${hist}" />` : ""}</svg>
            <div class="faint">Ceiling ${p.potential.ceiling} · Work ethic ${p.personality.workEthic}</div>
          </div>
          <div class="card" style="margin-top:10px">
            <h3>Market</h3>
            <div>Estimated AAV ${formatMoney(marketSalary(p))}</div>
            <div class="faint">Awards: ${p.awards.map((a) => a.name).join(", ") || "—"}</div>
          </div>
        </div>
      </div>
      <div style="margin-top:12px;text-align:right"><button class="btn" data-act="close-modal">Close</button></div>
    </div>
  </div>`;
}

/** Popup after a game showing the score and who scored. */
function recapModal(s, gameId) {
  const g = s.schedule.find((x) => x.id === gameId) || findPlayoffGame(s, gameId);
  if (!g?.result) return "";
  const r = g.result;
  const home = s.teams[g.home]; const away = s.teams[g.away];
  const events = [...(r.homeBox.events || []), ...(r.awayBox.events || [])];
  return `<div class="modal-bg" data-act="close-recap"><div class="modal" data-stop="1">
    <div class="kicker">${g.type}</div>
    <h1>${esc(away.abbr)} ${r.awayGoals} @ ${esc(home.abbr)} ${r.homeGoals}${r.ot ? " OT" : r.so ? " SO" : ""}</h1>
    <div class="muted">Shots ${r.shots.away}–${r.shots.home} · PP ${r.pp.away} / ${r.pp.home}</div>
    <div class="card" style="margin-top:12px">
      ${events.map((e) => `<div>${esc(s.players[e.scorer]?.name || "")} (${e.assists.map((id) => s.players[id]?.name).filter(Boolean).join(", ") || "unassisted"})</div>`).join("") || `<div class="muted">Box score filed.</div>`}
    </div>
    <div style="margin-top:12px;text-align:right"><button class="btn" data-act="close-recap">Close</button></div>
  </div></div>`;
}

/** Find a playoff game by id so the recap can show it. */
function findPlayoffGame(s, id) {
  if (!s.playoffs) return null;
  for (const round of Object.values(s.playoffs.rounds)) {
    for (const arr of Object.values(round)) {
      for (const sr of arr || []) {
        const g = sr.games?.find((x) => x.id === id);
        if (g) return g;
      }
    }
  }
  return null;
}

/** Listen for clicks and dropdown changes on the page. */
function bind() {
  app.onclick = (e) => {
    // Native dropdowns use change, not click. Re-drawing on click closes the menu.
    if (e.target.closest("select, option")) return;
    if (e.target.closest("[data-stop]") && !e.target.closest("button, select, [data-act]")) return;
    const el = e.target.closest("[data-act]");
    if (!el) return;
    if (el.dataset.act?.startsWith("close") && e.target.closest("[data-stop]") && e.target !== el) return;
    handle(el.dataset.act, el, e);
  };
  app.onchange = (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    handle(el.dataset.act, el, e);
  };
}

/** The big switchboard: each button name runs a different game action. */
function handle(act, el, e) {
  const s = G.getState();
  const id = el.dataset.id;
  const toast = (m) => { ui.toast = m; render(); };
  const actions = {
    new: () => { ui.screen = "setup"; render(); },
    "back-title": () => { ui.screen = "title"; render(); },
    "pick-team": () => { ui.setup.teamId = id; render(); },
    "set-diff": () => { ui.setup.difficulty = el.value; },
    "set-cap": () => { ui.setup.salaryCap = Number(el.value); },
    "set-goal": () => { ui.setup.ownerGoal = el.value; },
    start: () => {
      G.newGame(ui.setup);
      ui.screen = "home";
      ui.view = "home";
      render();
    },
    load: () => {
      const loaded = G.loadGame(el.dataset.slot);
      if (!loaded) { toast("That save is empty."); return; }
      ui.screen = "home";
      ui.view = "home";
      render();
    },
    "load-autosave": () => {
      const loaded = G.loadGame("autosave");
      if (!loaded) { toast("No saved franchise to continue."); return; }
      ui.screen = "home";
      ui.view = "home";
      render();
    },
    nav: () => { ui.view = el.dataset.view; location.hash = ui.view; render(); },
    save: () => {
      const res = G.saveGame("slot1");
      toast(res.ok ? "Franchise saved." : (res.error || "Save failed."));
    },
    title: () => {
      const res = G.saveGame("slot1");
      G.unloadGame();
      ui.screen = "title";
      ui.view = "home";
      ui.selectedPlayer = null;
      ui.recap = null;
      if (location.hash) location.hash = "";
      ui.toast = res.ok ? "Franchise saved. You can Continue later." : (res.error || "Could not save before exit.");
      render();
    },
    player: () => { ui.selectedPlayer = id; render(); },
    "close-modal": () => { if (e.target.dataset.stop) return; ui.selectedPlayer = null; render(); },
    "roster-tab": () => { ui.rosterTab = id; render(); },
    "tx-tab": () => { ui.txTab = id; ui.trade.picking = false; render(); },
    "league-tab": () => { ui.leagueTab = id; render(); },
    "auto-lines": () => { G.autoSetUserLines(); render(); },
    line: () => { G.setLineSlot(el.dataset.key, Number(el.dataset.i), el.value || null); render(); },
    "sim-game": () => {
      const log = s.phase === "playoffs" ? [G.simPlayoffGame()].filter(Boolean) : G.simNextGame();
      const g = log.reverse().find((x) => x && (x.home === s.userTeamId || x.away === s.userTeamId)) || log[0];
      ui.recap = g?.id || null;
      render();
    },
    "sim-week": () => { G.simWeek(); render(); },
    "sim-deadline": () => { G.simToDeadline(); toast("Deadline reached."); },
    "sim-season": () => { G.simRestOfSeason(); toast("Regular season complete."); },
    "sim-series": () => { G.simPlayoffSeries(); render(); },
    "sim-playoffs": () => { G.skipUserPlayoffs(); render(); },
    "offseason-next": () => { G.continueOffseason(); ui.view = G.getState().phase === "draft" ? "draft" : G.getState().phase === "freeAgency" ? "transactions" : ui.view; if (G.getState().phase === "freeAgency") ui.txTab = "fa"; render(); },
    "fa-day": () => { G.simFADay(); render(); },
    "fa-skip": () => { G.skipFreeAgency(); toast("Camp is open."); },
    "trade-open": () => { ui.trade.picking = !ui.trade.picking; render(); },
    "trade-team": () => {
      const next = id || el.value;
      if (!next) return;
      ui.trade.picking = false;
      if (next !== ui.trade.teamId) {
        ui.trade.teamId = next;
        ui.trade.get = [];
      }
      render();
    },
    "add-asset": () => {
      if (!el.value) return;
      ui.trade[el.dataset.side].push({ kind: el.dataset.kind, id: el.value });
      el.value = "";
      render();
    },
    "rm-asset": () => {
      ui.trade[el.dataset.side] = ui.trade[el.dataset.side].filter((a) => a.id !== id);
      render();
    },
    propose: () => {
      const ev = G.proposeTrade(ui.trade.teamId, ui.trade.give, ui.trade.get);
      if (ev.accept) {
        ui.trade.give = []; ui.trade.get = [];
        toast("Trade accepted.");
      } else if (ev.response === "COUNTER" && ev.counter) {
        if (confirm(`${ev.message}\nAccept their counter?`)) {
          G.acceptCounter(ui.trade.teamId, ev.counter);
          ui.trade.give = []; ui.trade.get = [];
          toast("Counter accepted.");
        } else toast("Counter declined.");
      } else toast(ev.message);
    },
    draft: () => { const r = G.userDraft(id); toast(r.ok ? `Selected ${r.player.name}` : r.error); },
    "draft-best": () => { G.simDraftPick(); render(); },
    "draft-sim": () => { G.simDraftPick(); render(); },
    "offer-fa": () => {
      const p = s.players[id];
      const d = G.playerDemand(s, p, s.userTeamId);
      const salary = Number(prompt(`AAV offer for ${p.name} (they want around ${formatMoney(d.salary)})`, d.salary));
      if (!salary) return;
      const years = Number(prompt("Years", d.years));
      const res = G.signPlayer(id, { salary, years, ntc: d.ntc, nmc: false, twoWay: d.twoWay });
      toast(res.message || (res.signed ? "Signed" : "No deal"));
    },
    extend: () => {
      const p = s.players[id];
      const d = G.playerDemand(s, p, s.userTeamId);
      const salary = Number(prompt(`Extension AAV for ${p.name}`, d.salary));
      if (!salary) return;
      const years = Number(prompt("Years", d.years));
      const res = G.signPlayer(id, { salary, years, ntc: d.ntc, nmc: d.nmc, twoWay: false });
      toast(res.message);
    },
    callup: () => { const r = G.callUp(id); toast(r.ok ? "Recalled." : r.error); },
    senddown: () => { const r = G.sendDown(id); toast(r.ok ? "Assigned to affiliate." : r.error); },
    waive: () => { G.waivePlayer(id); toast("Waivers processed."); },
    "scout-assign": () => { G.assignScout(s, id, el.value); },
    "scout-region": () => { G.assignScout(s, id, s.scouts[id].assignment, el.value); },
    recap: () => { ui.recap = id; render(); },
    "close-recap": () => { ui.recap = null; render(); },
  };
  if (actions[act]) actions[act]();
}

/** Team logo picture, or letters if the picture is missing. */
function crest(t, size = "") {
  if (t?.logo) {
    return `<span class="crest logo ${size}" title="${esc(t.abbr)}"><img alt="${esc(t.abbr)}" src="${esc(t.logo)}" referrerpolicy="no-referrer" /></span>`;
  }
  return `<span class="crest ${size}" style="background:${t.colors.primary};color:${t.colors.accent || "#fff"}">${t.abbr.slice(0, 3)}</span>`;
}

/** Player face photo. */
function mug(p, size = "") {
  if (!p?.headshot) return "";
  return `<img class="headshot ${size}" alt="${esc(p.name)}" src="${esc(p.headshot)}" referrerpolicy="no-referrer" />`;
}

/** Make names safe to put in HTML so a quote cannot break the page. */
function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Contending / rebuilding / balanced in plain English. */
function labelPhil(p) {
  return { contending: "Contender", rebuilding: "Rebuild", balanced: "Balanced" }[p] || p;
}

/** Sort order: centers, then wings, then defense, then goalies. */
function posOrder(p) {
  return { C: 0, LW: 1, RW: 2, LD: 3, RD: 4, G: 5 }[p] ?? 9;
}

/** Turn wristAcc into Wrist Acc for the player card. */
function labelKey(k) {
  return k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

/** Average overall of the NHL roster. */
function teamOvr(s, t) {
  const ps = t.roster.map((id) => s.players[id]).filter(Boolean);
  if (!ps.length) return 70;
  return Math.round(ps.reduce((a, p) => a + p.ratings.overall, 0) / ps.length);
}
