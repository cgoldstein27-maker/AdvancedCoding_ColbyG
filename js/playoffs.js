import { playoffSeeds } from "./standings.js";
import { simulateGame } from "./simulation.js";
import { addNews } from "./news.js";
import { uid } from "./utils.js";
import { autoLines } from "./generation.js";

export function startPlayoffs(state) {
  const seeds = playoffSeeds(state);
  const makeRound = (conf, list) => {
    const pairs = [
      [list[0], list[7]],
      [list[1], list[6]],
      [list[2], list[5]],
      [list[3], list[4]],
    ];
    return pairs.filter((p) => p[0] && p[1]).map((p) => series(p[0].team.id, p[1].team.id, conf, "R1"));
  };
  state.playoffs = {
    seeds,
    round: "R1",
    rounds: {
      R1: { Eastern: makeRound("Eastern", seeds.Eastern), Western: makeRound("Western", seeds.Western) },
      R2: { Eastern: [], Western: [] },
      CF: { Eastern: [], Western: [] },
      SCF: { Eastern: [], Western: [] },
    },
    champion: null,
    playoffMvp: null,
  };
  state.phase = "playoffs";
  const userIn = [...seeds.Eastern, ...seeds.Western].some((s) => s.team.id === state.userTeamId);
  addNews(
    state,
    "playoffs",
    "Playoffs begin",
    userIn ? "Your club is in the field. Four wins at a time." : "Your season ends here. The second season starts without you."
  );
  if (userIn) state.legacy.playoffApps++;
  return userIn;
}

function series(a, b, conf, round) {
  return {
    id: uid("sr"),
    home: a,
    away: b,
    conf,
    round,
    wins: { [a]: 0, [b]: 0 },
    games: [],
    winner: null,
    homeIce: a,
  };
}

function homeForGame(series, gameNum) {
  const h = series.homeIce;
  const a = series.home === h ? series.away : series.home;
  const map = { 1: h, 2: h, 3: a, 4: a, 5: h, 6: a, 7: h };
  return map[gameNum];
}

export function simulateSeriesGame(state, series, rng) {
  if (series.winner) return null;
  const n = series.games.length + 1;
  const home = homeForGame(series, n);
  const away = home === series.home ? series.away : series.home;
  autoLines(state, home);
  autoLines(state, away);
  const game = { id: uid("pg"), day: state.day, home, away, played: false, result: null, type: "playoff" };
  const result = simulateGame(state, game, rng);
  series.games.push(game);
  const winner = result.winner === "home" ? home : away;
  series.wins[winner]++;
  if (series.wins[winner] >= 4) {
    series.winner = winner;
    addNews(state, "playoffs", `${state.teams[winner].abbr} win the series`, `${series.wins[series.home]}–${series.wins[series.away]} over ${state.teams[home === winner ? away : home].abbr}.`, { teamId: winner });
  }
  return game;
}

export function simulateSeries(state, series, rng) {
  const games = [];
  while (!series.winner) games.push(simulateSeriesGame(state, series, rng));
  return games;
}

export function advancePlayoffRound(state, rng) {
  const po = state.playoffs;
  const round = po.round;
  const all = [...po.rounds[round].Eastern, ...po.rounds[round].Western, ...(po.rounds[round].league || [])];
  for (const s of all) if (!s.winner) simulateSeries(state, s, rng);

  if (round === "R1") {
    po.rounds.R2.Eastern = pairWinners(po.rounds.R1.Eastern, "Eastern", "R2");
    po.rounds.R2.Western = pairWinners(po.rounds.R1.Western, "Western", "R2");
    po.round = "R2";
  } else if (round === "R2") {
    po.rounds.CF.Eastern = pairWinners(po.rounds.R2.Eastern, "Eastern", "CF");
    po.rounds.CF.Western = pairWinners(po.rounds.R2.Western, "Western", "CF");
    po.round = "CF";
  } else if (round === "CF") {
    const e = po.rounds.CF.Eastern[0]?.winner;
    const w = po.rounds.CF.Western[0]?.winner;
    po.rounds.SCF.league = [series(e, w, "League", "SCF")];
    po.round = "SCF";
  } else if (round === "SCF") {
    const champ = po.rounds.SCF.league[0].winner;
    po.champion = champ;
    crownChampion(state, champ);
    po.round = "done";
  }
}

function pairWinners(seriesList, conf, round) {
  const winners = seriesList.map((s) => s.winner).filter(Boolean);
  const out = [];
  for (let i = 0; i < winners.length; i += 2) {
    if (winners[i + 1]) out.push(series(winners[i], winners[i + 1], conf, round));
  }
  return out;
}

function crownChampion(state, teamId) {
  const team = state.teams[teamId];
  team.history.cups++;
  state.history.champions.push({ season: state.season, teamId, name: team.displayName });
  addNews(state, "cup", `${team.displayName} win the Northwind Cup`, `Champions of ${state.season}–${String(state.season + 1).slice(2)}.`, { teamId });
  if (teamId === state.userTeamId) {
    state.legacy.cups++;
    state.legacy.score += 1800;
    state.owner.confidence = Math.min(99, state.owner.confidence + 25);
  }
  const skaters = team.roster.map((id) => state.players[id]).filter((p) => p && p.position !== "G");
  const mvp = skaters.sort((a, b) => (b.stats.playoffs?.p || 0) - (a.stats.playoffs?.p || 0))[0];
  if (mvp) {
    state.playoffs.playoffMvp = mvp.id;
    mvp.awards.push({ season: state.season, name: "Playoff Crown" });
    addNews(state, "award", `${mvp.name} named Playoff Crown`, "The postseason's outstanding performer.");
  }
}

export function userSeries(state) {
  if (!state.playoffs) return null;
  const po = state.playoffs;
  for (const round of ["R1", "R2", "CF"]) {
    for (const conf of ["Eastern", "Western"]) {
      const hit = (po.rounds[round][conf] || []).find((s) => !s.winner && (s.home === state.userTeamId || s.away === state.userTeamId));
      if (hit) return hit;
    }
  }
  const scf = po.rounds.SCF.league?.[0];
  if (scf && !scf.winner && (scf.home === state.userTeamId || scf.away === state.userTeamId)) return scf;
  return null;
}

export function userStillAlive(state) {
  if (!state.playoffs) return false;
  if (state.playoffs.champion) return state.playoffs.champion === state.userTeamId;
  const all = [];
  for (const r of Object.values(state.playoffs.rounds)) {
    for (const arr of Object.values(r)) all.push(...(arr || []));
  }
  return all.some((s) => !s.winner && (s.home === state.userTeamId || s.away === state.userTeamId));
}
