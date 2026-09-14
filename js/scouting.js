import { clamp } from "./utils.js";
import { scoutedView } from "./generation.js";

export function assignScout(state, scoutId, assignment, region = null) {
  const scout = state.scouts[scoutId];
  if (!scout) return false;
  scout.assignment = assignment;
  if (region) scout.region = region;
  return true;
}

export function tickScouting(state, days, rng) {
  const userScouts = Object.values(state.scouts).filter((s) => s.teamId === state.userTeamId);
  const targets = Object.values(state.players).filter((p) => p.status !== "retired" && p.teamId !== state.userTeamId);
  for (const scout of userScouts) {
    const pool = targets.filter((p) => {
      if (scout.assignment === "pro") return p.status === "nhl" || p.status === "fa";
      if (scout.assignment === "amateur") return p.status === "draft" || p.status === "prospect";
      if (scout.assignment === "region") return nationalityRegion(p.nationality) === scout.region;
      return true;
    });
    const n = Math.min(pool.length, Math.round((days / 7) * (scout.skill / 18)));
    for (let i = 0; i < n; i++) {
      const p = rng.pick(pool);
      const gain = 4 + Math.round(scout.skill / 20) + rng.int(0, 3);
      p.scout.knowledge = clamp((p.scout.knowledge || 20) + gain, 5, 98);
      if (rng.chance(0.3)) p.scout.bias = clamp((p.scout.bias || 0) * 0.6, -2, 2);
    }
  }
}

function nationalityRegion(code) {
  if (code === "CA") return "Canada";
  if (code === "US") return "USA";
  if (code === "SE" || code === "FI" || code === "DK") return "Nordics";
  if (code === "RU" || code === "LV") return "Russia";
  return "Central Europe";
}

export function reportFor(player, userTeamId) {
  const v = scoutedView(player, userTeamId);
  const range = v.overallRange[0] === v.overallRange[1] ? `${v.overallRange[0]}` : `${v.overallRange[0]}–${v.overallRange[1]}`;
  return {
    ...v,
    overallText: v.exact ? `${player.ratings.overall}` : range,
    potentialText: v.exact || v.knowledge > 70 ? player.potential.category : v.knowledge > 40 ? "Unclear" : "Unknown",
  };
}

export const SCOUT_REGIONS = ["Canada", "USA", "Nordics", "Russia", "Central Europe"];
export const SCOUT_ASSIGNMENTS = [
  { id: "pro", label: "Pro scouting" },
  { id: "amateur", label: "Amateur / draft" },
  { id: "region", label: "Regional" },
];
