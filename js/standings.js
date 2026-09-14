/**
 * The standings board.
 * Who has the most points, who makes the playoffs, and who leads the league in stats.
 */
import { DIVISIONS, CONFERENCES } from "./data/teams.js";
import { pointsOf } from "./utils.js";

/** Sort every team by points. Ties go to more wins, then goal difference. */
export function standingsList(state) {
  return Object.values(state.teams)
    .map((t) => ({
      team: t,
      gp: t.record.gp,
      w: t.record.w,
      l: t.record.l,
      ot: t.record.ot,
      pts: pointsOf(t.record),
      gf: t.record.gf,
      ga: t.record.ga,
      diff: t.record.gf - t.record.ga,
      row: t.record.w,
      ptsPct: t.record.gp ? pointsOf(t.record) / (t.record.gp * 2) : 0,
    }))
    .sort((a, b) => b.pts - a.pts || b.row - a.row || b.diff - a.diff);
}

/** Standings for just one division, like the Atlantic. */
export function divisionStandings(state, division) {
  return standingsList(state).filter((r) => r.team.division === division);
}

/** Standings for the East or the West. */
export function conferenceStandings(state, conf) {
  return standingsList(state).filter((r) => r.team.conference === conf);
}

/** Pick 8 playoff teams per conference: top 3 in each division, then 2 wild cards. */
export function playoffSeeds(state) {
  const seeds = { Eastern: [], Western: [] };
  for (const [conf, divs] of Object.entries(CONFERENCES)) {
    const top3 = [];
    for (const d of divs) top3.push(...divisionStandings(state, d).slice(0, 3));
    const top3Ids = new Set(top3.map((r) => r.team.id));
    const wc = conferenceStandings(state, conf).filter((r) => !top3Ids.has(r.team.id)).slice(0, 2);
    const field = [...top3, ...wc].sort((a, b) => b.pts - a.pts || b.row - a.row || b.diff - a.diff);
    seeds[conf] = field.slice(0, 8).map((r, i) => ({ ...r, seed: i + 1 }));
  }
  return seeds;
}

/** Top scorers, goalies, or whoever leads in a stat. */
export function leaders(state, key, posGroupFilter = null, n = 10, bucket = "season") {
  let list = Object.values(state.players).filter((p) => p.status === "nhl" || (p.stats[bucket]?.gp || 0) > 0);
  if (posGroupFilter === "G") list = list.filter((p) => p.position === "G");
  else if (posGroupFilter === "D") list = list.filter((p) => p.position === "LD" || p.position === "RD");
  else if (posGroupFilter === "F") list = list.filter((p) => ["C", "LW", "RW"].includes(p.position));
  return list
    .map((p) => ({ player: p, value: statValue(p, key, bucket), stats: p.stats[bucket] }))
    .filter((x) => x.stats && (x.stats.gp || 0) > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

/** Pull one number out of a player's stats (points, save %, goals against). */
function statValue(p, key, bucket) {
  const s = p.stats[bucket] || {};
  if (key === "p") return (s.g || 0) + (s.a || 0);
  if (key === "svpct") return s.sa ? (s.sa - s.ga) / s.sa : 0;
  if (key === "gaa") return s.gp ? -(s.ga / s.gp) : 0;
  return s[key] || 0;
}

/** Where your team sits in the league table. */
export function userRank(state) {
  const list = standingsList(state);
  const i = list.findIndex((r) => r.team.id === state.userTeamId);
  return { rank: i + 1, row: list[i], total: list.length };
}
