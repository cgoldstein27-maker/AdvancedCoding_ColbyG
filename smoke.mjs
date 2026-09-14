/**
 * Quick robot test.
 * Starts a Bruins franchise, sims a season, and yells if something is broken.
 */
import { newGame, getState, simWeek, simRestOfSeason, skipUserPlayoffs, continueOffseason, simDraftPick, skipFreeAgency } from "./js/game.js";

// Fake browser storage so this can run in Node, not only in Chrome.
globalThis.localStorage = {
  _d: {},
  setItem(k, v) { this._d[k] = v; },
  getItem(k) { return this._d[k] ?? null; },
  removeItem(k) { delete this._d[k]; },
};

const t0 = Date.now();
newGame({ teamId: "bos", difficulty: "normal", salaryCap: 88e6, seed: 2026 });
let s = getState();
console.log("generated", {
  teams: Object.keys(s.teams).length,
  players: Object.keys(s.players).length,
  roster: s.teams.bos.roster.length,
  schedule: s.schedule.length,
  ms: Date.now() - t0,
});
if (Object.keys(s.teams).length !== 32) throw new Error("need 32 teams");
if (s.teams.bos.roster.length < 20) throw new Error("roster too small");

simWeek();
s = getState();
console.log("after week", s.phase, s.day, s.teams.bos.record);

const t1 = Date.now();
simRestOfSeason();
s = getState();
console.log("after regular", s.phase, s.teams.bos.record, "pts", s.teams.bos.record.w * 2 + s.teams.bos.record.ot, "ms", Date.now() - t1);
if (s.teams.bos.record.gp < 70) throw new Error("did not play enough games: " + s.teams.bos.record.gp);

if (s.phase === "playoffs") {
  skipUserPlayoffs();
  s = getState();
  console.log("after playoffs", s.phase, s.playoffs?.champion, s.history.champions);
}

if (s.phase === "awards") {
  continueOffseason();
  s = getState();
  console.log("draft", s.phase, s.draft?.picks?.length);
}

if (s.phase === "draft") {
  let guard = 0;
  while (!s.draft.complete && guard++ < 250) {
    simDraftPick();
    s = getState();
  }
  console.log("draft complete", s.draft.complete, "picks", s.draft.picks.filter((p) => p.playerId).length);
  continueOffseason();
  s = getState();
}

if (s.phase === "freeAgency") {
  skipFreeAgency();
  s = getState();
  console.log("new season", s.season, s.phase);
}

console.log("OK legacy", s.legacy.score);
