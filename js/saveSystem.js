/**
 * Save and load your franchise.
 * The browser remembers it, like a bookmark, so you can come back later.
 */

const PREFIX = "northwind_hockey_";
const SLOTS = ["slot1", "slot2", "slot3", "autosave"];

/** Look at all save slots and tell us who is in each one. */
export function listSaves() {
  return SLOTS.map((slot) => {
    try {
      const raw = localStorage.getItem(PREFIX + slot);
      if (!raw) return { slot, empty: true };
      const data = JSON.parse(raw);
      return {
        slot,
        empty: false,
        team: data.meta?.team,
        season: data.meta?.season,
        phase: data.meta?.phase,
        record: data.meta?.record,
        savedAt: data.meta?.savedAt,
      };
    } catch {
      return { slot, empty: true, corrupt: true };
    }
  });
}

/** Write the whole game into a slot. Also copies it to autosave. */
export function saveTo(slot, state) {
  const team = state.teams[state.userTeamId];
  const payload = {
    meta: {
      team: team.displayName,
      abbr: team.abbr,
      season: state.season,
      phase: state.phase,
      record: `${team.record.w}-${team.record.l}-${team.record.ot}`,
      savedAt: Date.now(),
    },
    state,
  };
  localStorage.setItem(PREFIX + slot, JSON.stringify(payload));
  if (slot !== "autosave") localStorage.setItem(PREFIX + "autosave", JSON.stringify(payload));
  return true;
}

/** Read a saved game back out of a slot. */
export function loadFrom(slot) {
  const raw = localStorage.getItem(PREFIX + slot);
  if (!raw) return null;
  const data = JSON.parse(raw);
  return data.state;
}

/** Quiet save after big moments so you do not lose progress. */
export function autosave(state) {
  try {
    saveTo("autosave", state);
  } catch (err) {
    console.warn("Autosave failed", err);
  }
}

/** Erase one save slot. */
export function deleteSave(slot) {
  localStorage.removeItem(PREFIX + slot);
}
