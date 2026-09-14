"""
Turn NHL website data into js/data/teams.js.

Think of it like copying hockey cards into a notebook the game can read:
team names, logos, and who is on each roster.
"""
import json, os, datetime
from collections import defaultdict

raw = json.load(open("/Users/colbygoldstein/hockey-gm-simulator/js/data/_nhl_raw.json"))
standings = raw["standings"]
rosters = raw["rosters"]
stats = raw["stats"]

COLORS = {
  "ANA": ("#b5985a", "#fc4c02", "#ffffff"),
  "BOS": ("#111111", "#ffb81c", "#ffffff"),
  "BUF": ("#003087", "#fcb514", "#ffffff"),
  "CAR": ("#ce1126", "#000000", "#a2aaad"),
  "CBJ": ("#002654", "#ce1126", "#ffffff"),
  "CGY": ("#c8102e", "#f1be48", "#111111"),
  "CHI": ("#cf0a2c", "#000000", "#ffffff"),
  "COL": ("#6f263d", "#236192", "#a2aaad"),
  "DAL": ("#006847", "#8f8f8c", "#111111"),
  "DET": ("#ce1126", "#ffffff", "#e5e5e5"),
  "EDM": ("#ff4c00", "#041e42", "#ffffff"),
  "FLA": ("#041e42", "#c8102e", "#b9975b"),
  "LAK": ("#111111", "#a2aaad", "#ffffff"),
  "MIN": ("#154734", "#a6192e", "#eaaa00"),
  "MTL": ("#af1e2d", "#192168", "#ffffff"),
  "NSH": ("#041e42", "#ffb81c", "#ffffff"),
  "NJD": ("#ce1126", "#000000", "#ffffff"),
  "NYI": ("#00539b", "#f47d30", "#ffffff"),
  "NYR": ("#0038a8", "#ce1126", "#ffffff"),
  "OTT": ("#c52032", "#000000", "#c4ced4"),
  "PHI": ("#f74902", "#000000", "#ffffff"),
  "PIT": ("#000000", "#fcb514", "#ffffff"),
  "SEA": ("#001628", "#99d9d9", "#355e3b"),
  "SJS": ("#006d75", "#000000", "#ea7200"),
  "STL": ("#002f87", "#fcb514", "#041e42"),
  "TBL": ("#002868", "#ffffff", "#3b82f6"),
  "TOR": ("#00205b", "#ffffff", "#75aadb"),
  "UTA": ("#6cace4", "#010101", "#e35205"),
  "VAN": ("#00205b", "#00843d", "#041c2c"),
  "VGK": ("#b4975a", "#333f42", "#c8102e"),
  "WPG": ("#041e42", "#ac162c", "#7a99ac"),
  "WSH": ("#c8102e", "#041e42", "#ffffff"),
}

ARENAS = {
  "ANA": "Honda Center", "BOS": "TD Garden", "BUF": "KeyBank Center",
  "CAR": "Lenovo Center", "CBJ": "Nationwide Arena", "CGY": "Scotiabank Saddledome",
  "CHI": "United Center", "COL": "Ball Arena", "DAL": "American Airlines Center",
  "DET": "Little Caesars Arena", "EDM": "Rogers Place", "FLA": "Amerant Bank Arena",
  "LAK": "Crypto.com Arena", "MIN": "Xcel Energy Center", "MTL": "Bell Centre",
  "NSH": "Bridgestone Arena", "NJD": "Prudential Center", "NYI": "UBS Arena",
  "NYR": "Madison Square Garden", "OTT": "Canadian Tire Centre", "PHI": "Wells Fargo Center",
  "PIT": "PPG Paints Arena", "SEA": "Climate Pledge Arena", "SJS": "SAP Center",
  "STL": "Enterprise Center", "TBL": "Amalie Arena", "TOR": "Scotiabank Arena",
  "UTA": "Delta Center", "VAN": "Rogers Arena", "VGK": "T-Mobile Arena",
  "WPG": "Canada Life Centre", "WSH": "Capital One Arena",
}

CUPS = {
  "MTL": 24, "TOR": 13, "DET": 11, "BOS": 6, "CHI": 6, "EDM": 5, "PIT": 5,
  "NYI": 4, "NYR": 4, "NJD": 3, "TBL": 3, "COL": 3, "LAK": 2, "PHI": 2,
  "WSH": 1, "STL": 1, "DAL": 1, "CAR": 1, "ANA": 1, "CGY": 1, "VGK": 1, "FLA": 2,
  "OTT": 0, "BUF": 0, "VAN": 0, "NSH": 0, "WPG": 0, "MIN": 0, "CBJ": 0, "SJS": 0,
  "SEA": 0, "UTA": 0,
}

RIVALS = {
  "BOS": ["MTL", "TOR", "TBL"], "BUF": ["TOR", "OTT", "BOS"], "MTL": ["TOR", "BOS", "OTT"],
  "OTT": ["TOR", "MTL", "BOS"], "TOR": ["MTL", "BOS", "OTT"], "DET": ["CHI", "TOR", "CBJ"],
  "FLA": ["TBL", "CAR", "BOS"], "TBL": ["FLA", "BOS", "TOR"],
  "CAR": ["WSH", "TBL", "NYR"], "CBJ": ["DET", "PIT", "CHI"], "NJD": ["NYR", "NYI", "PHI"],
  "NYI": ["NYR", "NJD", "PHI"], "NYR": ["NJD", "NYI", "BOS"], "PHI": ["PIT", "NYR", "NJD"],
  "PIT": ["PHI", "WSH", "CBJ"], "WSH": ["PIT", "CAR", "PHI"],
  "CHI": ["STL", "DET", "MIN"], "COL": ["DAL", "MIN", "VGK"], "DAL": ["COL", "MIN", "NSH"],
  "MIN": ["WPG", "CHI", "DAL"], "NSH": ["DAL", "STL", "CAR"], "STL": ["CHI", "NSH", "DAL"],
  "UTA": ["COL", "VGK", "LAK"], "WPG": ["MIN", "EDM", "CGY"],
  "ANA": ["LAK", "SJS", "VGK"], "CGY": ["EDM", "VAN", "WPG"], "EDM": ["CGY", "VAN", "WPG"],
  "LAK": ["ANA", "SJS", "VGK"], "SEA": ["VAN", "EDM", "CGY"], "SJS": ["LAK", "ANA", "VGK"],
  "VAN": ["CGY", "EDM", "SEA"], "VGK": ["LAK", "ANA", "COL"],
}

MARKETS = {
  "NYR": "large", "NYI": "large", "NJD": "large", "TOR": "large", "MTL": "large",
  "BOS": "large", "CHI": "large", "LAK": "large", "PHI": "large", "DET": "large",
  "WSH": "large", "DAL": "large", "FLA": "large", "VGK": "large",
  "PIT": "medium", "TBL": "medium", "COL": "medium", "MIN": "medium", "VAN": "medium",
  "EDM": "medium", "CGY": "medium", "CAR": "medium", "NSH": "medium", "STL": "medium",
  "ANA": "medium", "SJS": "medium", "SEA": "medium", "BUF": "medium",
  "OTT": "small", "WPG": "small", "CBJ": "small", "UTA": "small",
}

COUNTRY = {
  "CAN": "CA", "USA": "US", "SWE": "SE", "FIN": "FI", "RUS": "RU", "CZE": "CZ",
  "SVK": "SK", "CHE": "CH", "DEU": "DE", "DNK": "DK", "LVA": "LV", "NOR": "NO",
  "BLR": "BY", "KAZ": "KZ", "AUT": "AT", "FRA": "FR", "GBR": "GB", "SVN": "SI",
  "AUS": "AU", "NLD": "NL",
}

def nm(obj):
    """Read a name that might be a string or a {default: "..."} object."""
    if obj is None: return ""
    if isinstance(obj, str): return obj
    return obj.get("default") or next(iter(obj.values()), "")

def clamp(n, a, b):
    """Keep n between a and b."""
    return max(a, min(b, n))

def age_of(birth, season=2026):
    """How old the player is at the start of this season."""
    try:
        d = datetime.date.fromisoformat(birth)
        return season - d.year - ((9, 15) < (d.month, d.day))
    except Exception:
        return 25

def skater_ovr(st, pos):
    """Guess overall from last year's points and ice time."""
    if not st or not st.get("gamesPlayed"):
        return None
    gp = st["gamesPlayed"]
    pts = st.get("points") or 0
    ppg = pts / max(gp, 1)
    toi = (st.get("avgTimeOnIcePerGame") or 720) / 60
    if pos in ("LD", "RD"):
        o = 64 + ppg * 16 + max(0, toi - 16) * 1.15 + min(gp, 82) * 0.03
    else:
        o = 66 + ppg * 15.5 + max(0, toi - 12) * 1.15 + min(gp, 82) * 0.025
        g = st.get("goals") or 0
        if g >= 40: o += 3
        if g >= 50: o += 2
    if gp < 20: o -= 3
    return int(clamp(round(o), 58, 97))

def goalie_ovr(st):
    """Guess a goalie's overall from save percentage and games."""
    if not st or not st.get("gamesPlayed"):
        return None
    gp = st["gamesPlayed"]
    sv = st.get("savePercentage") or 0.9
    gaa = st.get("goalsAgainstAverage") or 3.0
    o = 72 + (sv - 0.900) * 260 - (gaa - 2.80) * 3.5
    if gp >= 45: o += 3
    elif gp >= 25: o += 1
    if gp < 12: o -= 4
    return int(clamp(round(o), 62, 96))

def pos_of(p, group):
    """Map NHL position letters into the game's C / LW / RW / LD / RD / G."""
    code = p.get("positionCode") or ""
    shoots = p.get("shootsCatches") or "L"
    if group == "G" or code == "G":
        return "G"
    if group == "D" or code == "D":
        return "LD" if shoots != "R" else "RD"
    if code == "C":
        return "C"
    if code in ("L", "LW"):
        return "LW"
    if code in ("R", "RW"):
        return "RW"
    return "C"

def last_stats(ab, nhl_id, is_g):
    """Find this player's stats from last season, if they played."""
    blob = stats.get(ab) or {}
    key = "goalies" if is_g else "skaters"
    for row in blob.get(key) or []:
        pid = row.get("playerId") or row.get("id")
        if pid == nhl_id:
            return row
    return None

def player_rec(p, group, ab):
    """Turn one NHL website player into a small card the game can use."""
    pos = pos_of(p, group)
    st = last_stats(ab, p.get("id"), pos == "G")
    ovr = goalie_ovr(st) if pos == "G" else skater_ovr(st, pos)
    age = age_of(p.get("birthDate") or "2000-01-01")
    if ovr is None:
        ovr = int(clamp(round(68 - max(0, age - 24) * 0.4 + max(0, 22 - age) * 0.6), 58, 76))
    score = (ovr or 60) * 10 + ((st or {}).get("gamesPlayed") or 0)
    head = p.get("headshot") or ""
    return {
        "nhlId": p.get("id"),
        "firstName": nm(p.get("firstName")),
        "lastName": nm(p.get("lastName")),
        "position": pos,
        "shoots": p.get("shootsCatches") or "L",
        "height": p.get("heightInInches") or 73,
        "weight": p.get("weightInPounds") or 200,
        "birthDate": p.get("birthDate") or "2000-01-01",
        "age": age,
        "jersey": p.get("sweaterNumber") or 0,
        "nationality": COUNTRY.get(p.get("birthCountry") or "", "CA"),
        "headshot": head,
        "overall": ovr,
        "score": score,
        "gp": (st or {}).get("gamesPlayed") or 0,
    }

teams = []
nhl_rosters = {}
order = ["Atlantic", "Metropolitan", "Central", "Pacific"]

# keep division order stable
by_div = defaultdict(list)
for s in standings:
    by_div[s["divisionName"]].append(s)

for div in order:
    for s in sorted(by_div[div], key=lambda x: x["teamAbbrev"]["default"]):
        ab = s["teamAbbrev"]["default"]
        tid = ab.lower()
        pts = s.get("points") or 80
        q = 0.52 + (pts - 58) / 70 * 0.40
        q = float(clamp(q, 0.50, 0.92))
        if pts >= 105:
            phil, exp = "contending", "cup"
        elif pts >= 90:
            phil, exp = "contending" if pts >= 98 else "balanced", "playoffs"
        else:
            phil, exp = "rebuilding", "rebuild" if pts < 80 else "playoffs"
        youth = float(clamp(0.75 - (pts - 70) / 200, 0.28, 0.82))
        market = MARKETS.get(ab, "medium")
        budget = {"large": 120e6, "medium": 100e6, "small": 82e6}[market]
        if phil == "contending":
            budget += 8e6
        primary, secondary, accent = COLORS.get(ab, ("#123456", "#ffffff", "#eeeeee"))
        city = nm(s.get("placeName"))
        if city.startswith("NY "):
            city = "New York"
        name = nm(s.get("teamCommonName"))
        logo = s.get("teamLogo") or f"https://assets.nhle.com/logos/nhl/svg/{ab}_light.svg"
        logo_dark = s.get("teamLogoDark") or f"https://assets.nhle.com/logos/nhl/svg/{ab}_dark.svg"
        conf = "Eastern" if s["conferenceName"].startswith("East") else "Western"
        rivals = [r.lower() for r in RIVALS.get(ab, [])]
        fan = int(clamp(62 + pts * 0.28 + (12 if market == "large" else 0), 64, 98))
        teams.append({
            "id": tid,
            "city": city,
            "name": name,
            "abbr": ab,
            "colors": {"primary": primary, "secondary": secondary, "accent": accent},
            "logo": logo,
            "logoDark": logo_dark,
            "arena": ARENAS.get(ab, f"{city} Arena"),
            "conference": conf,
            "division": div,
            "marketSize": market,
            "fanInterest": fan,
            "budget": int(budget),
            "ownerPatience": 48 if exp == "cup" else (62 if phil == "balanced" else 74),
            "ownerExpectations": exp,
            "philosophy": phil,
            "nhlQuality": round(q, 2),
            "youth": round(youth, 2),
            "prospectQuality": round(float(clamp(0.45 + youth * 0.4, 0.4, 0.88)), 2),
            "capUsage": round(float(clamp(0.70 + q * 0.28, 0.68, 0.99)), 2),
            "rivals": rivals,
            "historyCups": CUPS.get(ab, 0),
            "lastPts": pts,
        })

        ros = rosters.get(ab) or {}
        forwards = [player_rec(p, "F", ab) for p in ros.get("forwards") or []]
        defense = [player_rec(p, "D", ab) for p in ros.get("defensemen") or []]
        goalies = [player_rec(p, "G", ab) for p in ros.get("goalies") or []]
        forwards.sort(key=lambda x: -x["score"])
        defense.sort(key=lambda x: -x["score"])
        goalies.sort(key=lambda x: -x["score"])
        f_n = min(13, max(12, len(forwards))) if len(forwards) >= 12 else len(forwards)
        d_n = min(8, max(6, len(defense))) if len(defense) >= 6 else len(defense)
        g_n = min(2, len(goalies)) if len(goalies) >= 2 else len(goalies)
        # prefer 13/8/2 when we have camp extras
        if len(forwards) > 14:
            f_n = 13
        if len(defense) > 9:
            d_n = 8
        if len(goalies) > 2:
            g_n = 2
        nhl = forwards[:f_n] + defense[:d_n] + goalies[:g_n]
        farm = forwards[f_n:] + defense[d_n:] + goalies[g_n:]
        for rec in nhl + farm:
            rec.pop("score", None)
        nhl_rosters[tid] = {"nhl": nhl, "minors": farm[:16]}

# compact JS
def dumps(obj):
    """JSON with no extra spaces, so the file stays smaller."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))

js = []
js.append("/** Current NHL teams, logos, and rosters from public NHL data. */")
js.append(f"export const NHL_UPDATED = {json.dumps(datetime.date.today().isoformat())};")
js.append(f"export const TEAM_TEMPLATES = {dumps(teams)};")
js.append(f"export const NHL_ROSTERS = {dumps(nhl_rosters)};")
js.append("""
export const DIVISIONS = TEAM_TEMPLATES.reduce((acc, t) => {
  (acc[t.division] ||= []).push(t.id);
  return acc;
}, {});

export const CONFERENCES = {
  Eastern: ["Atlantic", "Metropolitan"],
  Western: ["Central", "Pacific"],
};

export function teamById(id) {
  return TEAM_TEMPLATES.find((t) => t.id === id);
}

export function fullName(team) {
  return `${team.city} ${team.name}`;
}
""")

outp = "/Users/colbygoldstein/hockey-gm-simulator/js/data/teams.js"
open(outp, "w").write("\n".join(js) + "\n")
print("wrote", outp, "bytes", os.path.getsize(outp))
print("teams", len(teams))
print("sample", teams[0]["id"], teams[0]["abbr"], teams[0]["name"], "nhl", len(nhl_rosters[teams[0]["id"]]["nhl"]))
# sanity
for t in teams:
    n = nhl_rosters[t["id"]]
    nf = sum(1 for p in n["nhl"] if p["position"] in ("C","LW","RW"))
    nd = sum(1 for p in n["nhl"] if p["position"] in ("LD","RD"))
    ng = sum(1 for p in n["nhl"] if p["position"]=="G")
    if nf < 10 or nd < 6 or ng < 2:
        print("THIN", t["abbr"], "F", nf, "D", nd, "G", ng, "total", len(n["nhl"]), "farm", len(n["minors"]))
print("top ovr", max(p["overall"] for tid in nhl_rosters for p in nhl_rosters[tid]["nhl"]))
print("ids", [t["id"] for t in teams])