import { clamp, poisson, posGroup } from "./utils.js";
import { offensiveRating, defensiveRating, goalieRating, lineChemistry, skatingRating, emptySeasonStats } from "./players.js";
import { autoLines } from "./generation.js";

const INJURIES = [
  { type: "Lower-body", days: [4, 14], sev: "minor" },
  { type: "Upper-body", days: [3, 12], sev: "minor" },
  { type: "Illness", days: [1, 5], sev: "minor" },
  { type: "Ankle", days: [7, 21], sev: "medium" },
  { type: "Shoulder", days: [10, 28], sev: "medium" },
  { type: "Knee", days: [14, 45], sev: "major" },
  { type: "Concussion", days: [6, 21], sev: "major" },
];

function linePlayers(state, ids) {
  return (ids || []).map((id) => state.players[id]).filter(Boolean);
}

export function teamStrength(state, teamId) {
  const team = state.teams[teamId];
  const L = team.lines;
  const fLines = [L.f1, L.f2, L.f3, L.f4].map((ids) => linePlayers(state, ids));
  const dPairs = [L.d1, L.d2, L.d3].map((ids) => linePlayers(state, ids));
  const starter = state.players[L.starter];
  const weights = [0.34, 0.28, 0.22, 0.16];
  const dWeights = [0.4, 0.33, 0.27];

  let offense = 0;
  let defense = 0;
  let skating = 0;
  let chem = 0;
  fLines.forEach((line, i) => {
    if (!line.length) return;
    const o = line.reduce((s, p) => s + offensiveRating(p) * moraleMod(p) * injuryMod(p), 0) / line.length;
    const d = line.reduce((s, p) => s + defensiveRating(p) * moraleMod(p), 0) / line.length;
    const sk = line.reduce((s, p) => s + skatingRating(p), 0) / line.length;
    offense += o * weights[i];
    defense += d * weights[i] * 0.45;
    skating += sk * weights[i];
    chem += lineChemistry(line) * weights[i];
  });
  dPairs.forEach((pair, i) => {
    if (!pair.length) return;
    const o = pair.reduce((s, p) => s + offensiveRating(p) * 0.7, 0) / pair.length;
    const d = pair.reduce((s, p) => s + defensiveRating(p) * moraleMod(p) * injuryMod(p), 0) / pair.length;
    offense += o * dWeights[i] * 0.35;
    defense += d * dWeights[i];
  });

  const g = starter ? goalieRating(starter) * moraleMod(starter) * injuryMod(starter) : 68;
  const coach = team.coach || { offense: 70, defense: 70, specialTeams: 70, goaltending: 70, system: "balanced" };
  offense += (coach.offense - 70) * 0.08;
  defense += (coach.defense - 70) * 0.1;
  const sys = coach.system;
  if (sys === "offensive" || sys === "speed") offense += 1.4;
  if (sys === "trap") {
    defense += 1.8;
    offense -= 0.8;
  }
  if (sys === "speed") skating += 2;

  const special = 70 + (coach.specialTeams - 70) * 0.4 + (offense - defense) * 0.1;
  return {
    offense: clamp(offense, 48, 96),
    defense: clamp(defense, 48, 96),
    goalie: clamp(g, 50, 97),
    skating: clamp(skating, 50, 95),
    chemistry: clamp(chem || team.chemistry || 65, 40, 95),
    special: clamp(special, 50, 94),
    fatigue: team.fatigue || 0,
  };
}

function moraleMod(p) {
  const m = p.morale ?? 70;
  return 0.92 + (m - 50) / 400;
}

function injuryMod(p) {
  if (!p.injury) return 1;
  return p.injury.severity === "major" ? 0 : 0.82;
}

export function simulateGame(state, game, rng) {
  if (game.home !== state.userTeamId) autoLines(state, game.home);
  if (game.away !== state.userTeamId) autoLines(state, game.away);
  const homeS = teamStrength(state, game.home);
  const awayS = teamStrength(state, game.away);
  const homeIce = game.type === "playoff" ? 1.08 : 1.05;
  const hOff = homeS.offense * homeIce * (1 + (homeS.chemistry - 70) / 500) * (1 - homeS.fatigue * 0.002);
  const aOff = awayS.offense * (1 + (awayS.chemistry - 70) / 500) * (1 - awayS.fatigue * 0.002);
  const hExp = clamp(((hOff / Math.max(40, awayS.defense)) * (88 / Math.max(55, awayS.goalie))) * 2.55, 1.4, 5.2);
  const aExp = clamp(((aOff / Math.max(40, homeS.defense)) * (88 / Math.max(55, homeS.goalie))) * 2.4, 1.3, 5.0);

  let hg = poisson(hExp, rng);
  let ag = poisson(aExp, rng);
  if (Math.abs(hg - ag) > 7) {
    hg = Math.round((hg + hExp) / 2);
    ag = Math.round((ag + aExp) / 2);
  }

  let ot = false;
  let so = false;
  let winner = null;
  if (hg === ag) {
    ot = true;
    const hOt = hExp / (hExp + aExp);
    if (game.type === "playoff") {
      if (rng.chance(hOt)) hg++;
      else ag++;
    } else if (rng.chance(0.55)) {
      if (rng.chance(hOt)) hg++;
      else ag++;
    } else {
      so = true;
      if (rng.chance(hOt * 0.52 + 0.24)) hg++;
      else ag++;
    }
  }
  winner = hg > ag ? "home" : "away";

  const homeBox = buildBox(state, game.home, true, hg, ag, rng, homeS, game.type);
  const awayBox = buildBox(state, game.away, false, ag, hg, rng, awayS, game.type);
  applyGoalie(state, game.home, hg, ag, winner === "home", ot, so, rng, homeBox, game.type);
  applyGoalie(state, game.away, ag, hg, winner === "away", ot, so, rng, awayBox, game.type);

  maybeInjure(state, game.home, rng);
  maybeInjure(state, game.away, rng);
  tickInjuries(state, game.home);
  tickInjuries(state, game.away);

  const result = {
    homeGoals: hg,
    awayGoals: ag,
    ot,
    so,
    winner,
    homeBox,
    awayBox,
    shots: { home: homeBox.shots, away: awayBox.shots },
    pp: { home: homeBox.pp, away: awayBox.pp },
  };
  game.played = true;
  game.result = result;
  if (game.type === "preseason") return result;

  applyRecord(state.teams[game.home], hg, ag, true, ot, so, winner === "home");
  applyRecord(state.teams[game.away], ag, hg, false, ot, so, winner === "away");
  updateStreak(state.teams[game.home], winner === "home", ot);
  updateStreak(state.teams[game.away], winner === "away", ot);
  updateMorale(state, game);
  return result;
}

function buildBox(state, teamId, home, gf, ga, rng, strength, gameType) {
  const team = state.teams[teamId];
  const skaters = [];
  const lines = [team.lines.f1, team.lines.f2, team.lines.f3, team.lines.f4, team.lines.d1, team.lines.d2, team.lines.d3];
  const iceShare = [0.22, 0.2, 0.16, 0.12, 0.22, 0.18, 0.14];
  const used = new Set();
  lines.forEach((ids, li) => {
    for (const id of ids || []) {
      if (!id || used.has(id)) continue;
      const p = state.players[id];
      if (!p || p.position === "G") continue;
      used.add(id);
      skaters.push({ p, share: iceShare[li] / (ids.filter(Boolean).length || 1) });
    }
  });
  const totalOff = skaters.reduce((s, x) => s + offensiveRating(x.p) * x.share, 0) || 1;
  let goalsLeft = gf;
  let assists = [];
  const events = [];
  const shots = Math.max(gf + rng.int(18, 38), gf * 8);
  const ppg = rng.int(0, Math.min(2, gf));
  const pim = rng.int(2, 12);

  const scorers = [];
  for (let i = 0; i < gf; i++) {
    const scorer = rng.weighted(skaters, (x) => Math.pow(offensiveRating(x.p) * x.share, 1.6) * (x.p.archetype === "sniper" ? 1.25 : 1));
    const a1pool = skaters.filter((x) => x.p.id !== scorer.p.id);
    const a1 = a1pool.length ? rng.weighted(a1pool, (x) => passingW(x.p) * x.share) : null;
    const a2pool = a1pool.filter((x) => x.p.id !== a1?.p.id);
    const a2 = a2pool.length && rng.chance(0.62) ? rng.weighted(a2pool, (x) => passingW(x.p) * x.share) : null;
    scorers.push({ g: scorer.p, a: [a1?.p, a2?.p].filter(Boolean), pp: i < ppg });
    events.push({
      type: "goal",
      scorer: scorer.p.id,
      assists: [a1?.p?.id, a2?.p?.id].filter(Boolean),
      pp: i < ppg,
    });
  }

  for (const x of skaters) {
    const p = x.p;
    const isG = scorers.filter((s) => s.g.id === p.id).length;
    const isA = scorers.reduce((n, s) => n + s.a.filter((a) => a.id === p.id).length, 0);
    const sog = Math.max(isG, Math.round(shots * x.share * (0.7 + offensiveRating(p) / 200) + rng.float(-1, 1)));
    const hits = Math.max(0, Math.round((p.ratings.physicality / 20) * x.share * 18 * rng.float(0.5, 1.4)));
    const blocks = posGroup(p.position) === "D" ? Math.max(0, Math.round((p.ratings.defAwareness / 30) * rng.float(0.3, 2.2))) : rng.chance(0.25) ? 1 : 0;
    const plus = gf - ga > 0 ? rng.int(0, 2) : gf - ga < 0 ? -rng.int(0, 2) : rng.int(-1, 1);
    if (gameType !== "preseason") {
      bumpSkater(p, state.phase === "playoffs", {
        gp: 1, g: isG, a: isA, p: isG + isA, plusMinus: plus, pim: rng.chance(0.2) ? rng.pick([2, 2, 4]) : 0,
        ppp: scorers.filter((s) => s.pp && (s.g.id === p.id || s.a.some((a) => a.id === p.id))).length,
        shg: 0, sog, hits, blocks, toi: Math.round(x.share * 60 * 10) / 10,
        foi: p.position === "C" ? rng.int(8, 22) : 0,
        fow: p.position === "C" ? rng.int(4, 12) : 0,
      });
    }
  }

  return { shots, pp: `${ppg}/${rng.int(Math.max(ppg, 2), 5)}`, pim, events, goals: gf };
}

function passingW(p) {
  return (p.ratings.passing || 50) * (p.archetype === "playmaker" ? 1.35 : 1);
}

function bumpSkater(p, playoffs, row) {
  const bucket = playoffs ? "playoffs" : "season";
  p.stats[bucket] = p.stats[bucket] || emptySeasonStats(false);
  p.stats.career = p.stats.career || emptySeasonStats(false);
  for (const k of Object.keys(row)) {
    p.stats[bucket][k] = (p.stats[bucket][k] || 0) + row[k];
    p.stats.career[k] = (p.stats.career[k] || 0) + row[k];
  }
}

function applyGoalie(state, teamId, ga, gf, win, ot, so, rng, box, gameType) {
  if (gameType === "preseason") return;
  const team = state.teams[teamId];
  const g = state.players[team.lines.starter];
  if (!g) return;
  const sa = box.shots || rng.int(22, 38);
  const sv = Math.max(0, sa - ga);
  const row = {
    gp: 1, gs: 1, w: win && !ot && !so ? 1 : win ? 1 : 0, l: !win && !ot && !so ? 1 : 0, ot: (ot || so) && !win ? 1 : 0,
    ga, sa, so: ga === 0 ? 1 : 0, toi: 60,
  };
  if (win && (ot || so)) {
    row.w = 1;
    row.l = 0;
  }
  const bucket = state.phase === "playoffs" ? "playoffs" : "season";
  g.stats[bucket] = g.stats[bucket] || emptySeasonStats(true);
  g.stats.career = g.stats.career || emptySeasonStats(true);
  for (const k of Object.keys(row)) {
    g.stats[bucket][k] = (g.stats[bucket][k] || 0) + row[k];
    g.stats.career[k] = (g.stats.career[k] || 0) + row[k];
  }
  const s = g.stats[bucket];
  s.svpct = s.sa ? (s.sa - s.ga) / s.sa : 0;
  s.gaa = s.gp ? (s.ga / s.gp) : 0;
}

function applyRecord(team, gf, ga, home, ot, so, win) {
  team.record.gp++;
  team.record.gf += gf;
  team.record.ga += ga;
  if (win) {
    team.record.w++;
    if (home) team.record.homeW++;
  } else if (ot || so) {
    team.record.ot++;
    if (home) team.record.homeOT++;
  } else {
    team.record.l++;
    if (home) team.record.homeL++;
  }
  team.record.last10 = team.record.last10 || [];
  team.record.last10.unshift(win ? "W" : ot || so ? "OTL" : "L");
  team.record.last10 = team.record.last10.slice(0, 10);
}

function updateStreak(team, win, ot) {
  const type = win ? "W" : "L";
  if (team.streak?.type === type) team.streak.count++;
  else team.streak = { type, count: 1 };
}

function updateMorale(state, game) {
  const homeWin = game.result.winner === "home";
  const bump = (id, amt) => {
    for (const pid of state.teams[id].roster) {
      const p = state.players[pid];
      if (!p) continue;
      p.morale = clamp((p.morale || 70) + amt + (Math.random() - 0.5), 20, 99);
    }
    const t = state.teams[id];
    t.chemistry = clamp((t.chemistry || 65) + amt * 0.4, 40, 95);
    t.attendance = clamp((t.attendance || 0.8) + amt * 0.004, 0.55, 1);
  };
  bump(game.home, homeWin ? 1.2 : -1.1);
  bump(game.away, homeWin ? -1.1 : 1.2);
}

function maybeInjure(state, teamId, rng) {
  if (!rng.chance(0.045)) return null;
  const team = state.teams[teamId];
  const pool = team.roster.map((id) => state.players[id]).filter((p) => p && !p.injury);
  if (!pool.length) return null;
  const p = rng.pick(pool);
  const tmpl = rng.weighted(INJURIES, (inj) => (inj.sev === "major" ? 1 : inj.sev === "medium" ? 2.2 : 4));
  const days = rng.int(tmpl.days[0], tmpl.days[1]);
  p.injury = { type: tmpl.type, days, severity: tmpl.sev, start: state.day };
  p.injuryHistory.push({ type: tmpl.type, season: state.season, days });
  p.morale = clamp((p.morale || 70) - 4, 20, 99);
  return p;
}

function tickInjuries(state, teamId) {
  const team = state.teams[teamId];
  for (const id of [...team.roster, ...team.minors]) {
    const p = state.players[id];
    if (p?.injury) {
      p.injury.days--;
      if (p.injury.days <= 0) p.injury = null;
    }
  }
}

export function simulateDay(state, rng) {
  const games = state.schedule.filter((g) => g.day === state.day && !g.played);
  const results = [];
  for (const g of games) results.push({ game: g, result: simulateGame(state, g, rng) });
  return results;
}

export { maybeInjure };
