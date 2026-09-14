import { tradeValue, pickValue, marketSalary } from "./players.js";
import { capSpace, addRetained } from "./finances.js";
import { DIFFICULTY, clamp, posGroup } from "./utils.js";
import { addNews } from "./news.js";
import { autoLines } from "./generation.js";

export function assetValue(state, asset, forTeamId) {
  if (asset.kind === "player") {
    const p = state.players[asset.id];
    const team = state.teams[forTeamId];
    const need = positionalNeed(state, forTeamId, p.position);
    const phil = team.philosophy;
    let bonus = 1;
    if (phil === "rebuilding") {
      if (p.age <= 24) bonus += 0.18;
      if (p.age >= 31) bonus -= 0.22;
      if ((p.potential?.ceiling || 0) - p.ratings.overall >= 8) bonus += 0.15;
    }
    if (phil === "contending") {
      if (p.age >= 27 && p.age <= 32 && p.ratings.overall >= 82) bonus += 0.16;
      if (p.age <= 21 && p.ratings.overall < 75) bonus -= 0.1;
    }
    bonus += need * 0.12;
    return tradeValue(p, { needBonus: bonus });
  }
  if (asset.kind === "pick") {
    const pick = findPick(state, asset.id);
    if (!pick) return 0;
    const yearOffset = pick.year - state.season;
    let v = pickValue(pick.round, yearOffset);
    const owner = state.teams[forTeamId];
    if (owner.philosophy === "rebuilding") v *= 1.2;
    if (owner.philosophy === "contending" && pick.round === 1 && yearOffset === 0) v *= 0.9;
    return v;
  }
  return 0;
}

export function findPick(state, pickId) {
  for (const t of Object.values(state.teams)) {
    const p = t.picks.find((x) => x.id === pickId);
    if (p) return p;
  }
  return null;
}

export function positionalNeed(state, teamId, position) {
  const players = state.teams[teamId].roster.map((id) => state.players[id]).filter(Boolean);
  const g = posGroup(position);
  const same = players.filter((p) => posGroup(p.position) === g);
  const top = same.sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
  if (!top) return 1.4;
  if (top.ratings.overall < 78) return 1.2;
  if (same.length < (g === "G" ? 2 : g === "D" ? 6 : 10)) return 1.1;
  if (g === "G" && same[0].ratings.overall < 82) return 1.15;
  return 0.85;
}

export function evaluateTrade(state, fromId, toId, give, get, retainPct = 0) {
  const diff = DIFFICULTY[state.settings.difficulty] || DIFFICULTY.normal;
  const giveV = give.reduce((s, a) => s + assetValue(state, a, toId), 0);
  const getV = get.reduce((s, a) => s + assetValue(state, a, toId), 0);
  const ratio = getV <= 0 ? 99 : giveV / getV;
  const cpu = state.teams[toId];
  let threshold = diff.tradeAccept;
  if (cpu.philosophy === "rebuilding") {
    const youngIn = give.filter((a) => a.kind === "player" && state.players[a.id]?.age <= 24).length;
    const picksIn = give.filter((a) => a.kind === "pick").length;
    if (youngIn + picksIn >= 1) threshold -= 0.06;
  }
  let accept = ratio >= threshold;
  const capOk = tradeCapOk(state, fromId, toId, give, get);
  if (!capOk.ok) accept = false;

  for (const a of get) {
    if (a.kind === "player") {
      const p = state.players[a.id];
      if (p?.contract?.nmc) return { accept: false, ratio, response: "REJECT", message: `${p.name} has a no-movement clause.`, counter: null };
      if (p?.contract?.ntc && p.teamId !== fromId) {
        /* CPU listing their own NTC player — they can still move him */
      }
    }
  }
  for (const a of give) {
    if (a.kind === "player") {
      const p = state.players[a.id];
      if (p?.contract?.nmc && fromId === state.userTeamId) {
        return { accept: false, ratio, response: "REJECT", message: `${p.name} has a no-movement clause.`, counter: null };
      }
    }
  }

  if (obviouslyStupid(state, toId, give, get)) {
    accept = false;
  }

  let counter = null;
  let response = accept ? "ACCEPT" : "REJECT";
  if (!accept && ratio >= threshold * 0.78 && capOk.ok) {
    counter = buildCounter(state, fromId, toId, give, get, rngFrom(state));
    if (counter) response = "COUNTER";
  }
  const message = accept
    ? "The other GM agrees to the deal."
    : response === "COUNTER"
      ? "They will do it with a tweak."
      : ratio < 0.7
        ? "They hung up. Not even close."
        : "They don't like the return enough.";
  return { accept, ratio, response, message, counter, giveV, getV };
}

function obviouslyStupid(state, cpuId, give, get) {
  const cpuGets = give.filter((a) => a.kind === "player").map((a) => state.players[a.id]);
  const cpuGives = get.filter((a) => a.kind === "player").map((a) => state.players[a.id]);
  for (const p of cpuGives) {
    if (!p) continue;
    if (p.age <= 23 && p.ratings.overall >= 84 && cpuGets.every((x) => !x || x.ratings.overall < 80)) return true;
    if (p.potential?.category === "franchise" && p.age <= 24 && cpuGets.every((x) => !x || x.age > 30)) return true;
  }
  return false;
}

function tradeCapOk(state, fromId, toId, give, get) {
  const salaryOut = (id, assets) =>
    assets.filter((a) => a.kind === "player").reduce((s, a) => s + (state.players[a.id]?.contract?.salary || 0), 0);
  const fromSpace = capSpace(state, fromId) + salaryOut(fromId, give) - salaryOut(fromId, get);
  const toSpace = capSpace(state, toId) + salaryOut(toId, get) - salaryOut(toId, give);
  if (toSpace < -1.5e6) return { ok: false, error: "They cannot fit the salary." };
  if (fromId === state.userTeamId && fromSpace < -2.5e6) return { ok: false, error: "You cannot fit the salary." };
  return { ok: true };
}

function buildCounter(state, userId, cpuId, give, get, rng) {
  const cpu = state.teams[cpuId];
  const extraPick = cpu.picks.find((p) => p.round >= 2 && p.year === state.season);
  if (extraPick && rng.chance(0.5)) {
    return { give: give.slice(), get: [...get, { kind: "pick", id: extraPick.id }] };
  }
  const cheap = cpu.roster
    .map((id) => state.players[id])
    .filter((p) => p && p.ratings.overall < 76 && p.age >= 27)
    .sort((a, b) => a.contract.salary - b.contract.salary)[0];
  if (cheap) return { give: [...give, { kind: "player", id: cheap.id }], get: get.slice() };
  const userExtra = state.teams[userId].picks.find((p) => p.round >= 3);
  if (userExtra) return { give: give.slice(), get: [...get, { kind: "pick", id: userExtra.id }] };
  return null;
}

export function executeTrade(state, fromId, toId, give, get, retainPct = 0) {
  const move = (asset, src, dst) => {
    if (asset.kind === "player") {
      const p = state.players[asset.id];
      const srcT = state.teams[src];
      const dstT = state.teams[dst];
      srcT.roster = srcT.roster.filter((id) => id !== p.id);
      srcT.minors = srcT.minors.filter((id) => id !== p.id);
      srcT.prospects = srcT.prospects.filter((id) => id !== p.id);
      if (retainPct && src === fromId && p.contract?.salary) addRetained(state, src, p, retainPct);
      p.teamId = dst;
      if (p.status === "prospect") dstT.prospects.push(p.id);
      else if (p.status === "minors") dstT.minors.push(p.id);
      else {
        p.status = "nhl";
        dstT.roster.push(p.id);
      }
      p.morale = clamp((p.morale || 70) + (dst === state.userTeamId ? 2 : -4), 20, 99);
      p.tradeRequest = false;
    } else if (asset.kind === "pick") {
      const srcT = state.teams[src];
      const dstT = state.teams[dst];
      const idx = srcT.picks.findIndex((x) => x.id === asset.id);
      if (idx >= 0) {
        const pick = srcT.picks.splice(idx, 1)[0];
        pick.owner = dst;
        dstT.picks.push(pick);
      }
    }
  };
  for (const a of give) move(a, fromId, toId);
  for (const a of get) move(a, toId, fromId);
  autoLines(state, fromId);
  autoLines(state, toId);
  const names = (arr, tid) =>
    arr
      .map((a) => (a.kind === "player" ? state.players[a.id]?.name : pickLabel(state, a.id)))
      .filter(Boolean)
      .join(", ");
  addNews(
    state,
    "trade",
    `Trade: ${state.teams[fromId].abbr} ⇄ ${state.teams[toId].abbr}`,
    `${state.teams[fromId].abbr} send ${names(give) || "assets"} to ${state.teams[toId].abbr} for ${names(get) || "assets"}.`,
    { teamId: fromId }
  );
  if (fromId === state.userTeamId) state.legacy.trades++;
  return true;
}

export function pickLabel(state, pickId) {
  const p = findPick(state, pickId);
  if (!p) return "Pick";
  const orig = p.original !== p.owner ? ` (${state.teams[p.original]?.abbr})` : "";
  return `${p.year} ${roundName(p.round)}${orig}`;
}

function roundName(r) {
  return ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th"][r] || `${r}th`;
}

export function valueLabel(ratio) {
  if (ratio >= 1.28) return { text: "Heavily in your favor", tone: "gold" };
  if (ratio >= 1.12) return { text: "In your favor", tone: "green" };
  if (ratio >= 0.96) return { text: "Evenly matched", tone: "ice" };
  if (ratio >= 0.84) return { text: "Slightly in their favor", tone: "warn" };
  return { text: "Lopsided against you", tone: "bad" };
}

function rngFrom(state) {
  const { RNG } = { RNG: class {
    constructor() { this.n = (state.day + state.season) % 997; }
    chance(p) { this.n = (this.n * 9301 + 49297) % 233280; return this.n / 233280 < p; }
  } };
  return new RNG();
}

export function cpuDeadlineActivity(state, rng) {
  const teams = Object.values(state.teams).filter((t) => t.id !== state.userTeamId);
  const sellers = teams.filter((t) => t.philosophy === "rebuilding" || pointsPct(t) < 0.42);
  const buyers = teams.filter((t) => t.philosophy === "contending" || pointsPct(t) > 0.58);
  let deals = 0;
  for (let i = 0; i < 5; i++) {
    if (!sellers.length || !buyers.length) break;
    const seller = rng.pick(sellers);
    const buyer = rng.pick(buyers);
    const rental = seller.roster
      .map((id) => state.players[id])
      .filter((p) => p && p.age >= 28 && p.ratings.overall >= 78 && p.contract.yearsLeft <= 1)
      .sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
    const pick = buyer.picks.find((p) => p.round === 1 && p.year === state.season) || buyer.picks.find((p) => p.round === 2);
    if (!rental || !pick) continue;
    executeTrade(state, seller.id, buyer.id, [{ kind: "player", id: rental.id }], [{ kind: "pick", id: pick.id }]);
    deals++;
  }
  return deals;
}

function pointsPct(t) {
  if (!t.record.gp) return 0.5;
  return (t.record.w * 2 + t.record.ot) / (t.record.gp * 2);
}

export { roundName };
