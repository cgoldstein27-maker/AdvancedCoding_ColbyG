import { TEAM_TEMPLATES, fullName } from "./data/teams.js";
import { pickName, pickNationality, resetNamePool, COACH_FIRST, COACH_LAST } from "./data/names.js";
import {
  ARCHETYPES, POTENTIAL_CEILING, pickArchetype, scaleToOverall, calcOverall,
  emptySeasonStats, marketSalary, expectedRole,
} from "./players.js";
import { RNG, clamp, uid, posGroup } from "./utils.js";

function nextId(state, prefix) {
  state.nextId = (state.nextId || 1000) + 1;
  return `${prefix}_${state.nextId}`;
}

function makeRatings(rng, position, archetype, target) {
  const isG = position === "G";
  const keys = isG
    ? ["positioning", "reflexes", "rebound", "glove", "blocker", "pokeCheck", "athleticism", "consistency"]
    : ["skating", "acceleration", "speed", "agility", "balance", "strength", "puckControl", "passing", "offAwareness", "defAwareness", "handEye", "wristPower", "wristAcc", "slapPower", "slapAcc", "physicality", "checking", "stickChecking", "faceoffs", "discipline"];
  const weights = ARCHETYPES[archetype]?.weights || {};
  const ratings = { overall: target };
  for (const k of keys) {
    const w = weights[k] || 1;
    const base = rng.clampNormal(target, 7, 38, 99);
    ratings[k] = clamp(Math.round(base * (0.55 + 0.45 * w) + rng.int(-4, 4)), 38, 99);
  }
  if (position !== "C") ratings.faceoffs = clamp((ratings.faceoffs || 50) - 18, 30, 85);
  const player = { position, ratings };
  scaleToOverall(player, target);
  return player.ratings;
}

function pickPotential(rng, position, age, overall, youthBoost = 0) {
  const g = posGroup(position);
  let category;
  const roll = rng.next() + youthBoost * 0.15;
  if (g === "G") {
    if (overall >= 90 || (age <= 24 && roll > 0.92)) category = "franchise";
    else if (overall >= 82 || (age <= 24 && roll > 0.7)) category = "starter";
    else category = "backup";
  } else if (g === "D") {
    if (overall >= 90 || (age <= 22 && roll > 0.93)) category = "franchise";
    else if (overall >= 86 || (age <= 22 && roll > 0.8)) category = "elite";
    else if (overall >= 80 || (age <= 23 && roll > 0.55)) category = "top4";
    else category = "bottomPair";
  } else {
    if (overall >= 91 || (age <= 22 && roll > 0.94)) category = "franchise";
    else if (overall >= 87 || (age <= 22 && roll > 0.82)) category = "elite";
    else if (overall >= 83 || (age <= 23 && roll > 0.62)) category = "topLine";
    else if (overall >= 79 || (age <= 23 && roll > 0.42)) category = "top6";
    else if (overall >= 74) category = "middle6";
    else category = "bottom6";
  }
  const [lo, hi] = POTENTIAL_CEILING[category];
  let ceiling = rng.int(lo, hi);
  if (age >= 27) ceiling = Math.max(overall, Math.min(ceiling, overall + rng.int(0, 3)));
  if (age >= 30) ceiling = Math.max(overall, overall + rng.int(-1, 1));
  const floor = clamp(overall - rng.int(2, 8), 48, ceiling - 1);
  const probability = clamp(0.35 + youthBoost * 0.15 + rng.float(-0.12, 0.12) + (overall > 80 ? 0.1 : 0), 0.15, 0.9);
  return { category, ceiling, floor, probability, curve: rng.pick(["early", "normal", "late"]) };
}

function makeContract(rng, player, yearsLeft) {
  const elc = player.age <= 22 && player.ratings.overall < 82;
  const salary = elc ? rng.pick([775000, 825000, 875000, 925000, 950000]) : marketSalary(player) * rng.float(0.88, 1.12);
  const years = yearsLeft ?? (elc ? rng.int(1, 3) : rng.int(1, player.age >= 32 ? 3 : 6));
  const nmc = player.age >= 32 && salary > 6e6 && rng.chance(0.55);
  const ntc = nmc || (player.age >= 30 && salary > 5e6 && rng.chance(0.4));
  return {
    salary: Math.round(salary / 25000) * 25000,
    years,
    yearsLeft: years,
    type: elc ? "elc" : salary > 7e6 ? "star" : "standard",
    ntc,
    nmc,
    signingBonus: Math.round(salary * (elc ? 0.1 : rng.float(0.05, 0.18)) / 25000) * 25000,
    bonuses: elc ? Math.round(salary * 0.35) : 0,
    twoWay: elc || player.ratings.overall < 72,
    expiry: "ufa",
  };
}

function personality(rng) {
  return {
    workEthic: rng.clampNormal(70, 14, 30, 99),
    loyalty: rng.clampNormal(62, 16, 25, 99),
    temperament: rng.clampNormal(65, 15, 25, 99),
    competitiveness: rng.clampNormal(72, 12, 35, 99),
    greed: rng.clampNormal(50, 18, 15, 95),
    leadership: rng.clampNormal(55, 18, 20, 99),
  };
}

export function createPlayer(state, rng, opts) {
  const nationality = opts.nationality || pickNationality(rng);
  const names = pickName(rng, nationality);
  const position = opts.position;
  const archetype = opts.archetype || pickArchetype(position, rng);
  const age = opts.age ?? rng.int(18, 36);
  const target = clamp(Math.round(opts.overall ?? rng.clampNormal(74, 8, 58, 94)), 50, 99);
  const ratings = makeRatings(rng, position, archetype, target);
  const potential = opts.potential || pickPotential(rng, position, age, ratings.overall, opts.youthBoost || 0);
  const player = {
    id: nextId(state, "p"),
    ...names,
    age,
    born: state.season - age,
    position,
    shoots: rng.chance(0.65) ? "L" : "R",
    catches: rng.chance(0.6) ? "L" : "R",
    height: position === "G" ? rng.int(73, 78) : rng.int(69, 78),
    weight: position === "G" ? rng.int(185, 220) : rng.int(175, 235),
    nationality,
    jersey: 0,
    teamId: opts.teamId || null,
    status: opts.status || "nhl",
    archetype,
    ratings,
    potential,
    personality: personality(rng),
    contract: opts.contract || makeContract(rng, { age, ratings, potential, position }, opts.yearsLeft),
    morale: rng.int(62, 86),
    injury: null,
    injuryHistory: [],
    fitness: rng.int(78, 96),
    awards: [],
    ovrHistory: [{ season: state.season, ovr: ratings.overall }],
    stats: {
      season: emptySeasonStats(position === "G"),
      playoffs: emptySeasonStats(position === "G"),
      career: emptySeasonStats(position === "G"),
      careerPlayoffs: emptySeasonStats(position === "G"),
      bySeason: {},
    },
    scout: {},
    draftInfo: opts.draftInfo || null,
    yearsPro: Math.max(0, age - 18 - (opts.prospect ? 2 : 0)),
    tradeRequest: false,
    captain: null,
  };
  player.ratings.overall = calcOverall(player);
  return player;
}

function assignJerseys(rng, players) {
  const used = new Set([99, 66, 69]);
  for (const p of players) {
    let n;
    let tries = 0;
    do {
      n = p.position === "G" ? rng.pick([1, 30, 31, 32, 33, 35, 40, 41, 50, 70, 74, 80]) : rng.int(2, 98);
      tries++;
    } while (used.has(n) && tries < 40);
    used.add(n);
    p.jersey = n;
  }
}

function makeCoach(rng, team) {
  const sys = rng.pick(["speed", "cycle", "trap", "forecheck", "balanced", "offensive"]);
  const quality = team.nhlQuality;
  const base = 55 + quality * 30;
  return {
    id: uid("c"),
    name: `${rng.pick(COACH_FIRST)} ${rng.pick(COACH_LAST)}`,
    offense: clamp(Math.round(rng.normal(base, 8)), 45, 96),
    defense: clamp(Math.round(rng.normal(base, 8)), 45, 96),
    development: clamp(Math.round(rng.normal(62 + team.youth * 20, 10)), 40, 95),
    specialTeams: clamp(Math.round(rng.normal(base, 9)), 42, 94),
    goaltending: clamp(Math.round(rng.normal(base - 2, 9)), 42, 94),
    system: sys,
    yearsLeft: rng.int(1, 4),
  };
}

function makeScouts(rng, teamId) {
  const regions = ["Canada", "USA", "Sweden", "Finland", "Russia", "Central Europe"];
  return Array.from({ length: 4 }, (_, i) => ({
    id: uid("sc"),
    name: `${rng.pick(COACH_FIRST)} ${rng.pick(COACH_LAST)}`,
    skill: rng.int(58, 90),
    region: regions[i % regions.length],
    assignment: i === 0 ? "pro" : i === 1 ? "amateur" : "region",
    teamId,
  }));
}

function qualityOverall(rng, quality, slot, total, spread = 10) {
  const t = slot / Math.max(1, total - 1);
  const star = 62 + quality * 32;
  const floor = 58 + quality * 10;
  const target = star - t * (star - floor);
  return clamp(Math.round(rng.normal(target, spread * 0.35)), 55, 96);
}

export function generateLeague(settings) {
  resetNamePool();
  const seed = settings.seed || (Date.now() % 1e9);
  const rng = new RNG(seed);
  const state = {
    version: 1,
    seed,
    rng: rng.serialize(),
    season: settings.season || 2026,
    day: 0,
    phase: "preseason",
    settings: {
      difficulty: settings.difficulty || "normal",
      salaryCap: (settings.salaryCap || 88e6) + 0,
      salaryFloor: settings.salaryFloor || 65e6,
      simRealism: settings.simRealism || "normal",
      ownerGoal: settings.ownerGoal || "playoffs",
      scheduleLength: 82,
    },
    userTeamId: settings.teamId,
    players: {},
    teams: {},
    schedule: [],
    results: [],
    playoffs: null,
    draft: null,
    news: [],
    history: { champions: [], awards: [], userSeasons: [], retiredNumbers: {}, hall: [] },
    owner: { confidence: 72, fired: false, notes: [] },
    nextId: 1000,
    nextNewsId: 1,
    waiverWire: [],
    faOffers: {},
    rumors: [],
    legacy: { score: 5000, cups: 0, playoffApps: 0, draftHits: 0, trades: 0, faSignings: 0 },
    scouts: {},
  };

  for (const tmpl of TEAM_TEMPLATES) {
    const team = {
      ...tmpl,
      displayName: fullName(tmpl),
      roster: [],
      minors: [],
      prospects: [],
      picks: [],
      lines: emptyLines(),
      coach: makeCoach(rng, tmpl),
      scouts: [],
      record: blankRecord(),
      streak: { type: "W", count: 0 },
      chemistry: rng.int(58, 78),
      attendance: 0.78 + tmpl.fanInterest / 500,
      retained: [],
      history: { cups: rng.int(0, tmpl.nhlQuality > 0.8 ? 4 : 1), playoffApps: rng.int(8, 40), divisionTitles: rng.int(1, 12) },
      captains: { c: null, a: [] },
    };
    for (const s of makeScouts(rng, tmpl.id)) {
      state.scouts[s.id] = s;
      team.scouts.push(s.id);
    }
    for (let year = 0; year < 3; year++) {
      for (let round = 1; round <= 7; round++) {
        if (year === 0 && round >= 3 && rng.chance(0.12)) continue;
        team.picks.push({
          id: uid("pk"),
          year: state.season + year,
          round,
          original: tmpl.id,
          owner: tmpl.id,
          protections: null,
        });
      }
    }
    state.teams[tmpl.id] = team;
  }

  for (const team of Object.values(state.teams)) {
    const q = team.nhlQuality;
    const youth = team.youth;
    const fwPos = ["C", "LW", "RW", "C", "LW", "RW", "C", "LW", "RW", "C", "LW", "RW", "C"];
    const dPos = ["LD", "RD", "LD", "RD", "LD", "RD", "LD", "RD"];
    const nhl = [];

    fwPos.forEach((position, i) => {
      const ageMean = 28 - youth * 8;
      const age = clamp(Math.round(rng.normal(ageMean, 4)), 19, 38);
      const overall = qualityOverall(rng, q, i, fwPos.length, 9);
      nhl.push(createPlayer(state, rng, { position, age, overall, teamId: team.id, status: "nhl", youthBoost: youth }));
    });
    dPos.forEach((position, i) => {
      const ageMean = 29 - youth * 8;
      const age = clamp(Math.round(rng.normal(ageMean, 4)), 19, 38);
      const overall = qualityOverall(rng, q, i, dPos.length, 8);
      nhl.push(createPlayer(state, rng, { position, age, overall, teamId: team.id, status: "nhl", youthBoost: youth }));
    });
    const g1 = qualityOverall(rng, q, 0, 3, 6);
    const g2 = qualityOverall(rng, q * 0.85, 1, 3, 6);
    nhl.push(createPlayer(state, rng, { position: "G", age: clamp(Math.round(rng.normal(29 - youth * 6, 5)), 22, 38), overall: g1, teamId: team.id, status: "nhl" }));
    nhl.push(createPlayer(state, rng, { position: "G", age: clamp(Math.round(rng.normal(27, 5)), 22, 36), overall: Math.min(g1 - rng.int(4, 10), g2), teamId: team.id, status: "nhl" }));

    assignJerseys(rng, nhl);
    for (const p of nhl) state.players[p.id] = p;
    team.roster = nhl.map((p) => p.id);

    const farm = [];
    const farmPos = ["C", "LW", "RW", "C", "LW", "RW", "C", "LW", "LD", "RD", "LD", "RD", "G", "G"];
    farmPos.forEach((position, i) => {
      const age = rng.int(19, 26);
      const pq = team.prospectQuality;
      const overall = clamp(Math.round(rng.normal(58 + pq * 16 - i, 6)), 52, 78);
      const p = createPlayer(state, rng, {
        position, age, overall, teamId: team.id, status: "minors", youthBoost: pq,
        yearsLeft: rng.int(1, 3),
      });
      p.contract.twoWay = true;
      p.contract.salary = rng.pick([775000, 800000, 825000, 850000]);
      farm.push(p);
      state.players[p.id] = p;
    });
    team.minors = farm.map((p) => p.id);

    const prosp = [];
    const nPros = 5 + Math.round(team.prospectQuality * 4);
    for (let i = 0; i < nPros; i++) {
      const position = rng.pick(["C", "LW", "RW", "LD", "RD", "G"]);
      const age = rng.int(18, 21);
      const overall = clamp(Math.round(rng.normal(52 + team.prospectQuality * 14, 7)), 48, 72);
      const p = createPlayer(state, rng, {
        position, age, overall, teamId: team.id, status: "prospect", youthBoost: team.prospectQuality + 0.2,
        yearsLeft: 3,
      });
      p.contract.type = "elc";
      p.contract.salary = 925000;
      p.draftInfo = { year: state.season - rng.int(0, 2), round: rng.int(1, 5), pick: rng.int(1, 32) };
      prosp.push(p);
      state.players[p.id] = p;
    }
    team.prospects = prosp.map((p) => p.id);

    const skaters = nhl.filter((p) => p.position !== "G").sort((a, b) => b.personality.leadership - a.personality.leadership);
    if (skaters[0]) team.captains.c = skaters[0].id;
    team.captains.a = skaters.slice(1, 3).map((p) => p.id);
    for (const p of nhl) {
      if (p.id === team.captains.c) p.captain = "C";
      else if (team.captains.a.includes(p.id)) p.captain = "A";
    }

    autoLines(state, team.id);
  }

  generateFreeAgents(state, rng, 90);
  initScoutingKnowledge(state, rng);

  const user = state.teams[state.userTeamId];
  state.owner.confidence = clamp(58 + user.ownerPatience * 0.2, 50, 80);
  state.owner.goals = buildOwnerGoals(user, settings.ownerGoal);
  state.rng = rng.serialize();
  return state;
}

export function emptyLines() {
  return {
    f1: [null, null, null],
    f2: [null, null, null],
    f3: [null, null, null],
    f4: [null, null, null],
    d1: [null, null],
    d2: [null, null],
    d3: [null, null],
    pp1: [null, null, null, null, null],
    pp2: [null, null, null, null, null],
    pk1: [null, null, null, null],
    pk2: [null, null, null, null],
    starter: null,
    backup: null,
    scratches: [],
  };
}

export function blankRecord() {
  return { gp: 0, w: 0, l: 0, ot: 0, gf: 0, ga: 0, homeW: 0, homeL: 0, homeOT: 0, streakW: 0, streakL: 0, last10: [] };
}

export function autoLines(state, teamId) {
  const team = state.teams[teamId];
  const players = team.roster.map((id) => state.players[id]).filter(Boolean);
  const healthy = (p) => !p.injury || p.injury.days <= 0;
  const cs = players.filter((p) => p.position === "C" && healthy(p)).sort((a, b) => b.ratings.overall - a.ratings.overall);
  const lws = players.filter((p) => p.position === "LW" && healthy(p)).sort((a, b) => b.ratings.overall - a.ratings.overall);
  const rws = players.filter((p) => p.position === "RW" && healthy(p)).sort((a, b) => b.ratings.overall - a.ratings.overall);
  const ds = players.filter((p) => posGroup(p.position) === "D" && healthy(p)).sort((a, b) => b.ratings.overall - a.ratings.overall);
  const gs = players.filter((p) => p.position === "G" && healthy(p)).sort((a, b) => b.ratings.overall - a.ratings.overall);
  const forwards = players.filter((p) => posGroup(p.position) === "F" && healthy(p)).sort((a, b) => b.ratings.overall - a.ratings.overall);
  const takeF = (preferred, i, used) => {
    const hit = (preferred[i] && !used.has(preferred[i].id)) ? preferred[i] : forwards.find((p) => !used.has(p.id));
    if (hit) used.add(hit.id);
    return hit?.id || null;
  };
  const usedF = new Set();
  const lines = emptyLines();
  for (let i = 0; i < 4; i++) {
    lines[`f${i + 1}`] = [takeF(lws, i, usedF), takeF(cs, i, usedF), takeF(rws, i, usedF)];
  }
  for (let i = 0; i < 3; i++) {
    lines[`d${i + 1}`] = [ds[i * 2]?.id || null, ds[i * 2 + 1]?.id || null];
  }
  const topF = [...cs, ...lws, ...rws].sort((a, b) => b.ratings.overall - a.ratings.overall);
  const offD = ds.filter((p) => p.archetype === "offD" || p.archetype === "twoWayD");
  const defD = ds.filter((p) => p.archetype === "defD" || p.archetype === "twoWayD");
  lines.pp1 = [topF[0]?.id, topF[1]?.id, topF[2]?.id, offD[0]?.id || ds[0]?.id, topF[3]?.id || ds[1]?.id];
  lines.pp2 = [topF[4]?.id, topF[5]?.id, topF[6]?.id, offD[1]?.id || ds[2]?.id, ds[3]?.id];
  const twoWay = [...topF, ...ds].sort((a, b) => (b.ratings.defAwareness || 0) - (a.ratings.defAwareness || 0));
  lines.pk1 = [twoWay[0]?.id, twoWay[1]?.id, defD[0]?.id || ds[0]?.id, defD[1]?.id || ds[1]?.id];
  lines.pk2 = [twoWay[2]?.id, twoWay[3]?.id, ds[4]?.id, ds[5]?.id];
  lines.starter = gs[0]?.id || null;
  lines.backup = gs[1]?.id || null;
  const used = new Set([
    ...lines.f1, ...lines.f2, ...lines.f3, ...lines.f4, ...lines.d1, ...lines.d2, ...lines.d3, lines.starter, lines.backup,
  ].filter(Boolean));
  lines.scratches = team.roster.filter((id) => !used.has(id));
  team.lines = lines;
}

function generateFreeAgents(state, rng, count) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    positions.push(rng.pick(["C", "C", "LW", "RW", "LW", "RW", "LD", "RD", "LD", "RD", "G"]));
  }
  for (const position of positions) {
    const age = rng.int(24, 36);
    const overall = clamp(Math.round(rng.normal(72, 7)), 62, 88);
    const p = createPlayer(state, rng, { position, age, overall, teamId: null, status: "fa", yearsLeft: 0 });
    p.contract = { salary: 0, years: 0, yearsLeft: 0, type: "ufa", ntc: false, nmc: false, signingBonus: 0, bonuses: 0, twoWay: overall < 74, expiry: "ufa" };
    p.faPriority = rng.pick(["money", "winning", "role", "location", "term"]);
    state.players[p.id] = p;
  }
}

function initScoutingKnowledge(state, rng) {
  for (const p of Object.values(state.players)) {
    const isOwn = p.teamId === state.userTeamId;
    const isNhl = p.status === "nhl";
    let k;
    if (isOwn) k = 100;
    else if (isNhl) k = rng.int(58, 86);
    else if (p.status === "fa") k = rng.int(50, 78);
    else k = rng.int(12, 42);
    p.scout = { knowledge: k, notes: [] };
  }
}

export function scoutedView(player, userTeamId) {
  const k = player.teamId === userTeamId ? 100 : player.scout?.knowledge || 20;
  const fuzz = Math.max(0, Math.round((100 - k) / 12));
  const o = player.ratings.overall;
  const pot = player.potential.ceiling;
  if (k >= 96) {
    return { overall: o, overallRange: [o, o], potential: player.potential.category, potentialRange: [pot, pot], knowledge: k, exact: true };
  }
  return {
    overall: Math.round((o + (player.scout.bias || 0))),
    overallRange: [clamp(o - fuzz, 40, 99), clamp(o + fuzz, 40, 99)],
    potential: k > 55 ? player.potential.category : "unknown",
    potentialRange: [clamp(pot - fuzz - 1, 50, 99), clamp(pot + fuzz, 50, 99)],
    knowledge: k,
    exact: false,
  };
}

function buildOwnerGoals(team, chosen) {
  const goals = [];
  if (chosen === "cup" || team.ownerExpectations === "cup") goals.push({ id: "cup", label: "Win the championship", weight: 40 });
  if (chosen === "playoffs" || team.ownerExpectations !== "rebuild") goals.push({ id: "playoffs", label: "Make the playoffs", weight: 30 });
  if (team.philosophy === "rebuilding") {
    goals.push({ id: "develop", label: "Develop prospects", weight: 25 });
    goals.push({ id: "cap", label: "Stay under the cap and build assets", weight: 20 });
  } else {
    goals.push({ id: "division", label: "Win the division", weight: 15 });
    goals.push({ id: "attend", label: "Keep the building full", weight: 10 });
  }
  if (!goals.find((g) => g.id === chosen) && chosen) {
    const labels = { cup: "Win the championship", playoffs: "Make the playoffs", develop: "Develop prospects", payroll: "Reduce payroll" };
    goals.unshift({ id: chosen, label: labels[chosen] || chosen, weight: 28 });
  }
  return goals;
}

export function getTeamPlayers(state, teamId, includeMinors = false) {
  const team = state.teams[teamId];
  const ids = includeMinors ? [...team.roster, ...team.minors, ...team.prospects] : team.roster;
  return ids.map((id) => state.players[id]).filter(Boolean);
}

export function getFreeAgents(state) {
  return Object.values(state.players).filter((p) => p.status === "fa" && !p.teamId);
}

export { makeContract, nextId, makeRatings, pickPotential };
