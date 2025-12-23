# Shul Zmanim + Davening Times (GitHub Pages)

This is a simple, signage-friendly web page intended for a TV / lobby display.

It:
- pulls daily zmanim for Lakewood, NJ (ZIP 08701 by default) using Hebcal's Zmanim API
- shows editable davening times for your shul (3 Shacharis, 3 Mincha, 3 Maariv by default)
- supports your rule: **Weekly Mincha/Maariv = earliest Shkiah (Sun–Thu) that week minus 15 minutes**

## Quick start (GitHub Pages)

1. Create a new GitHub repo (e.g. `shul-screen`)
2. Upload these files to the repo root:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `config.json`
3. In GitHub: **Settings → Pages**
   - Source: `Deploy from a branch`
   - Branch: `main` (or `master`) and folder `/ (root)`
4. Your screen URL will look like:
   - `https://YOUR-USERNAME.github.io/shul-screen/`

Use that URL in your signage platform (Yodeck "Web Page", PosterBooking "Website URL", or a DIY kiosk browser).

## Editing your minyan times (no code)

Open `config.json` and edit:

- `davening.shacharis` (3 items)
- `davening.mincha` (3 items)
- `davening.maariv` (3 items)

Each item supports:

### 1) Fixed clock time
```json
{ "label": "Minyan 1", "type": "fixed", "time": "06:15" }
```
Time is `HH:MM` 24-hour.

### 2) Relative to zmanim (e.g., shkiah - 10)
```json
{ "label": "Minyan 3", "type": "zmanimOffset", "base": "sunset", "offsetMin": -10 }
```

### 3) Your weekly rule: earliest shkiah (Sun–Thu) minus 15
```json
{ "label": "Minyan 2", "type": "weeklyEarliestShkiahMinus15" }
```

To change the -15 or the included days, edit:
```json
"rules": {
  "weeklyEarliestShkiah": {
    "enabled": true,
    "daysToInclude": [0,1,2,3,4],
    "weekStartsOn": 0,
    "offsetMin": -15
  }
}
```

## Zmanim list

Edit `zmanim.items` to choose which zmanim appear (e.g., add `minchaKetana`, `tzeit85deg`, etc).

## Notes

- The page refreshes zmanim periodically (default every 10 minutes). Configure via `display.refreshMinutes`.
- If the screen is offline, it will continue showing the last loaded values until the next successful refresh.
