/**
 * Little helpers used all over the game.
 * Dice for random stuff, money labels, and sorting tools.
 */

/** A pretend dice that can replay the same rolls if we save the seed. */
export class RNG {
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0 || 1;
    this._s = this.seed;
  }

  /** Make the next random number between 0 and 1. */
  next() {
    let a = (this._s = (this._s + 0x6d2b79f5) >>> 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Random number between min and max, including decimals. */
  float(min = 0, max = 1) {
    return min + this.next() * (max - min);
  }

  /** Random whole number between min and max. */
  int(min, max) {
    return Math.floor(this.float(min, max + 1));
  }

  /** True this percent of the time. chance(0.5) is like a coin flip. */
  chance(p) {
    return this.next() < p;
  }

  /** Grab one random thing from a list. */
  pick(arr) {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Grab from a list, but bigger numbers get picked more often. */
  weighted(items, weightFn) {
    const weights = items.map((item) => Math.max(0, weightFn(item)));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return this.pick(items);
    let r = this.float(0, total);
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Mix a list into a new random order, like shuffling cards. */
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Random number that likes to land near the middle (a bell curve). */
  normal(mean, sd) {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + z * sd;
  }

  /** Bell-curve number, then snap it to a whole number inside min and max. */
  clampNormal(mean, sd, min, max) {
    return clamp(Math.round(this.normal(mean, sd)), min, max);
  }

  /** Pack the dice so we can save the game and keep the same luck. */
  serialize() {
    return { seed: this.seed, s: this._s };
  }

  /** Rebuild the same dice from a save file. */
  static from(data) {
    const rng = new RNG(data.seed);
    rng._s = data.s >>> 0;
    return rng;
  }
}

/** Keep a number from going too small or too big. */
export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/** Slide from number a toward number b. t=0 is a, t=1 is b. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Make a unique nametag so two players never share the same id. */
export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

/** Turn a big salary into something short, like $8.5M. */
export function formatMoney(n, compact = true) {
  const v = Math.round(n);
  if (!compact) return `$${v.toLocaleString()}`;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e6) {
    const m = abs / 1e6;
    const str = m >= 10 ? m.toFixed(1) : m.toFixed(2);
    return `${sign}$${str.replace(/\.?0+$/, "")}M`;
  }
  if (abs >= 1000) return `${sign}$${Math.round(abs / 1000)}K`;
  return `${sign}$${abs}`;
}

/** Show cap space like $3.2M. */
export function formatCap(n) {
  const m = n / 1e6;
  const sign = m < 0 ? "-" : "";
  return `${sign}$${Math.abs(m).toFixed(1)}M`;
}

/** Turn inches into 6'1" so it looks like a hockey card. */
export function formatHeight(inches) {
  const ft = Math.floor(inches / 12);
  const inn = inches % 12;
  return `${ft}'${inn}"`;
}

/** Show wins-losses-overtime losses, like 12-8-2. */
export function formatRecord(r) {
  if (!r) return "0-0-0";
  return `${r.w}-${r.l}-${r.ot}`;
}

/** NHL points: a win is 2, an OT loss is 1. */
export function pointsOf(r) {
  if (!r) return 0;
  return r.w * 2 + r.ot;
}

/** Pick a color for an overall rating. Gold means superstar. */
export function ovrTone(ovr) {
  if (ovr >= 90) return "gold";
  if (ovr >= 85) return "blue";
  if (ovr >= 80) return "green";
  if (ovr >= 75) return "ice";
  return "muted";
}

/** Turn 1 into 1st, 2 into 2nd, 3 into 3rd. */
export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Turn 2026 into 2026–27. */
export function seasonLabel(year) {
  return `${year}–${String(year + 1).slice(2)}`;
}

/** Copy an object so changing the copy does not change the original. */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Average of a list of numbers. */
export function avg(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Add up a list of numbers. */
export function sum(nums) {
  return nums.reduce((a, b) => a + b, 0);
}

/** Helper for sorting lists by a field. */
export function by(key, dir = -1) {
  return (a, b) => {
    const av = typeof key === "function" ? key(a) : a[key];
    const bv = typeof key === "function" ? key(b) : b[key];
    if (av < bv) return -1 * dir * -1;
    if (av > bv) return dir;
    return 0;
  };
}

/** Sort a list using a score function. Highest first by default. */
export function sortBy(arr, fn, desc = true) {
  return arr.slice().sort((a, b) => {
    const d = fn(b) - fn(a);
    return desc ? d : -d;
  });
}

/** Split a list into buckets, like grouping players by team. */
export function groupBy(arr, fn) {
  const map = {};
  for (const item of arr) {
    const k = fn(item);
    (map[k] ||= []).push(item);
  }
  return map;
}

/** Random goals-style count. 3 expected goals might become 1, 2, 4, or 5. */
export function poisson(lambda, rng) {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L && k < 20);
  return k - 1;
}

/** Show a streak like W5 (five wins in a row). */
export function streakLabel(streak) {
  if (!streak || !streak.count) return "—";
  return `${streak.type}${streak.count}`;
}

/** Is this player a forward, a defenseman, or a goalie? */
export function posGroup(pos) {
  if (pos === "G") return "G";
  if (pos === "LD" || pos === "RD" || pos === "D") return "D";
  return "F";
}

/** Show LD/RD as just D on the screen. */
export function displayPos(pos) {
  if (pos === "LD" || pos === "RD") return "D";
  return pos;
}

export const POSITIONS = ["C", "LW", "RW", "LD", "RD", "G"];
export const FORWARD_POS = ["C", "LW", "RW"];
export const DEFENSE_POS = ["LD", "RD"];

/** How hard the game is. Harder means other GMs are smarter and owners get mad faster. */
export const DIFFICULTY = {
  rookie: {
    label: "Rookie",
    tradeAccept: 0.86,
    ownerPatience: 1.35,
    contractDemand: 0.9,
    cpuSmart: 0.65,
    developmentLuck: 1.15,
    capBonus: 5e6,
  },
  normal: {
    label: "Normal",
    tradeAccept: 0.97,
    ownerPatience: 1,
    contractDemand: 1,
    cpuSmart: 0.85,
    developmentLuck: 1,
    capBonus: 0,
  },
  hard: {
    label: "Hard",
    tradeAccept: 1.08,
    ownerPatience: 0.78,
    contractDemand: 1.12,
    cpuSmart: 1,
    developmentLuck: 0.95,
    capBonus: 0,
  },
  realistic: {
    label: "Realistic",
    tradeAccept: 1.14,
    ownerPatience: 0.62,
    contractDemand: 1.2,
    cpuSmart: 1.12,
    developmentLuck: 0.88,
    capBonus: 0,
  },
};
