# Shul Screen (MyZmanim + GitHub Pages)

This is a simple, screen-friendly dashboard intended for a shul TV / digital signage display.

It shows:

- **Today’s zmanim** (from the MyZmanim HTTP API)
- **Davening times** (editable in `config.json`)
  - Shacharis (3 daily + 1 Sunday-only)
  - Mincha (rule-based + editable)
  - Maariv (4 fixed)

It also computes weekly rules (Sun–Thu) such as:

- **Mincha/Maariv (weekly):** *15 minutes before the earliest shkiah (SunsetDefault) of the week (Sun–Thu)*  
- **Earliest Mincha:** *the later of (weekly latest Mincha Gedola) and 1:45 PM* (configurable)

## Quick setup (GitHub Pages)

1. Create a new GitHub repo (example: `shul-screen`).
2. Upload these files to the repo root:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `config.json`
3. GitHub → **Settings → Pages**
   - Source: **Deploy from a branch**
   - Branch: `main`
   - Folder: `/ (root)`
4. Your screen URL will be:
   - `https://YOUR-USERNAME.github.io/shul-screen/`

## Configure for Lakewood (08701)

Open `config.json` and set:

- `myzmanim.user`
- `myzmanim.key`

**Important:** For testing only, this template loads the key in the browser (it is visible to anyone who loads the page).
MyZmanim’s own docs caution against exposing keys in client-side JavaScript in production.

## MyZmanim API details

This template uses the MyZmanim **HTTP API** (form-urlencoded `POST`) endpoints:

- `POST https://api.myzmanim.com/engine1.json.aspx/searchPostal`
- `POST https://api.myzmanim.com/engine1.json.aspx/getDay`

Reference: MyZmanim Developer API Documentation (HTTP API).  
https://core.myzmanim.com/site/common/apidocumentation

## Editing the schedule

All schedule items live in `config.json` under `davening`.

### Shacharis
Pre-filled as you requested:

- 6:45, 7:00, 8:00
- 8:30 **Sunday only**

To change times, edit the `time` field.

### Maariv
Pre-filled:

- 6:05, 7:15, 9:30, 10:15

### Mincha rules

1) **Mincha (earliest)**

Configured as:

- Compute **weekly latest** Mincha Gedola time (Sun–Thu) using the MyZmanim Zman field:
  - `MinchaStrict` (Mincha Gedola / lechumra)
- Then take the later of that zman and **1:45 PM**.

This is controlled by:

- `davening.mincha[0]` (`type: weeklyLatestZmanOrFixed`)
- `fixedTime: "13:45"`

If you want Mincha to be **purely** based on weekly Mincha Gedola (no 1:45 floor), set `fixedTime` to `null`.

2) **Mincha/Maariv**

Configured as:

- **Earliest shkiah (Sun–Thu)** using `SunsetDefault`, then subtract 15 minutes.

Controlled by:

- `davening.mincha[1]` (`type: weeklyEarliestZman`, `baseField: "SunsetDefault"`, `offsetMin: -15`)

3) **Mincha 3** is a placeholder entry. Replace it with a fixed time entry such as:

```json
{ "label": "Minyan 3", "type": "fixed", "time": "20:10" }
```

## Troubleshooting

### If you see a CORS error
Some APIs do not allow browser requests from other domains. If the MyZmanim API blocks requests from GitHub Pages, your browser may show “Failed to fetch / CORS” and the page will display an error in the footer.

In that case, you will need a tiny proxy (Cloudflare Worker is a common choice) so the API key stays server-side and CORS is avoided.

If you want, I can provide a Worker proxy that matches this page format.
