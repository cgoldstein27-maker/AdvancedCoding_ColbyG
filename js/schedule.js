/**
 * Build the season calendar.
 * Every team plays 82 games, plus a few practice games before the season.
 */
import { TEAM_TEMPLATES, DIVISIONS } from "./data/teams.js";
import { uid } from "./utils.js";

export function generateSchedule(state, rng) {
  const games = [];
  const teams = TEAM_TEMPLATES.map((t) => t.id);
  const remaining = {};
  const homeCount = {};
  // Each club still needs 82 regular-season games.
  for (const id of teams) {
    remaining[id] = 82;
    homeCount[id] = 0;
  }

  const add = (home, away, day) => {
    if (remaining[home] <= 0 || remaining[away] <= 0) return false;
    games.push({
      id: uid("g"),
      day,
      home,
      away,
      played: false,
      result: null,
      type: "regular",
    });
    remaining[home]--;
    remaining[away]--;
    homeCount[home]++;
    return true;
  };

  // Play division rivals more, other conference teams less.
  const pairs = [];
  for (const id of teams) {
    const t = state.teams[id];
    for (const other of teams) {
      if (other <= id) continue;
      const o = state.teams[other];
      let n;
      if (t.division === o.division) n = 4;
      else if (t.conference === o.conference) n = 3;
      else n = 2;
      pairs.push({ a: id, b: other, n });
    }
  }

  const daySlots = [];
  let day = 8;
  while (day <= 175) {
    daySlots.push(day);
    day += 1;
    if (day % 7 === 3) day += 0;
  }

  let cursor = 0;
  for (const pair of pairs) {
    for (let i = 0; i < pair.n; i++) {
      const home = i % 2 === 0 ? pair.a : pair.b;
      const away = home === pair.a ? pair.b : pair.a;
      const d = daySlots[cursor % daySlots.length];
      cursor += 3;
      add(home, away, d);
    }
  }

  // Fill leftover games until everyone is at 82.
  while (Object.values(remaining).some((n) => n > 0)) {
    const need = teams.filter((id) => remaining[id] > 0);
    if (need.length < 2) break;
    const a = rng.pick(need);
    const b = rng.pick(need.filter((id) => id !== a));
    if (!b) break;
    const home = homeCount[a] <= homeCount[b] ? a : b;
    const away = home === a ? b : a;
    const d = daySlots[cursor % daySlots.length];
    cursor += 2;
    if (!add(home, away, d)) break;
    if (games.length > 1600) break;
  }

  games.sort((x, y) => x.day - y.day || x.id.localeCompare(y.id));
  let lastDay = -1;
  let used = new Set();
  for (const g of games) {
    if (g.day !== lastDay) {
      used = new Set();
      lastDay = g.day;
    }
    if (used.has(g.home) || used.has(g.away)) {
      g.day += 1;
    }
    used.add(g.home);
    used.add(g.away);
  }
  games.sort((x, y) => x.day - y.day);

  // Practice games vs a rival. These do not count in the standings.
  const pre = [];
  for (const id of teams) {
    const rivals = state.teams[id].rivals || [];
    const opp = rivals[0] || rng.pick(teams.filter((t) => t !== id));
    pre.push({
      id: uid("g"),
      day: rng.int(1, 6),
      home: id,
      away: opp,
      played: false,
      result: null,
      type: "preseason",
    });
  }
  state.schedule = [...pre, ...games];
  return state.schedule;
}

/** Games still waiting to be played on this day. */
export function gamesOnDay(state, day) {
  return state.schedule.filter((g) => g.day === day && !g.played);
}

/** Your next game, skipping leftover preseason once the real season starts. */
export function nextUserGame(state) {
  const isUser = (g) => g.home === state.userTeamId || g.away === state.userTeamId;
  if (state.phase === "preseason") {
    return (
      state.schedule.find((g) => !g.played && isUser(g) && g.type === "preseason") ||
      state.schedule.find((g) => !g.played && isUser(g) && g.type === "regular")
    );
  }
  return state.schedule.find((g) => !g.played && isUser(g) && g.type !== "preseason");
}

/** The next few games on your calendar. */
export function upcomingUserGames(state, n = 5) {
  return state.schedule
    .filter((g) => !g.played && (g.home === state.userTeamId || g.away === state.userTeamId) && (state.phase === "preseason" ? true : g.type !== "preseason" || state.phase === "preseason"))
    .slice(0, n);
}

/** Every game for one team. */
export function teamSchedule(state, teamId) {
  return state.schedule.filter((g) => g.home === teamId || g.away === teamId);
}

/** Regular-season games nobody has played yet. */
export function unplayedRegular(state) {
  return state.schedule.filter((g) => !g.played && g.type === "regular");
}

/** The trade deadline sits around day 128 (early March). */
export function deadlineDay() {
  return 128;
}

/** Turn a day number into a date like Oct 12. */
export function calendarLabel(day) {
  const start = new Date(Date.UTC(2026, 9, 1));
  const d = new Date(start.getTime() + day * 86400000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
