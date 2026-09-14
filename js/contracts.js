import { marketSalary, expectedRole } from "./players.js";
import { clamp, DIFFICULTY } from "./utils.js";
import { addNews } from "./news.js";

export function playerDemand(state, player, teamId) {
  const team = state.teams[teamId];
  const diff = DIFFICULTY[state.settings.difficulty] || DIFFICULTY.normal;
  let salary = marketSalary(player) * diff.contractDemand;
  const role = expectedRole(player);
  const ptsPct = teamPointsPct(team);
  if (player.faPriority === "money" || player.personality.greed > 70) salary *= 1.12;
  if (player.faPriority === "winning" && ptsPct < 0.5) salary *= 1.08;
  if (player.faPriority === "winning" && ptsPct > 0.6) salary *= 0.94;
  if (player.morale < 50) salary *= 1.08;
  if (player.personality.loyalty > 75 && player.teamId === teamId) salary *= 0.92;
  if (team.marketSize === "large" && player.faPriority === "location") salary *= 0.95;
  if (team.philosophy === "rebuilding" && player.age >= 30) salary *= 1.1;
  if (player.age <= 27 && player.potential.category === "franchise") salary *= 1.08;
  salary = Math.round(salary / 25000) * 25000;
  let years = player.age >= 34 ? 1 : player.age >= 31 ? 2 : player.age <= 24 ? 6 : 4;
  if (player.faPriority === "term") years += 1;
  if (player.age <= 22) years = Math.min(3, years);
  const ntc = player.age >= 30 && salary >= 5.5e6;
  const nmc = player.age >= 32 && salary >= 7e6;
  return { salary, years: clamp(years, 1, 8), ntc, nmc, twoWay: player.ratings.overall < 73 };
}

export function evaluateOffer(state, player, teamId, offer) {
  const demand = playerDemand(state, player, teamId);
  const team = state.teams[teamId];
  let score = 50;
  const salRatio = offer.salary / demand.salary;
  score += (salRatio - 1) * 80;
  score += (offer.years - demand.years) * 4;
  if (offer.ntc && demand.ntc) score += 6;
  if (!offer.ntc && demand.ntc) score -= 10;
  if (offer.nmc && demand.nmc) score += 8;
  if (!offer.nmc && demand.nmc) score -= 12;
  if (player.faPriority === "winning") {
    score += (teamPointsPct(team) - 0.5) * 40;
  }
  if (player.faPriority === "role") {
    const expected = expectedRole(player);
    score += { line1: 8, pair1: 8, starter: 10, line2: 4, pair2: 4 }[expected] || 0;
  }
  if (player.personality.loyalty > 70 && player.teamId === teamId) score += 8;
  if (team.marketSize === "large") score += 3;
  if ((player.morale || 70) < 45 && player.teamId === teamId) score -= 12;
  const accept = score >= 52;
  return { accept, score, demand, message: accept ? "The player is ready to sign." : offerReply(score) };
}

function offerReply(score) {
  if (score >= 48) return "Close — wants a bit more term or money.";
  if (score >= 40) return "Not interested at this number.";
  if (score >= 30) return "The ask is well above this offer.";
  return "The player’s camp hung up. Far apart.";
}

export function applyContract(state, player, teamId, offer) {
  player.teamId = teamId;
  player.status = player.ratings.overall >= 72 || offer.twoWay === false ? "nhl" : "minors";
  player.contract = {
    salary: offer.salary,
    years: offer.years,
    yearsLeft: offer.years,
    type: offer.salary > 7e6 ? "star" : offer.salary <= 925000 && player.age <= 22 ? "elc" : "standard",
    ntc: !!offer.ntc,
    nmc: !!offer.nmc,
    signingBonus: Math.round(offer.salary * 0.1),
    bonuses: 0,
    twoWay: !!offer.twoWay,
    expiry: player.age + offer.years >= 27 ? "ufa" : "rfa",
  };
  player.morale = clamp((player.morale || 70) + 8, 20, 99);
  const team = state.teams[teamId];
  if (player.status === "nhl" && !team.roster.includes(player.id)) {
    team.minors = team.minors.filter((id) => id !== player.id);
    team.prospects = team.prospects.filter((id) => id !== player.id);
    team.roster.push(player.id);
  } else if (player.status !== "nhl" && !team.minors.includes(player.id) && !team.prospects.includes(player.id)) {
    team.minors.push(player.id);
  }
}

export function expireContracts(state, rng, news) {
  for (const p of Object.values(state.players)) {
    if (!p.contract || p.status === "retired") continue;
    p.contract.yearsLeft = Math.max(0, (p.contract.yearsLeft || 0) - 1);
    if (p.contract.yearsLeft > 0) continue;
    const teamId = p.teamId;
    const team = teamId ? state.teams[teamId] : null;
    if (p.age >= 37 && rng.chance(0.35 + (p.age - 37) * 0.12)) {
      retirePlayer(state, p, news);
      continue;
    }
    p.contract.salary = 0;
    p.contract.years = 0;
    p.status = "fa";
    p.faPriority = rng.pick(["money", "winning", "role", "location", "term"]);
    if (team) {
      team.roster = team.roster.filter((id) => id !== p.id);
      team.minors = team.minors.filter((id) => id !== p.id);
      team.prospects = team.prospects.filter((id) => id !== p.id);
      p.teamId = null;
      if (p.ratings.overall >= 80) {
        news.push(addNews(state, "fa", `${p.name} hits the open market`, `${p.name} (${p.ratings.overall} OVR) is an unrestricted free agent.`));
      }
    }
  }
}

export function retirePlayer(state, p, news) {
  const team = p.teamId ? state.teams[p.teamId] : null;
  if (team) {
    team.roster = team.roster.filter((id) => id !== p.id);
    team.minors = team.minors.filter((id) => id !== p.id);
    team.prospects = team.prospects.filter((id) => id !== p.id);
  }
  p.status = "retired";
  p.teamId = null;
  if (p.ratings.overall >= 82 || (p.stats.career?.p || 0) > 600) {
    news.push(addNews(state, "legacy", `${p.name} retires`, `A career that spanned ${p.yearsPro} seasons comes to a close.`));
    state.history.hall.push({ id: p.id, name: p.name, year: state.season, ovr: p.ratings.overall });
  }
}

function teamPointsPct(team) {
  const gp = team.record.gp || 0;
  if (!gp) return 0.5;
  return (team.record.w * 2 + team.record.ot) / (gp * 2);
}

export function extensionInterest(player, teamId, state) {
  if (!player.contract || player.contract.yearsLeft !== 1) return false;
  if (player.age >= 37) return false;
  if (player.personality.loyalty < 40 && player.morale < 50) return false;
  return player.teamId === teamId;
}
