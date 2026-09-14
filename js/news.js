/**
 * The newspaper.
 * Stories about trades, injuries, and big wins show up on your home screen.
 */

/** Add a story to the top of the news list. We only keep the last 250. */
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

/** Grab the newest stories, maybe just for your team. */
export function recentNews(state, n = 8, teamId = null) {
  return state.news.filter((nws) => !teamId || nws.teamId === teamId || nws.type === "league").slice(0, n);
}

/** One-line score, like BOS 4–2 TOR in OT. */
export function gameHeadline(home, away, result) {
  const hw = result.homeGoals > result.awayGoals || (result.homeGoals === result.awayGoals && result.winner === "home");
  const winner = hw ? home : away;
  const loser = hw ? away : home;
  const ws = hw ? result.homeGoals : result.awayGoals;
  const ls = hw ? result.awayGoals : result.homeGoals;
  const extra = result.ot ? " in OT" : result.so ? " in a shootout" : "";
  return `${winner.abbr} ${ws}–${ls} ${loser.abbr}${extra}`;
}

/** Make up a trade rumor: a bad team might shop a star to a good team. */
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
