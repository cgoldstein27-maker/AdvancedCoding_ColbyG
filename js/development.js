import { ageCurveModifier, calcOverall, SKATER_KEYS, GOALIE_KEYS } from "./players.js";
import { clamp, posGroup, DIFFICULTY } from "./utils.js";
import { addNews } from "./news.js";

export function developRoster(state, rng) {
  const diff = DIFFICULTY[state.settings.difficulty] || DIFFICULTY.normal;
  const news = [];
  for (const p of Object.values(state.players)) {
    if (p.status === "retired" || p.status === "draft") continue;
    developPlayer(state, p, rng, diff);
    p.age += 1;
    p.yearsPro = (p.yearsPro || 0) + (p.status === "nhl" ? 1 : 0);
    p.ovrHistory.push({ season: state.season + 1, ovr: p.ratings.overall });
    if (p.age >= 38 && rng.chance(0.25 + (p.age - 38) * 0.15)) {
      p._retire = true;
    }
  }
  for (const p of Object.values(state.players)) {
    if (p._retire) {
      p._retire = false;
      p.status = "retired";
      const team = p.teamId ? state.teams[p.teamId] : null;
      if (team) {
        team.roster = team.roster.filter((id) => id !== p.id);
        team.minors = team.minors.filter((id) => id !== p.id);
        team.prospects = team.prospects.filter((id) => id !== p.id);
      }
      if (p.ratings.overall >= 80) {
        news.push(addNews(state, "legacy", `${p.name} retires`, `${p.yearsPro} professional seasons.`));
      }
      p.teamId = null;
    }
  }
  return news;
}

export function developPlayer(state, p, rng, diff) {
  const gp = p.stats.season?.gp || 0;
  const ice = p.status === "nhl" ? Math.min(1, gp / 70) : p.status === "minors" ? 0.55 : 0.3;
  const work = (p.personality.workEthic || 60) / 80;
  const coach = p.teamId ? state.teams[p.teamId]?.coach : null;
  const devCoach = coach ? (coach.development - 60) / 80 : 0;
  const curve = ageCurveModifier(p.age, p.position) * (diff.developmentLuck || 1);
  const towardCeiling = Math.max(0, (p.potential.ceiling - p.ratings.overall) / 12);
  const fail = rng.next() > (p.potential.probability || 0.5) && p.age <= 23;
  let delta = curve * (0.35 + ice * 0.4 + work * 0.25 + devCoach * 0.2);
  if (p.age <= 24) delta += towardCeiling * (fail ? -0.4 : 1.1);
  if (p.injuryHistory.filter((i) => i.season >= state.season - 1 && i.days > 20).length) delta -= 0.5;
  if (p.fitness < 70) delta -= 0.3;
  delta += rng.normal(0, 0.45);
  delta = clamp(delta, -3.2, 3.6);

  const keys = p.position === "G" ? GOALIE_KEYS : SKATER_KEYS;
  const arch = p.archetype || "";
  for (const k of keys) {
    let kDelta = delta * rng.float(0.6, 1.3);
    if (arch.includes("sniper") && /wrist|slap|handEye/.test(k)) kDelta *= 1.25;
    if (arch.includes("playmaker") && /pass|puck/.test(k)) kDelta *= 1.25;
    if (arch === "grinder" && /check|physical|defAwareness/.test(k)) kDelta *= 1.2;
    if (p.age >= 33 && /speed|acceleration|athleticism/.test(k)) kDelta -= 0.8;
    p.ratings[k] = clamp(Math.round(p.ratings[k] + kDelta), 35, 99);
  }
  const prev = p.ratings.overall;
  p.ratings.overall = calcOverall(p);
  if (p.teamId === state.userTeamId && Math.abs(p.ratings.overall - prev) >= 3) {
    const dir = p.ratings.overall > prev ? "breaks out" : "slips";
    addNews(state, "dev", `${p.name} ${dir}`, `${prev} → ${p.ratings.overall} OVR in the offseason.`);
  }
  p.fitness = clamp(p.fitness + rng.int(-4, 5), 60, 99);
  if (p.morale < 40 && p.age >= 26 && p.status === "nhl" && rng.chance(0.18)) {
    p.tradeRequest = true;
    if (p.teamId === state.userTeamId) addNews(state, "locker", `${p.name} requests a trade`, "Morale has hit a breaking point.");
  }
}

export function resetSeasonStats(state) {
  for (const p of Object.values(state.players)) {
    if (p.status === "retired") continue;
    const isG = p.position === "G";
    if (p.stats.season && p.stats.season.gp) {
      p.stats.bySeason[state.season] = JSON.parse(JSON.stringify(p.stats.season));
    }
    p.stats.season = isG
      ? { gp: 0, gs: 0, w: 0, l: 0, ot: 0, ga: 0, sa: 0, so: 0, toi: 0, gaa: 0, svpct: 0 }
      : { gp: 0, g: 0, a: 0, p: 0, plusMinus: 0, pim: 0, ppp: 0, shg: 0, sog: 0, hits: 0, blocks: 0, foi: 0, fow: 0, toi: 0 };
    p.stats.playoffs = JSON.parse(JSON.stringify(p.stats.season));
  }
  for (const t of Object.values(state.teams)) {
    t.record = { gp: 0, w: 0, l: 0, ot: 0, gf: 0, ga: 0, homeW: 0, homeL: 0, homeOT: 0, last10: [] };
    t.streak = { type: "W", count: 0 };
  }
}

export function trainCamp(state, rng) {
  for (const t of Object.values(state.teams)) {
    for (const id of t.roster) {
      const p = state.players[id];
      if (!p) continue;
      if (rng.chance(0.08)) p.ratings.overall = clamp(p.ratings.overall + 1, 40, 99);
      p.morale = clamp((p.morale || 70) + rng.int(0, 4), 25, 99);
      p.fitness = clamp((p.fitness || 80) + rng.int(1, 6), 70, 99);
    }
  }
}
