/**
 * The remote control for the whole game.
 * Buttons like "sim next game" and "start franchise" come through here.
 */
import { RNG, DIFFICULTY, clamp } from "./utils.js";
import { generateLeague, autoLines, getTeamPlayers } from "./generation.js";
import { generateSchedule, nextUserGame, upcomingUserGames, deadlineDay, calendarLabel } from "./schedule.js";
import { simulateGame, simulateDay } from "./simulation.js";
import { standingsList, playoffSeeds, leaders, userRank } from "./standings.js";
import { startPlayoffs, simulateSeriesGame, simulateSeries, advancePlayoffRound, userSeries, userStillAlive } from "./playoffs.js";
import { evaluateTrade, executeTrade, cpuDeadlineActivity, valueLabel, pickLabel, findPick } from "./trades.js";
import { capSpace, capWarnings, teamFinances, teamPayroll, rosterCounts } from "./finances.js";
import { playerDemand, evaluateOffer, applyContract, expireContracts } from "./contracts.js";
import { startDraft, currentDraftPick, availableProspects, draftPlayer, cpuDraftPick, autoSimDraftToUser } from "./draft.js";
import { startFreeAgency, faBoard, makeOfferToFA, simulateFADay } from "./freeAgency.js";
import { developRoster, resetSeasonStats, trainCamp } from "./development.js";
import { tickScouting, assignScout, reportFor } from "./scouting.js";
import { presentAwards, updateLegacy } from "./awards.js";
import { addNews, rumorFor } from "./news.js";
import { saveTo, loadFrom, autosave, listSaves } from "./saveSystem.js";
import { TEAM_TEMPLATES } from "./data/teams.js";
import { ARCHETYPES, POTENTIAL_LABEL, calcOverall } from "./players.js";

let state = null;

/** The live save sitting in memory right now. */
export function getState() {
  return state;
}

/** Rebuild the dice from the save so luck stays the same. */
export function rng() {
  return RNG.from(state.rng);
}

/** Remember where the dice left off. */
function persistRng(r) {
  state.rng = r.serialize();
}

/** Start a brand-new franchise with your team, difficulty, and cap. */
export function newGame(opts) {
  state = generateLeague({
    teamId: opts.teamId,
    difficulty: opts.difficulty || "normal",
    salaryCap: opts.salaryCap || 88e6,
    ownerGoal: opts.ownerGoal || "playoffs",
    simRealism: opts.simRealism || "normal",
    season: 2026,
    seed: opts.seed,
  });
  const capBonus = DIFFICULTY[state.settings.difficulty].capBonus || 0;
  if (!state.settings.salaryCap) state.settings.salaryCap = 999e6;
  else state.settings.salaryCap += capBonus;
  const r = rng();
  generateSchedule(state, r);
  persistRng(r);
  addNews(state, "league", `Welcome to the ${state.teams[state.userTeamId].displayName}`, "Training camp is open. The Stanley Cup is the only trophy that matters.");
  autosave(state);
  return state;
}

/** Write the game into a save slot. */
export function saveGame(slot = "slot1") {
  if (!state) return { ok: false, error: "No franchise is loaded." };
  try {
    saveTo(slot, state);
    return { ok: true };
  } catch (err) {
    console.warn("Save failed", err);
    const quota = err?.name === "QuotaExceededError" || /quota/i.test(String(err));
    return { ok: false, error: quota ? "Save is too large for this browser." : "Could not save the franchise." };
  }
}

/** Open a saved franchise. */
export function loadGame(slot = "autosave") {
  const loaded = loadFrom(slot);
  if (!loaded) return null;
  state = loaded;
  return state;
}

/** Leave the franchise so the title screen can show. */
export function unloadGame() {
  state = null;
}

/** True if a franchise is already loaded. */
export function hasGame() {
  return !!state;
}

function assertRegular() {
  return state && (state.phase === "regular" || state.phase === "preseason" || state.phase === "deadline");
}

/** Play until your next game is done (and every other game on those days). */
export function simNextGame() {
  if (state.phase === "playoffs") return simPlayoffGame();
  const r = rng();
  if (state.phase === "preseason") {
    const userPre = state.schedule.find(
      (g) => !g.played && g.type === "preseason" && (g.home === state.userTeamId || g.away === state.userTeamId)
    );
    if (!userPre) {
      for (const g of state.schedule.filter((g) => !g.played && g.type === "preseason")) simulateGame(state, g, r);
      state.phase = "regular";
      addNews(state, "league", "Regular season begins", "82 games. Every point matters.");
    }
  }
  const userG = nextUserGame(state);
  const targetDay = userG ? userG.day : state.day + 1;
  const log = [];
  while (state.day <= targetDay) {
    const todays = state.schedule.filter((g) => g.day === state.day && !g.played && gameMatchesPhase(g));
    if (!todays.length && state.day > targetDay) break;
    for (const g of todays) {
      if (g.played) continue;
      simulateGame(state, g, r);
      log.push(g);
    }
    tickDay(r, 1);
    if (userG && userG.played) break;
    if (state.day > 200) break;
  }
  persistRng(r);
  afterSim(log);
  return log;
}

/** Only play the kind of games that belong in this part of the year. */
function gameMatchesPhase(g) {
  if (state.phase === "preseason") return g.type === "preseason";
  return g.type !== "preseason";
}

/** Fast-forward this many days of games. */
export function simDays(n) {
  if (state.phase === "playoffs") {
    const log = [];
    for (let i = 0; i < n; i++) {
      const g = simPlayoffGame();
      if (g) log.push(g);
      else break;
    }
    return log;
  }
  const r = rng();
  if (state.phase === "preseason") {
    const userPreLeft = state.schedule.some(
      (g) => !g.played && g.type === "preseason" && (g.home === state.userTeamId || g.away === state.userTeamId)
    );
    if (!userPreLeft) {
      for (const g of state.schedule.filter((g) => !g.played && g.type === "preseason")) simulateGame(state, g, r);
      state.phase = "regular";
      addNews(state, "league", "Regular season begins", "82 games. Every point matters.");
    }
  }
  const log = [];
  const end = state.day + n;
  while (state.day < end) {
    const todays = state.schedule.filter((g) => g.day === state.day && !g.played && gameMatchesPhase(g));
    for (const g of todays) {
      simulateGame(state, g, r);
      log.push(g);
    }
    tickDay(r, 1);
    if (checkPhaseGates()) break;
  }
  persistRng(r);
  afterSim(log);
  return log;
}

/** Jump ahead one week. */
export function simWeek() {
  return simDays(7);
}

/** Jump to the trade deadline. */
export function simToDeadline() {
  const log = [];
  while (state.day < deadlineDay() && state.phase !== "playoffs") {
    const batch = simDays(3);
    log.push(...batch);
    if (!batch.length && state.day >= deadlineDay()) break;
    if (state.day > 190) break;
  }
  return log;
}

/** Play the rest of the regular season. */
export function simRestOfSeason() {
  const log = [];
  while (state.phase === "regular" || state.phase === "preseason" || state.phase === "deadline") {
    const batch = simDays(5);
    log.push(...batch);
    if (!batch.length) {
      const left = state.schedule.filter((g) => !g.played && g.type === "regular");
      if (!left.length) {
        finishRegularSeason();
        break;
      }
      if (state.day > 220) break;
    }
  }
  return log;
}

/** Move the calendar one day: scouting, deadline, maybe the season ends. */
function tickDay(r, days) {
  state.day += days;
  tickScouting(state, days, r);
  if (state.day === deadlineDay() && state.phase === "regular") {
    state.phase = "deadline";
    addNews(state, "league", "Trade deadline arrives", "Buyers and sellers have a few hours left.");
    rumorFor(state, r);
    cpuDeadlineActivity(state, r);
  }
  const left = state.schedule.filter((g) => !g.played && g.type === "regular");
  if ((state.phase === "regular" || state.phase === "deadline") && left.length === 0) {
    finishRegularSeason();
  }
  if (state.phase === "preseason") {
    const preLeft = state.schedule.filter((g) => !g.played && g.type === "preseason");
    if (!preLeft.length) {
      state.phase = "regular";
      addNews(state, "league", "Regular season begins", "82 games. Every point matters.");
    }
  }
  updateOwnerMidseason();
  updatePhilosophies();
}

/** Stop simming if we already hit playoffs, awards, or the draft. */
function checkPhaseGates() {
  return state.phase === "playoffs" || state.phase === "awards" || state.phase === "draft";
}

/** After a sim: streak news, injury news, then autosave. */
function afterSim(log) {
  const userGames = log.filter((g) => g.home === state.userTeamId || g.away === state.userTeamId);
  for (const g of userGames) {
    const t = state.teams[state.userTeamId];
    if (t.streak.count >= 5) {
      addNews(state, "streak", `${t.abbr} ${t.streak.type === "W" ? "winning" : "losing"} streak hits ${t.streak.count}`, "");
    }
  }
  for (const id of state.teams[state.userTeamId].roster) {
    const p = state.players[id];
    if (p?.injury && p.injury.days >= 6 && p.injury.start === state.day - 1) {
      addNews(state, "injury", `${p.name} placed on IR`, `${p.injury.type} — roughly ${p.injury.days} days.`);
    }
  }
  autosave(state);
}

/** Regular season is over. Seed the playoffs. */
function finishRegularSeason() {
  if (state.phase === "playoffs" || state.phase === "awards" || state.phase === "draft" || state.phase === "freeAgency") return;
  const seeds = playoffSeeds(state);
  const inPlayoffs = [...seeds.Eastern, ...seeds.Western].some((s) => s.team.id === state.userTeamId);
  startPlayoffs(state);
  if (!inPlayoffs) {
    addNews(state, "season", "Season over — out of the playoffs", "Ownership will be watching the offseason closely.");
    state.owner.confidence -= 12 * (DIFFICULTY[state.settings.difficulty].ownerPatience ? 1 / DIFFICULTY[state.settings.difficulty].ownerPatience : 1);
  }
  autosave(state);
}

/** Play your next playoff game, or sim everyone else's if you are out. */
export function simPlayoffGame() {
  const r = rng();
  const series = userSeries(state);
  if (series) {
    const g = simulateSeriesGame(state, series, r);
    persistRng(r);
    if (series.winner) maybeAdvancePlayoffs(r);
    autosave(state);
    return g;
  }
  simulateAllOpenSeries(r);
  maybeAdvancePlayoffs(r);
  persistRng(r);
  autosave(state);
  return null;
}

/** Finish your current series (or every series if you are watching). */
export function simPlayoffSeries() {
  const r = rng();
  const series = userSeries(state);
  if (series) simulateSeries(state, series, r);
  else simulateAllOpenSeries(r);
  maybeAdvancePlayoffs(r);
  persistRng(r);
  autosave(state);
}

/** Play out every series that is still going this round. */
function simulateAllOpenSeries(r) {
  const po = state.playoffs;
  const round = po.round;
  if (round === "done") return;
  const buckets = round === "SCF" ? [po.rounds.SCF.league || []] : [po.rounds[round].Eastern, po.rounds[round].Western];
  for (const arr of buckets) {
    for (const s of arr || []) if (!s.winner) simulateSeries(state, s, r);
  }
}

/** If every series has a winner, move to the next round. */
function maybeAdvancePlayoffs(r) {
  const po = state.playoffs;
  if (!po || po.round === "done") return;
  const round = po.round;
  const list =
    round === "SCF"
      ? po.rounds.SCF.league || []
      : [...(po.rounds[round].Eastern || []), ...(po.rounds[round].Western || [])];
  if (list.length && list.every((s) => s.winner)) {
    advancePlayoffRound(state, r);
    if (po.round === "done") beginOffseason();
  }
}

/** Sim the rest of the playoffs without clicking game by game. */
export function skipUserPlayoffs() {
  const r = rng();
  while (state.phase === "playoffs") {
    simulateAllOpenSeries(r);
    maybeAdvancePlayoffs(r);
    if (state.playoffs.round === "done") break;
  }
  persistRng(r);
}

/** Cup is awarded. Next stop: trophies, then the draft. */
function beginOffseason() {
  state.phase = "awards";
  const winners = presentAwards(state);
  const champ = state.playoffs?.champion;
  const made = userStillAlive(state) || champ === state.userTeamId || state.history.userSeasons.some(() => false);
  const seeds = state.playoffs?.seeds;
  const inP = seeds && [...(seeds.Eastern || []), ...(seeds.Western || [])].some((s) => s.team.id === state.userTeamId);
  updateLegacy(state, inP, champ);
  updateOwnerEnd(inP, champ === state.userTeamId);
  addNews(state, "offseason", "Awards night", "The league's best are honored. The draft lottery is next.");
  autosave(state);
  return winners;
}

/** Step through awards → draft → free agency. */
export function continueOffseason() {
  const r = rng();
  if (state.phase === "awards") {
    expireContracts(state, r, []);
    state.phase = "draft";
    startDraft(state, r);
    persistRng(r);
    autosave(state);
    return "draft";
  }
  if (state.phase === "draft" && state.draft?.complete) {
    startFreeAgency(state);
    persistRng(r);
    autosave(state);
    return "freeAgency";
  }
  if (state.phase === "freeAgency") {
    return "freeAgency";
  }
  return state.phase;
}

/** One day of free-agent signings around the league. */
export function simFADay() {
  const r = rng();
  simulateFADay(state, r);
  state.faDay = (state.faDay || 1) + 1;
  state.day += 1;
  persistRng(r);
  if (state.faDay > 10) finishFreeAgency();
  autosave(state);
}

/** Skip to the end of free agency. */
export function skipFreeAgency() {
  while (state.phase === "freeAgency") simFADay();
}

/** Players grow, camp opens, and a new season calendar is built. */
function finishFreeAgency() {
  const r = rng();
  developRoster(state, r);
  trainCamp(state, r);
  resetSeasonStats(state);
  state.season += 1;
  state.day = 0;
  state.phase = "preseason";
  state.playoffs = null;
  state.draft = null;
  state.faOffers = {};
  generateSchedule(state, r);
  for (const t of Object.values(state.teams)) autoLines(state, t.id);
  addNews(state, "season", `${state.season} season is underway`, "New camp. New hopes. Same trophy.");
  persistRng(r);
  autosave(state);
}

/** You pick a kid. Computer teams pick until it is your turn again. */
export function userDraft(playerId) {
  const r = rng();
  const res = draftPlayer(state, playerId);
  if (!res.ok) return res;
  autoSimDraftToUser(state, r);
  persistRng(r);
  if (state.draft.complete) addNews(state, "draft", "Draft complete", "Every name is off the board.");
  autosave(state);
  return res;
}

/** Auto-pick the best leftover kid (or let a computer team pick). */
export function simDraftPick() {
  const r = rng();
  const slot = currentDraftPick(state);
  if (!slot) return null;
  if (slot.teamId === state.userTeamId) {
    const avail = availableProspects(state);
    const pick = avail.sort((a, b) => (b.potential.ceiling + b.ratings.overall) - (a.potential.ceiling + a.ratings.overall))[0];
    const res = draftPlayer(state, pick.id);
    autoSimDraftToUser(state, r);
    persistRng(r);
    autosave(state);
    return res;
  }
  cpuDraftPick(state, r);
  autoSimDraftToUser(state, r);
  persistRng(r);
  autosave(state);
}

/** Peek at whether the other GM would like this trade. */
export function previewTrade(toId, give, get, retainPct = 0) {
  return evaluateTrade(state, state.userTeamId, toId, give, get, retainPct);
}

/** Send the trade. If they say yes, it happens. */
export function proposeTrade(toId, give, get, retainPct = 0) {
  const ev = evaluateTrade(state, state.userTeamId, toId, give, get, retainPct);
  if (ev.accept) {
    executeTrade(state, state.userTeamId, toId, give, get, retainPct);
    autosave(state);
  }
  return ev;
}

/** Take their counter-offer. */
export function acceptCounter(toId, counter, retainPct = 0) {
  executeTrade(state, state.userTeamId, toId, counter.give, counter.get, retainPct);
  autosave(state);
  return true;
}

/** Offer a contract to a free agent or to someone already on your team. */
export function signPlayer(playerId, offer) {
  const p = state.players[playerId];
  if (p.status === "fa") return makeOfferToFA(state, playerId, offer);
  const ev = evaluateOffer(state, p, state.userTeamId, offer);
  if (ev.accept) {
    applyContract(state, p, state.userTeamId, offer);
    addNews(state, "contract", `${p.name} signs extension`, `${offer.years} years.`);
    autosave(state);
    return { ok: true, signed: true, message: "Deal done." };
  }
  return { ok: true, signed: false, message: ev.message, demand: ev.demand };
}

/** Drop a player into a line slot, or set the starter/backup. */
export function setLineSlot(lineKey, index, playerId) {
  const team = state.teams[state.userTeamId];
  if (lineKey === "starter" || lineKey === "backup") {
    team.lines[lineKey] = playerId;
  } else if (Array.isArray(team.lines[lineKey])) {
    team.lines[lineKey][index] = playerId;
  }
  rebuildScratches(team);
}

/** Anyone not in the lineup sits in the press box (scratches). */
function rebuildScratches(team) {
  const used = new Set();
  for (const [k, v] of Object.entries(team.lines)) {
    if (k === "scratches" || k.startsWith("pp") || k.startsWith("pk")) continue;
    if (Array.isArray(v)) v.forEach((id) => id && used.add(id));
    else if (v) used.add(v);
  }
  team.lines.scratches = team.roster.filter((id) => !used.has(id));
}

/** Let the computer set your lines by overall. */
export function autoSetUserLines() {
  autoLines(state, state.userTeamId);
}

/** Bring a kid up from the minors. NHL roster max is 23. */
export function callUp(playerId) {
  const team = state.teams[state.userTeamId];
  const p = state.players[playerId];
  if (team.roster.length >= 23) return { ok: false, error: "NHL roster is full (23)." };
  team.minors = team.minors.filter((id) => id !== playerId);
  team.prospects = team.prospects.filter((id) => id !== playerId);
  team.roster.push(playerId);
  p.status = "nhl";
  p.teamId = team.id;
  autoLines(state, team.id);
  addNews(state, "roster", `${p.name} recalled`, "The kid gets his shot.");
  autosave(state);
  return { ok: true };
}

/** Send a player to the farm team. Stars on one-way deals cannot just go down. */
export function sendDown(playerId) {
  const team = state.teams[state.userTeamId];
  const p = state.players[playerId];
  if (p.contract && !p.contract.twoWay && p.ratings.overall >= 78) {
    return { ok: false, error: "Would require waivers — other clubs would likely claim." };
  }
  team.roster = team.roster.filter((id) => id !== playerId);
  if (!team.minors.includes(playerId)) team.minors.push(playerId);
  p.status = "minors";
  p.morale = clamp((p.morale || 70) - 8, 20, 99);
  autoLines(state, team.id);
  autosave(state);
  return { ok: true };
}

/** Put a player on waivers. Another team might steal him. */
export function waivePlayer(playerId) {
  const p = state.players[playerId];
  const team = state.teams[state.userTeamId];
  const r = rng();
  const claimers = Object.values(state.teams).filter((t) => {
    if (t.id === team.id) return false;
    if (capSpace(state, t.id) < (p.contract?.salary || 0)) return false;
    return p.ratings.overall >= 74 && t.philosophy !== "rebuilding" ? r.chance(0.25) : r.chance(0.08);
  });
  team.roster = team.roster.filter((id) => id !== playerId);
  if (claimers.length) {
    const c = r.pick(claimers);
    p.teamId = c.id;
    p.status = "nhl";
    c.roster.push(p.id);
    autoLines(state, c.id);
    addNews(state, "waivers", `${p.name} claimed off waivers by ${c.abbr}`, "");
  } else {
    p.status = "minors";
    team.minors.push(p.id);
    addNews(state, "waivers", `${p.name} clears waivers`, "Assigned to the affiliate.");
  }
  autoLines(state, team.id);
  persistRng(r);
  autosave(state);
  return { ok: true };
}

/** Bad records start selling. Hot teams start buying. */
function updatePhilosophies() {
  if ((state.teams[state.userTeamId].record.gp || 0) < 20) return;
  for (const t of Object.values(state.teams)) {
    const pct = t.record.gp ? (t.record.w * 2 + t.record.ot) / (t.record.gp * 2) : 0.5;
    if (pct < 0.4) t.philosophy = "rebuilding";
    else if (pct > 0.58) t.philosophy = "contending";
    else if (t.ownerExpectations === "cup") t.philosophy = "contending";
  }
}

/** The owner gets happier with wins and madder with losing streaks. */
function updateOwnerMidseason() {
  const t = state.teams[state.userTeamId];
  if (t.record.gp < 10) return;
  const pct = (t.record.w * 2 + t.record.ot) / (t.record.gp * 2);
  const goal = state.settings.ownerGoal;
  let delta = (pct - 0.5) * 8;
  if (t.streak?.type === "L" && t.streak.count >= 5) delta -= 3;
  if (t.streak?.type === "W" && t.streak.count >= 5) delta += 2;
  const patience = DIFFICULTY[state.settings.difficulty].ownerPatience;
  state.owner.confidence = clamp(state.owner.confidence + delta * 0.15 * patience, 5, 99);
  if (state.owner.confidence < 18 && t.record.gp > 40) {
    state.owner.fired = true;
    addNews(state, "owner", "You have been fired", "Ownership has decided to go in a different direction.");
  }
}

/** After the season, missed playoffs can get you fired. */
function updateOwnerEnd(madePlayoffs, wonCup) {
  const patience = DIFFICULTY[state.settings.difficulty].ownerPatience;
  if (wonCup) state.owner.confidence = clamp(state.owner.confidence + 28, 0, 99);
  else if (madePlayoffs) state.owner.confidence = clamp(state.owner.confidence + 8 * patience, 0, 99);
  else state.owner.confidence = clamp(state.owner.confidence - 16 / patience, 0, 99);
  if (state.owner.confidence < 22) {
    state.owner.fired = true;
    addNews(state, "owner", "You have been fired", "A missed season was the last straw.");
  }
}

/** Shortcut to the team you are managing. */
export function userTeam() {
  return state.teams[state.userTeamId];
}

export {
  standingsList, leaders, userRank, capSpace, capWarnings, teamFinances, teamPayroll, rosterCounts,
  upcomingUserGames, nextUserGame, calendarLabel, valueLabel, pickLabel, findPick, playerDemand,
  availableProspects, currentDraftPick, faBoard, reportFor, assignScout, getTeamPlayers, playoffSeeds,
  userSeries, userStillAlive, listSaves, TEAM_TEMPLATES, ARCHETYPES, POTENTIAL_LABEL, calcOverall,
  deadlineDay,
};
