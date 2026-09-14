/**
 * End-of-year trophies.
 * MVP, scoring champ, best goalie, and how good your franchise looks on the history page.
 */
import { leaders } from "./standings.js";
import { addNews } from "./news.js";

export const AWARDS = [
  { id: "mvp", name: "Crown Jewel", desc: "League MVP" },
  { id: "scoring", name: "Gold Stick", desc: "Scoring champion" },
  { id: "goalie", name: "Iron Mask", desc: "Top goaltender" },
  { id: "defense", name: "Blueline Trophy", desc: "Top defenseman" },
  { id: "rookie", name: "First Light", desc: "Top rookie" },
  { id: "selke", name: "Two-Way Shield", desc: "Best defensive forward" },
  { id: "coach", name: "Bench Boss", desc: "Coach of the year" },
];

/** Hand out every trophy and put winners in the news. */
export function presentAwards(state) {
  const winners = {};
  const skaters = leaders(state, "p", null, 30).filter((x) => x.player.position !== "G");
  const mvp = skaters[0];
  if (mvp) {
    winners.mvp = mvp.player;
    mvp.player.awards.push({ season: state.season, name: "Crown Jewel" });
  }
  if (skaters[0]) {
    winners.scoring = skaters[0].player;
    skaters[0].player.awards.push({ season: state.season, name: "Gold Stick" });
  }
  const goalies = Object.values(state.players)
    .filter((p) => p.position === "G" && (p.stats.season?.gp || 0) >= 20)
    .sort((a, b) => {
      const as = a.stats.season;
      const bs = b.stats.season;
      const asv = as.sa ? (as.sa - as.ga) / as.sa : 0;
      const bsv = bs.sa ? (bs.sa - bs.ga) / bs.sa : 0;
      return bsv - asv || as.gaa - bs.gaa;
    });
  if (goalies[0]) {
    winners.goalie = goalies[0];
    goalies[0].awards.push({ season: state.season, name: "Iron Mask" });
  }
  const dmen = leaders(state, "p", "D", 10);
  if (dmen[0]) {
    winners.defense = dmen[0].player;
    dmen[0].player.awards.push({ season: state.season, name: "Blueline Trophy" });
  }
  const rookies = Object.values(state.players)
    .filter((p) => p.yearsPro <= 1 && (p.stats.season?.gp || 0) >= 20 && p.position !== "G")
    .sort((a, b) => (b.stats.season.p || 0) - (a.stats.season.p || 0));
  if (rookies[0]) {
    winners.rookie = rookies[0];
    rookies[0].awards.push({ season: state.season, name: "First Light" });
  }
  const selke = Object.values(state.players)
    .filter((p) => ["C", "LW", "RW"].includes(p.position) && (p.stats.season?.gp || 0) >= 40)
    .sort((a, b) => b.ratings.defAwareness + (b.stats.season.plusMinus || 0) / 5 - (a.ratings.defAwareness + (a.stats.season.plusMinus || 0) / 5));
  if (selke[0]) {
    winners.selke = selke[0];
    selke[0].awards.push({ season: state.season, name: "Two-Way Shield" });
  }
  const coach = Object.values(state.teams).sort((a, b) => b.record.w - a.record.w)[0];
  winners.coach = coach;
  state.history.awards.push({ season: state.season, winners: Object.fromEntries(Object.entries(winners).map(([k, v]) => [k, v.id || v.abbr || v.name])) });
  for (const a of AWARDS) {
    const w = winners[a.id];
    if (!w) continue;
    const name = w.displayName || w.name || w.coach?.name;
    addNews(state, "award", `${a.name}: ${name}`, a.desc);
  }
  return winners;
}

/** Add points to your franchise score for wins, playoffs, and Cups. */
export function updateLegacy(state, madePlayoffs, champion) {
  const t = state.teams[state.userTeamId];
  const pct = t.record.gp ? (t.record.w * 2 + t.record.ot) / (t.record.gp * 2) : 0;
  state.legacy.score += Math.round(pct * 220);
  if (madePlayoffs) state.legacy.score += 180;
  if (champion) state.legacy.score += 1600;
  state.legacy.score += Math.round((t.chemistry || 60) * 0.4);
  state.history.userSeasons.push({
    season: state.season,
    record: { ...t.record },
    pts: t.record.w * 2 + t.record.ot,
    playoffs: madePlayoffs,
    cup: champion === state.userTeamId,
  });
}
