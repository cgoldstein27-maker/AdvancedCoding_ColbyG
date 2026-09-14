export function addNews(state, type, title, body, extra = {}) {
  const item = {
    id: state.nextNewsId++,
    day: state.day,
    season: state.season,
    type,
    title,
    body,
    teamId: extra.teamId || state.userTeamId,
    playerId: extra.playerId || null,
  };
  state.news.unshift(item);
  if (state.news.length > 250) state.news.length = 250;
  return item;
}

export function recentNews(state, n = 8, teamId = null) {
  return state.news.filter((nws) => !teamId || nws.teamId === teamId || nws.type === "league").slice(0, n);
}

export function gameHeadline(home, away, result) {
  const hw = result.homeGoals > result.awayGoals || (result.homeGoals === result.awayGoals && result.winner === "home");
  const winner = hw ? home : away;
  const loser = hw ? away : home;
  const ws = hw ? result.homeGoals : result.awayGoals;
  const ls = hw ? result.awayGoals : result.homeGoals;
  const extra = result.ot ? " in OT" : result.so ? " in a shootout" : "";
  return `${winner.abbr} ${ws}–${ls} ${loser.abbr}${extra}`;
}

export function rumorFor(state, rng) {
  const teams = Object.values(state.teams);
  const sellers = teams.filter((t) => t.philosophy === "rebuilding" || (t.record.gp > 20 && t.record.w / Math.max(1, t.record.gp) < 0.4));
  const buyers = teams.filter((t) => t.philosophy === "contending" || (t.record.gp > 20 && t.record.w / Math.max(1, t.record.gp) > 0.55));
  if (!sellers.length || !buyers.length) return null;
  const seller = rng.pick(sellers);
  const stars = seller.roster.map((id) => state.players[id]).filter((p) => p && p.age >= 28 && p.ratings.overall >= 80);
  if (!stars.length) return null;
  const p = rng.pick(stars);
  const buyer = rng.pick(buyers);
  return addNews(
    state,
    "rumor",
    `Rumor: ${p.name} available`,
    `Sources say the ${seller.displayName} have listened on ${p.name}. The ${buyer.displayName} could be a fit.`,
    { teamId: seller.id, playerId: p.id }
  );
}
