/**
 * The piggy bank and the salary cap.
 * The cap is a money ceiling. You cannot pay everyone too much.
 */
import { formatCap } from "./utils.js";

/** How much this player's contract counts against the cap. */
export function capHitOf(player) {
  if (!player?.contract) return 0;
  return player.contract.salary || 0;
}

/** Add up NHL salaries, leftover retained money, and buried minors deals. */
export function teamPayroll(state, teamId) {
  const team = state.teams[teamId];
  const nhl = team.roster.map((id) => state.players[id]).filter(Boolean);
  const rosterHit = nhl.reduce((s, p) => s + capHitOf(p), 0);
  const retained = (team.retained || []).reduce((s, r) => s + r.amount, 0);
  const buried = team.minors
    .map((id) => state.players[id])
    .filter((p) => p && p.contract && !p.contract.twoWay && p.contract.salary > 1.15e6)
    .reduce((s, p) => s + Math.max(0, p.contract.salary - 1.15e6), 0);
  return { rosterHit, retained, buried, total: rosterHit + retained + buried };
}

/** Room left under the salary cap. Negative means you are over. */
export function capSpace(state, teamId) {
  const cap = state.settings.salaryCap;
  const pay = teamPayroll(state, teamId);
  return cap - pay.total;
}

/** Count forwards, defense, and goalies on the NHL roster. */
export function rosterCounts(state, teamId) {
  const team = state.teams[teamId];
  const players = team.roster.map((id) => state.players[id]).filter(Boolean);
  const f = players.filter((p) => ["C", "LW", "RW"].includes(p.position)).length;
  const d = players.filter((p) => p.position === "LD" || p.position === "RD").length;
  const g = players.filter((p) => p.position === "G").length;
  return { total: players.length, f, d, g };
}

/** Yellow and red flags: over the cap, too many players, no starter... */
export function capWarnings(state, teamId) {
  const warnings = [];
  const pay = teamPayroll(state, teamId);
  const space = state.settings.salaryCap - pay.total;
  const counts = rosterCounts(state, teamId);
  if (space < 0 && (state.phase === "regular" || state.phase === "preseason" || state.phase === "deadline")) {
    warnings.push({ level: "bad", text: `Over the salary cap by ${formatCap(-space)}` });
  } else if (space < 1.5e6) {
    warnings.push({ level: "warn", text: `Tight cap: ${formatCap(space)} remaining` });
  }
  if (counts.total > 23) warnings.push({ level: "bad", text: `NHL roster has ${counts.total} players (max 23)` });
  if (counts.total < 20 && state.phase === "regular") warnings.push({ level: "bad", text: `NHL roster has only ${counts.total} players` });
  if (counts.g < 2) warnings.push({ level: "warn", text: "Need two goaltenders on the roster" });
  if (counts.f < 12) warnings.push({ level: "warn", text: "Short on forwards" });
  if (counts.d < 6) warnings.push({ level: "warn", text: "Short on defensemen" });
  const lines = state.teams[teamId].lines;
  if (!lines.starter) warnings.push({ level: "bad", text: "No starting goaltender set" });
  const f1 = (lines.f1 || []).filter(Boolean).length;
  if (f1 < 3) warnings.push({ level: "warn", text: "Incomplete first line" });
  return warnings;
}

/** Ticket money in, salaries out, and whether you made a profit. */
export function teamFinances(state, teamId) {
  const team = state.teams[teamId];
  const pay = teamPayroll(state, teamId);
  const market = { large: 1.18, medium: 1, small: 0.82 }[team.marketSize] || 1;
  const winBonus = (team.record.w || 0) * 0.12e6;
  const attend = team.attendance || 0.8;
  const revenue = Math.round(team.budget * 0.72 * market * attend + winBonus);
  const expenses = pay.total + 18e6;
  return {
    ...pay,
    cap: state.settings.salaryCap,
    space: state.settings.salaryCap - pay.total,
    revenue,
    expenses,
    profit: revenue - expenses,
    budget: team.budget,
    attendance: attend,
  };
}

/** Keep paying part of a traded player's salary so the other team can afford him. */
export function addRetained(state, teamId, player, pct) {
  const team = state.teams[teamId];
  team.retained = team.retained || [];
  if (team.retained.length >= 3) return { ok: false, error: "Already retaining three contracts." };
  const amount = Math.round(player.contract.salary * pct);
  if (pct > 0.5) return { ok: false, error: "Can retain at most 50%." };
  team.retained.push({
    playerId: player.id,
    name: player.name,
    amount,
    yearsLeft: player.contract.yearsLeft,
    pct,
  });
  player.contract.salary = Math.round(player.contract.salary * (1 - pct));
  return { ok: true };
}
