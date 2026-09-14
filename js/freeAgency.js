/**
 * Free agency is musical chairs for unsigned players.
 * You offer money. Other teams offer money. The player picks who they like.
 */
import { playerDemand, evaluateOffer, applyContract } from "./contracts.js";
import { capSpace } from "./finances.js";
import { autoLines, getFreeAgents } from "./generation.js";
import { addNews } from "./news.js";
import { marketSalary } from "./players.js";

/** Unsigned players, best overall first. */
export function faBoard(state) {
  return getFreeAgents(state).sort((a, b) => b.ratings.overall - a.ratings.overall);
}

/** You make an offer. If they like it, they sign right now. */
export function makeOfferToFA(state, playerId, offer) {
  const p = state.players[playerId];
  if (!p || p.status !== "fa") return { ok: false, error: "Player is not a free agent." };
  const space = capSpace(state, state.userTeamId);
  if (offer.salary > space + 1e6) return { ok: false, error: "Not enough cap space." };
  const ev = evaluateOffer(state, p, state.userTeamId, offer);
  state.faOffers[playerId] = state.faOffers[playerId] || [];
  state.faOffers[playerId].push({ teamId: state.userTeamId, offer, score: ev.score, day: state.day });
  if (ev.accept) {
    applyContract(state, p, state.userTeamId, offer);
    autoLines(state, state.userTeamId);
    addNews(state, "fa", `${p.name} signs with ${state.teams[state.userTeamId].abbr}`, `${formatTerm(offer)}`);
    state.legacy.faSignings++;
    return { ok: true, signed: true, message: `${p.name} has agreed to terms.` };
  }
  return { ok: true, signed: false, message: ev.message, demand: ev.demand };
}

/** Write the deal like "4 years at $8.00M AAV". */
function formatTerm(offer) {
  const m = offer.salary / 1e6;
  return `${offer.years} year${offer.years > 1 ? "s" : ""} at $${m.toFixed(2)}M AAV`;
}

/** Computer teams grab leftover free agents, unless your offer is still better. */
export function simulateFADay(state, rng) {
  const fas = faBoard(state).filter((p) => p.status === "fa");
  const teams = Object.values(state.teams);
  for (const p of fas.slice(0, 40)) {
    if (p.status !== "fa") continue;
    if (rng.chance(0.55)) continue;
    const interested = teams.filter((t) => {
      if (t.id === state.userTeamId) return false;
      if (capSpace(state, t.id) < marketSalary(p) * 0.8) return false;
      if (t.philosophy === "rebuilding" && p.age >= 31) return rng.chance(0.15);
      if (t.philosophy === "contending" && p.ratings.overall < 74) return rng.chance(0.2);
      return rng.chance(0.35 + p.ratings.overall / 400);
    });
    if (!interested.length) continue;
    const team = rng.pick(interested);
    const demand = playerDemand(state, p, team.id);
    const offer = {
      salary: Math.round(demand.salary * rng.float(0.95, 1.08) / 25000) * 25000,
      years: demand.years,
      ntc: demand.ntc,
      nmc: demand.nmc,
      twoWay: demand.twoWay,
    };
    const userOffers = (state.faOffers[p.id] || []).filter((o) => o.teamId === state.userTeamId);
    const userBest = userOffers.sort((a, b) => b.score - a.score)[0];
    const cpuScore = evaluateOffer(state, p, team.id, offer).score + (p.faPriority === "winning" && team.philosophy === "contending" ? 6 : 0);
    if (userBest && userBest.score >= cpuScore + 3) {
      continue;
    }
    if (userBest && userBest.score >= cpuScore - 2 && rng.chance(0.4)) continue;
    applyContract(state, p, team.id, offer);
    autoLines(state, team.id);
    if (p.ratings.overall >= 80) {
      addNews(state, "fa", `${p.name} signs with ${team.abbr}`, formatTerm(offer), { teamId: team.id, playerId: p.id });
    }
  }
  resolveUserOffers(state, rng);
}

/** Sometimes a player sleeps on your offer and signs the next day. */
function resolveUserOffers(state, rng) {
  for (const [pid, offers] of Object.entries(state.faOffers)) {
    const p = state.players[pid];
    if (!p || p.status !== "fa") continue;
    const mine = offers.filter((o) => o.teamId === state.userTeamId).pop();
    if (!mine) continue;
    if (mine.day < state.day - 1 && mine.score >= 50 && rng.chance(0.35)) {
      applyContract(state, p, state.userTeamId, mine.offer);
      autoLines(state, state.userTeamId);
      addNews(state, "fa", `${p.name} signs with ${state.teams[state.userTeamId].abbr}`, formatTerm(mine.offer));
    }
  }
}

/** Flip the calendar to free agency and clear old offers. */
export function startFreeAgency(state) {
  state.phase = "freeAgency";
  state.faDay = 1;
  state.faOffers = {};
  addNews(state, "fa", "Free agency opens", "Teams around the league are lining up offers.");
}
