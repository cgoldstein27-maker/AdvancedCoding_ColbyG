/**
 * Player report-card math.
 * Overall rating, player types (sniper, playmaker...), and how much a player is worth.
 */
import { clamp, posGroup } from "./utils.js";

/** Skills for skaters, like skating and shooting. */
export const SKATER_KEYS = [
  "skating", "acceleration", "speed", "agility", "balance", "strength",
  "puckControl", "passing", "offAwareness", "defAwareness", "handEye",
  "wristPower", "wristAcc", "slapPower", "slapAcc",
  "physicality", "checking", "stickChecking", "faceoffs", "discipline",
];

/** Skills just for goalies. */
export const GOALIE_KEYS = [
  "positioning", "reflexes", "rebound", "glove", "blocker", "pokeCheck", "athleticism", "consistency",
];

/** Player styles. A sniper loves scoring. A grinder loves hitting. */
export const ARCHETYPES = {
  sniper: { label: "Sniper", group: "F", weights: { wristAcc: 1.25, wristPower: 1.2, slapAcc: 1.15, slapPower: 1.12, offAwareness: 1.12, handEye: 1.18, passing: 0.9, defAwareness: 0.88 } },
  playmaker: { label: "Playmaker", group: "F", weights: { passing: 1.28, puckControl: 1.22, offAwareness: 1.18, vision: 1.2, skating: 1.08, wristAcc: 0.95, physicality: 0.88 } },
  power: { label: "Power Forward", group: "F", weights: { strength: 1.25, physicality: 1.22, checking: 1.15, wristPower: 1.12, slapPower: 1.12, balance: 1.12, speed: 0.9, agility: 0.9 } },
  twoWayF: { label: "Two-Way Forward", group: "F", weights: { defAwareness: 1.2, stickChecking: 1.15, offAwareness: 1.08, passing: 1.08, discipline: 1.1, skating: 1.06 } },
  grinder: { label: "Grinder", group: "F", weights: { checking: 1.22, physicality: 1.18, defAwareness: 1.15, stickChecking: 1.12, discipline: 0.92, offAwareness: 0.85, passing: 0.88, wristAcc: 0.86 } },
  offD: { label: "Offensive Defenseman", group: "D", weights: { skating: 1.2, passing: 1.22, puckControl: 1.15, slapPower: 1.18, slapAcc: 1.15, offAwareness: 1.15, speed: 1.12, defAwareness: 0.9 } },
  defD: { label: "Defensive Defenseman", group: "D", weights: { defAwareness: 1.25, checking: 1.18, strength: 1.15, stickChecking: 1.18, physicality: 1.12, balance: 1.1, passing: 0.88, offAwareness: 0.85 } },
  twoWayD: { label: "Two-Way Defenseman", group: "D", weights: { defAwareness: 1.12, skating: 1.1, passing: 1.1, puckControl: 1.08, stickChecking: 1.08, offAwareness: 1.05 } },
  hybridG: { label: "Hybrid", group: "G", weights: { positioning: 1.1, reflexes: 1.08, rebound: 1.05 } },
  butterflyG: { label: "Butterfly", group: "G", weights: { positioning: 1.15, rebound: 1.12, glove: 1.08, athleticism: 0.95 } },
  athleticG: { label: "Athletic", group: "G", weights: { reflexes: 1.2, athleticism: 1.18, glove: 1.1, consistency: 0.9, positioning: 0.95 } },
};

/** How high a kid might grow, like "top line" or "bottom pair". */
export const POTENTIALS = {
  F: ["franchise", "elite", "topLine", "top6", "middle6", "bottom6"],
  D: ["franchise", "elite", "top4", "top4", "bottomPair", "bottomPair"],
  G: ["franchise", "starter", "starter", "backup", "backup"],
};

/** The best overall number each potential label can reach. */
export const POTENTIAL_CEILING = {
  franchise: [94, 99],
  elite: [90, 94],
  topLine: [86, 90],
  top6: [81, 86],
  middle6: [76, 81],
  bottom6: [70, 76],
  top4: [84, 90],
  bottomPair: [72, 80],
  starter: [84, 92],
  backup: [72, 80],
};

/** Pretty names for those potential labels. */
export const POTENTIAL_LABEL = {
  franchise: "Franchise",
  elite: "Elite",
  topLine: "Top Line",
  top6: "Top 6",
  middle6: "Middle 6",
  bottom6: "Bottom 6",
  top4: "Top Pair / Top 4",
  bottomPair: "Bottom Pair",
  starter: "Starter",
  backup: "Backup",
};

/** How much each skill counts toward overall. Forwards care more about shooting. */
const SKATER_WEIGHTS = {
  F: {
    skating: 0.07, acceleration: 0.04, speed: 0.05, agility: 0.04, balance: 0.03, strength: 0.04,
    puckControl: 0.09, passing: 0.09, offAwareness: 0.12, defAwareness: 0.07, handEye: 0.05,
    wristPower: 0.06, wristAcc: 0.08, slapPower: 0.03, slapAcc: 0.03,
    physicality: 0.03, checking: 0.03, stickChecking: 0.03, faceoffs: 0.02, discipline: 0.01,
  },
  D: {
    skating: 0.09, acceleration: 0.04, speed: 0.05, agility: 0.04, balance: 0.05, strength: 0.07,
    puckControl: 0.07, passing: 0.09, offAwareness: 0.06, defAwareness: 0.14, handEye: 0.03,
    wristPower: 0.03, wristAcc: 0.03, slapPower: 0.05, slapAcc: 0.04,
    physicality: 0.05, checking: 0.07, stickChecking: 0.07, faceoffs: 0, discipline: 0.02,
  },
};

/** How much each goalie skill counts toward overall. */
const GOALIE_WEIGHTS = {
  positioning: 0.18, reflexes: 0.16, rebound: 0.14, glove: 0.12, blocker: 0.1, pokeCheck: 0.08, athleticism: 0.12, consistency: 0.1,
};

/** Start every skill at 50, like a blank hockey card. */
export function emptyRatings(isGoalie) {
  const r = { overall: 50 };
  const keys = isGoalie ? GOALIE_KEYS : SKATER_KEYS;
  for (const k of keys) r[k] = 50;
  return r;
}

/** Mix all the skills into one overall number from 40 to 99. */
export function calcOverall(player) {
  const ratings = player.ratings;
  if (player.position === "G") {
    let t = 0;
    for (const [k, w] of Object.entries(GOALIE_WEIGHTS)) t += (ratings[k] || 50) * w;
    return clamp(Math.round(t), 40, 99);
  }
  const g = posGroup(player.position);
  const weights = SKATER_WEIGHTS[g] || SKATER_WEIGHTS.F;
  let t = 0;
  let wsum = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (k === "faceoffs" && player.position !== "C") continue;
    t += (ratings[k] || 50) * w;
    wsum += w;
  }
  return clamp(Math.round(t / wsum), 40, 99);
}

/** Nudge every skill up or down until overall matches the number we want. */
export function scaleToOverall(player, target) {
  player.ratings.overall = calcOverall(player);
  const cur = player.ratings.overall;
  if (cur <= 0) return;
  const factor = target / cur;
  const keys = player.position === "G" ? GOALIE_KEYS : SKATER_KEYS;
  for (const k of keys) {
    player.ratings[k] = clamp(Math.round(player.ratings[k] * factor), 35, 99);
  }
  player.ratings.overall = calcOverall(player);
  let guard = 0;
  while (player.ratings.overall < target - 1 && guard++ < 12) {
    for (const k of keys) player.ratings[k] = clamp(player.ratings[k] + 1, 35, 99);
    player.ratings.overall = calcOverall(player);
  }
  guard = 0;
  while (player.ratings.overall > target + 1 && guard++ < 12) {
    for (const k of keys) player.ratings[k] = clamp(player.ratings[k] - 1, 35, 99);
    player.ratings.overall = calcOverall(player);
  }
}

/** Pick a player style that fits the position. */
export function pickArchetype(position, rng) {
  const g = posGroup(position);
  if (g === "G") return rng.pick(["hybridG", "butterflyG", "athleticG"]);
  if (g === "D") return rng.weighted(
    ["offD", "defD", "twoWayD"],
    (a) => (a === "twoWayD" ? 3 : 2)
  );
  return rng.weighted(
    ["sniper", "playmaker", "power", "twoWayF", "grinder"],
    (a) => ({ sniper: 2, playmaker: 2.2, power: 1.6, twoWayF: 2.4, grinder: 1.8 }[a])
  );
}

/** How good is this player at scoring and making plays? */
export function offensiveRating(player) {
  const r = player.ratings;
  if (player.position === "G") return 40;
  return Math.round(r.offAwareness * 0.28 + r.wristAcc * 0.18 + r.wristPower * 0.12 + r.passing * 0.18 + r.puckControl * 0.14 + r.handEye * 0.1);
}

/** How good is this player at stopping the other team? */
export function defensiveRating(player) {
  const r = player.ratings;
  if (player.position === "G") return Math.round(r.positioning * 0.5 + r.rebound * 0.3 + r.pokeCheck * 0.2);
  return Math.round(r.defAwareness * 0.4 + r.stickChecking * 0.2 + r.checking * 0.15 + r.skating * 0.15 + r.discipline * 0.1);
}

/** How fast and smooth this player skates. */
export function skatingRating(player) {
  const r = player.ratings;
  if (player.position === "G") return r.athleticism;
  return Math.round(r.skating * 0.4 + r.speed * 0.3 + r.acceleration * 0.2 + r.agility * 0.1);
}

/** How well this player shoots the puck. */
export function shootingRating(player) {
  const r = player.ratings;
  if (player.position === "G") return 30;
  return Math.round(r.wristAcc * 0.35 + r.wristPower * 0.25 + r.slapAcc * 0.2 + r.slapPower * 0.1 + r.handEye * 0.1);
}

/** How well this player passes. */
export function passingRating(player) {
  if (player.position === "G") return 40;
  return Math.round(player.ratings.passing * 0.6 + player.ratings.puckControl * 0.25 + player.ratings.offAwareness * 0.15);
}

/** How good a goalie is at stopping pucks. */
export function goalieRating(player) {
  if (player.position !== "G") return 40;
  const r = player.ratings;
  return Math.round(r.positioning * 0.3 + r.reflexes * 0.25 + r.rebound * 0.2 + r.consistency * 0.15 + r.athleticism * 0.1);
}

/** Guess the line or pair this player should play on. */
export function expectedRole(player) {
  const o = player.ratings.overall;
  const g = posGroup(player.position);
  if (g === "G") return o >= 82 ? "starter" : "backup";
  if (g === "D") {
    if (o >= 86) return "pair1";
    if (o >= 80) return "pair2";
    return "pair3";
  }
  if (o >= 86) return "line1";
  if (o >= 81) return "line2";
  if (o >= 75) return "line3";
  return "line4";
}

/** Young players grow. Old players get slower. This number says by how much. */
export function ageCurveModifier(age, position) {
  const g = posGroup(position);
  const peak = g === "G" ? 29 : g === "D" ? 28 : 27;
  if (age <= 18) return 1.35;
  if (age <= 21) return 1.2;
  if (age <= peak - 2) return 1.05;
  if (age <= peak + 1) return 0.35;
  if (age <= 33) return -0.55;
  if (age <= 36) return g === "G" ? -0.45 : -0.95;
  return g === "G" ? -0.8 : -1.35;
}

/** Empty stat line for a new season (goals, assists, wins...). */
export function emptySeasonStats(isGoalie) {
  if (isGoalie) {
    return { gp: 0, gs: 0, w: 0, l: 0, ot: 0, ga: 0, sa: 0, so: 0, toi: 0, gaa: 0, svpct: 0 };
  }
  return { gp: 0, g: 0, a: 0, p: 0, plusMinus: 0, pim: 0, ppp: 0, shg: 0, sog: 0, hits: 0, blocks: 0, foi: 0, fow: 0, toi: 0 };
}

/** Add two stat lines together, like season + playoffs. */
export function combineStats(a, b, isGoalie) {
  const out = { ...(a || emptySeasonStats(isGoalie)) };
  const add = b || emptySeasonStats(isGoalie);
  for (const k of Object.keys(add)) {
    if (k === "gaa" || k === "svpct") continue;
    out[k] = (out[k] || 0) + (add[k] || 0);
  }
  if (isGoalie) {
    out.gaa = out.gp ? (out.ga / Math.max(1, out.gp)) : 0;
    out.svpct = out.sa ? (out.sa - out.ga) / out.sa : 0;
  }
  return out;
}

/** Goals divided by shots. Higher means they bury their chances. */
export function shootingPct(stats) {
  if (!stats || !stats.sog) return 0;
  return (stats.g / stats.sog) * 100;
}

/** Do these linemates fit together? A sniper plus a passer is extra good. */
export function lineChemistry(players) {
  if (!players.length) return 50;
  const arch = players.map((p) => p.archetype);
  let score = 62;
  if (arch.includes("sniper") && arch.includes("playmaker")) score += 12;
  if (arch.includes("power") && arch.includes("sniper")) score += 6;
  if (arch.includes("twoWayF") || arch.includes("twoWayD")) score += 5;
  if (arch.filter((a) => a === "grinder").length >= 2) score += 4;
  if (arch.includes("offD") && arch.includes("defD")) score += 8;
  const nats = new Set(players.map((p) => p.nationality));
  if (nats.size === 1) score += 4;
  const ages = players.map((p) => p.age);
  const spread = Math.max(...ages) - Math.min(...ages);
  if (spread <= 5) score += 4;
  if (spread >= 14) score -= 5;
  const morale = players.reduce((s, p) => s + (p.morale || 70), 0) / players.length;
  score += (morale - 70) * 0.15;
  return clamp(Math.round(score), 35, 99);
}

/** How valuable this player is in a trade, like a baseball card's price. */
export function tradeValue(player, { needBonus = 1 } = {}) {
  if (!player) return 0;
  const o = player.ratings.overall;
  const age = player.age;
  const pot = player.potential?.ceiling || o;
  let v = o * o * 0.12;
  if (age <= 24) v *= 1.18 + Math.max(0, (pot - o) * 0.025);
  else if (age <= 28) v *= 1.08;
  else if (age <= 31) v *= 0.95;
  else if (age <= 34) v *= 0.72;
  else v *= 0.5;
  const years = player.contract?.yearsLeft || 0;
  const sal = player.contract?.salary || 0;
  const market = marketSalary(player);
  if (years && sal > market * 1.18) v *= 0.82;
  if (years && sal < market * 0.85 && years >= 2) v *= 1.1;
  if (player.contract?.nmc) v *= 0.9;
  if (player.injury) v *= 0.78;
  if (player.position === "C" || player.position === "G") v *= 1.08;
  if (player.potential?.category === "franchise") v *= 1.2;
  if (player.potential?.category === "elite") v *= 1.1;
  if ((player.morale || 70) < 45) v *= 0.9;
  return Math.round(v * needBonus);
}

/** Fair yearly pay for this player. Stars cost more. Kids on ELCs cost less. */
export function marketSalary(player) {
  const o = player.ratings.overall;
  const g = posGroup(player.position);
  let base;
  if (o >= 93) base = 12.5e6 + (o - 93) * 0.9e6;
  else if (o >= 89) base = 9.2e6 + (o - 89) * 0.8e6;
  else if (o >= 85) base = 6.8e6 + (o - 85) * 0.6e6;
  else if (o >= 81) base = 4.6e6 + (o - 81) * 0.55e6;
  else if (o >= 77) base = 2.8e6 + (o - 77) * 0.45e6;
  else if (o >= 73) base = 1.5e6 + (o - 73) * 0.32e6;
  else base = 0.775e6 + Math.max(0, o - 64) * 0.07e6;
  if (g === "G" && o >= 82) base *= 1.05;
  if (player.position === "C") base *= 1.06;
  if (player.age <= 23 && o < 82) base *= 0.55;
  if (player.age >= 35) base *= 0.78;
  if (player.potential?.category === "franchise" && player.age <= 24) base *= 1.12;
  return Math.round(base / 25000) * 25000;
}

/** How much a draft pick is worth. 1st round now is way better than a 7th later. */
export function pickValue(round, yearOffset = 0) {
  const table = [0, 2200, 900, 420, 220, 130, 80, 50];
  const base = table[round] || 30;
  return Math.round(base * Math.pow(0.92, yearOffset));
}
