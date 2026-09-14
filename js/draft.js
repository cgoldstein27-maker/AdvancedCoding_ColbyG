import { createPlayer } from "./generation.js";
import { scoutedView } from "./generation.js";
import { POTENTIAL_CEILING, pickArchetype } from "./players.js";
import { clamp, uid, posGroup, ordinal } from "./utils.js";
import { addNews } from "./news.js";
import { autoLines } from "./generation.js";

export function generateDraftClass(state, rng) {
  const prospects = [];
  const positions = [];
  for (let i = 0; i < 224; i++) {
    positions.push(rng.weighted(
      ["C", "LW", "RW", "LD", "RD", "G"],
      (p) => ({ C: 3, LW: 2.4, RW: 2.4, LD: 2.2, RD: 2.2, G: 1.2 }[p])
    ));
  }
  positions.forEach((position, i) => {
    const elite = i < 8;
    const first = i < 32;
    const second = i < 64;
    let overall;
    if (elite) overall = rng.int(62, 72);
    else if (first) overall = rng.int(54, 66);
    else if (second) overall = rng.int(50, 60);
    else overall = rng.int(46, 56);
    const p = createPlayer(state, rng, {
      position,
      age: rng.chance(0.12) ? 19 : 18,
      overall,
      teamId: null,
      status: "draft",
      youthBoost: elite ? 0.6 : first ? 0.4 : 0.15,
      yearsLeft: 3,
    });
    p.contract = { salary: 0, years: 0, yearsLeft: 0, type: "unsigned", ntc: false, nmc: false, signingBonus: 0, bonuses: 0, twoWay: true };
    p.draftRank = i + 1;
    p.strengths = describeStrengths(p);
    p.weaknesses = describeWeaknesses(p);
    p.scout.knowledge = rng.int(18, 48);
    p.scout.bias = rng.int(-3, 3);
    prospects.push(p);
    state.players[p.id] = p;
  });
  return prospects;
}

function describeStrengths(p) {
  const r = p.ratings;
  const entries = Object.entries(r).filter(([k]) => k !== "overall").sort((a, b) => b[1] - a[1]);
  return entries.slice(0, 3).map(([k]) => labelAttr(k));
}

function describeWeaknesses(p) {
  const r = p.ratings;
  const entries = Object.entries(r).filter(([k]) => k !== "overall").sort((a, b) => a[1] - b[1]);
  return entries.slice(0, 2).map(([k]) => labelAttr(k));
}

function labelAttr(k) {
  return k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

export function runLottery(state, rng) {
  const standings = Object.values(state.teams)
    .map((t) => ({ id: t.id, pts: t.record.w * 2 + t.record.ot, gp: t.record.gp, wins: t.record.w }))
    .sort((a, b) => a.pts - b.pts || a.wins - b.wins);
  const nonPlayoff = standings.slice(0, 16);
  const balls = [18.5, 13.5, 11.5, 9.5, 8.5, 7.5, 6.5, 6.0, 5.0, 3.5, 3.0, 2.5, 2.0, 1.5, 1.0, 0.5];
  const weighted = nonPlayoff.map((t, i) => ({ ...t, w: balls[i] || 0.5 }));
  const order = [];
  const pool = weighted.slice();
  for (let slot = 0; slot < 3; slot++) {
    const pick = rng.weighted(pool, (t) => t.w);
    order.push(pick.id);
    pool.splice(pool.findIndex((t) => t.id === pick.id), 1);
  }
  order.push(...pool.sort((a, b) => a.pts - b.pts).map((t) => t.id));
  const playoffTeams = standings.slice(16).sort((a, b) => a.pts - b.pts).map((t) => t.id);
  return [...order, ...playoffTeams];
}

export function startDraft(state, rng) {
  const lottery = runLottery(state, rng);
  const prospects = generateDraftClass(state, rng);
  const picks = [];
  for (let round = 1; round <= 7; round++) {
    const roundOwners = lottery.map((teamId) => {
      const team = state.teams[teamId];
      const owned = team.picks.find((p) => p.year === state.season && p.round === round);
      return owned || { id: uid("pk"), year: state.season, round, original: teamId, owner: teamId };
    });
    roundOwners.forEach((pick, idx) => {
      picks.push({
        overall: (round - 1) * 32 + idx + 1,
        round,
        slot: idx + 1,
        pick,
        teamId: pick.owner,
        playerId: null,
      });
    });
  }
  state.draft = {
    year: state.season,
    order: lottery,
    prospects: prospects.map((p) => p.id),
    picks,
    cursor: 0,
    complete: false,
  };
  state.phase = "draft";
  addNews(state, "draft", `${state.season} Draft Lottery`, `${state.teams[lottery[0]].displayName} win the first overall pick.`);
  return state.draft;
}

export function currentDraftPick(state) {
  if (!state.draft || state.draft.complete) return null;
  return state.draft.picks[state.draft.cursor];
}

export function availableProspects(state) {
  return state.draft.prospects.map((id) => state.players[id]).filter((p) => p && p.status === "draft");
}

export function draftPlayer(state, playerId) {
  const slot = currentDraftPick(state);
  if (!slot) return { ok: false, error: "Draft is over." };
  const p = state.players[playerId];
  if (!p || p.status !== "draft") return { ok: false, error: "Player is not available." };
  const team = state.teams[slot.teamId];
  p.status = "prospect";
  p.teamId = team.id;
  p.draftInfo = { year: state.season, round: slot.round, pick: slot.overall };
  p.contract = {
    salary: 925000,
    years: 3,
    yearsLeft: 3,
    type: "elc",
    ntc: false,
    nmc: false,
    signingBonus: 92500,
    bonuses: 350000,
    twoWay: true,
    expiry: "rfa",
  };
  team.prospects.push(p.id);
  team.picks = team.picks.filter((pk) => pk.id !== slot.pick.id);
  slot.playerId = p.id;
  if (slot.teamId === state.userTeamId) {
    addNews(state, "draft", `${team.abbr} select ${p.name}`, `${ordinal(slot.overall)} overall — ${p.position}, ${p.potential.category} potential.`);
    if (slot.round === 1 && p.potential.category === "franchise") state.legacy.draftHits++;
  }
  state.draft.cursor++;
  if (state.draft.cursor >= state.draft.picks.length) {
    state.draft.complete = true;
  }
  return { ok: true, player: p, slot };
}

export function cpuDraftPick(state, rng) {
  const slot = currentDraftPick(state);
  if (!slot || slot.teamId === state.userTeamId) return null;
  const team = state.teams[slot.teamId];
  const avail = availableProspects(state);
  const best = avail
    .map((p) => {
      const sc = scoutedView(p, team.id);
      const need = posNeed(state, team.id, p.position);
      const hidden = p.ratings.overall + (p.potential.ceiling - p.ratings.overall) * 0.45;
      const known = (sc.overallRange[0] + sc.overallRange[1]) / 2 + need * 4;
      const score = known * 0.65 + hidden * 0.35 * (0.5 + (p.scout.knowledge || 30) / 200);
      return { p, score };
    })
    .sort((a, b) => b.score - a.score);
  const pickFrom = best.slice(0, slot.round === 1 ? 4 : 10);
  const chosen = rng.pick(pickFrom).p;
  return draftPlayer(state, chosen.id);
}

function posNeed(state, teamId, position) {
  const t = state.teams[teamId];
  const all = [...t.roster, ...t.minors, ...t.prospects].map((id) => state.players[id]).filter(Boolean);
  const n = all.filter((p) => posGroup(p.position) === posGroup(position)).length;
  if (posGroup(position) === "G" && n < 4) return 3;
  if (n < 8) return 2;
  return 0;
}

export function autoSimDraftToUser(state, rng) {
  const results = [];
  while (!state.draft.complete) {
    const slot = currentDraftPick(state);
    if (!slot) break;
    if (slot.teamId === state.userTeamId) break;
    const r = cpuDraftPick(state, rng);
    if (r) results.push(r);
    else break;
  }
  return results;
}
