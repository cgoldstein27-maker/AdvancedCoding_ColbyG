# AdvancedCoding_ColbyG

Fall coding term project: a browser **NHL Franchise Simulator**.

## Play the site

**https://cgoldstein27-maker.github.io/AdvancedCoding_ColbyG/**

Pick a current NHL club, run the season, trade, draft, and chase the Stanley Cup. Saves stay in your browser.

Fan-made. Not affiliated with the NHL.

## Run it on your computer

```bash
python3 -m http.server 8765
```

Then open [http://127.0.0.1:8765/](http://127.0.0.1:8765/). A local server is required because the game uses JavaScript modules.

## What’s in here

- `index.html` — the webpage
- `css/` — look and layout
- `js/` — the simulator (teams, games, trades, draft, UI)
- `js/data/teams.js` — current NHL clubs, logos, and rosters
