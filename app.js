/* Shul Screen (GitHub Pages)
 * - Zmanim: MyZmanim HTTP API (POST x-www-form-urlencoded)
 * - Schedule: editable config.json (fixed + weekly computed rules)
 *
 * SECURITY NOTE:
 * For quick testing only, this template reads MyZmanim User/Key from config.json.
 * Anyone who can load the page can see those values.
 *
 * MyZmanim HTTP API docs: https://core.myzmanim.com/site/common/apidocumentation
 */

const API_BASE = "https://api.myzmanim.com/engine1.json.aspx";

function $(id){ return document.getElementById(id); }

function pad2(n){ return String(n).padStart(2, "0"); }

function formatYMD(d){
  // local date -> YYYY-MM-DD
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function addDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getWeekStart(anchorDate, weekStartsOn){
  const d = new Date(anchorDate);
  d.setHours(0,0,0,0);
  const day = d.getDay(); // 0=Sun
  const diff = (day - weekStartsOn + 7) % 7;
  return addDays(d, -diff);
}

/** Parse a MyZmanim zman value like "2025-11-20T16:41:00Z".
 * MyZmanim's examples format these values using the UTC timezone to display the intended clock time.
 * In JS we follow that: use getUTCHours/getUTCMinutes.
 */
function zmanIsoToMinutes(iso){
  if (!iso || typeof iso !== "string") return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.getUTCHours() * 60 + dt.getUTCMinutes() + dt.getUTCSeconds()/60;
}

function normalizeMinutes(mins){
  mins = mins % 1440;
  if (mins < 0) mins += 1440;
  return mins;
}

function minutesToDisplay(mins, fmt="h12"){
  mins = normalizeMinutes(Math.round(mins));
  const hh24 = Math.floor(mins/60);
  const mm = mins % 60;

  if (fmt === "h24"){
    return `${pad2(hh24)}:${pad2(mm)}`;
  }

  const ampm = hh24 >= 12 ? "PM" : "AM";
  let h = hh24 % 12;
  if (h === 0) h = 12;
  return `${h}:${pad2(mm)} ${ampm}`;
}

function hhmmToMinutes(hhmm){
  if (!hhmm || typeof hhmm !== "string") return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  return h*60 + mm;
}

function setStatus(msg, isError=false){
  const el = $("status");
  el.textContent = msg;
  el.classList.toggle("error", !!isError);
}

async function loadConfig(){
  const url = `config.json?cb=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load config.json (HTTP ${res.status})`);
  return await res.json();
}

function ensureCfg(cfg){
  const u = cfg?.myzmanim?.user;
  const k = cfg?.myzmanim?.key;
  if (!u || !k || String(u).includes("PUT_YOUR") || String(k).includes("PUT_YOUR")){
    throw new Error("Please edit config.json and set myzmanim.user and myzmanim.key.");
  }
}

function formBody(params){
  const usp = new URLSearchParams();
  for (const [k,v] of Object.entries(params)){
    if (v === undefined || v === null) continue;
    usp.set(k, String(v));
  }
  return usp.toString();
}

async function mzPost(endpoint, params){
  const url = `${API_BASE}/${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    body: formBody(params)
  });

  // If the API doesn't allow CORS, browsers will throw before we get here.
  if (!res.ok){
    throw new Error(`MyZmanim HTTP error ${res.status}`);
  }
  const data = await res.json();
  if (data?.ErrMsg){
    throw new Error(`MyZmanim ErrMsg: ${data.ErrMsg}`);
  }
  return data;
}

async function getLocationId(cfg){
  const postal = cfg.myzmanim.postalQuery || "08701";
  const cacheKey = `myz_loc_${postal}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached;

  const params = {
    User: cfg.myzmanim.user,
    Key: cfg.myzmanim.key,
    Coding: cfg.myzmanim.coding || "JS",
    Query: postal,
    TimeZone: "" // optional
  };

  const data = await mzPost("searchPostal", params);
  if (!data?.LocationID){
    throw new Error("MyZmanim searchPostal returned no LocationID");
  }
  localStorage.setItem(cacheKey, data.LocationID);
  return data.LocationID;
}

async function getDay(cfg, locationId, ymd){
  const params = {
    User: cfg.myzmanim.user,
    Key: cfg.myzmanim.key,
    Coding: cfg.myzmanim.coding || "JS",
    Language: cfg.myzmanim.language || "en",
    LocationID: locationId,
    InputDate: ymd
  };
  return await mzPost("getDay", params);
}

function renderHeader(cfg, day){
  $("shul-name").textContent = cfg?.shul?.name || "Shul Screen";
  $("shul-sub").textContent  = cfg?.shul?.locationLabel || "";

  const time = day?.Time || {};
  // Prefer MyZmanim's own formatted strings when available
  $("date-line").textContent = time.DateCivilLong || time.DateFullShort || formatYMD(new Date());
  $("date-sub").textContent  = time.DateJewishLong || time.DateJewishShort || "";
}

function renderZmanim(cfg, day){
  const grid = $("zmanim-grid");
  grid.innerHTML = "";

  const fmt = cfg?.display?.timeFormat || "h12";
  const zman = day?.Zman || {};

  const items = cfg?.zmanim || [];
  for (const it of items){
    const label = it.label || it.field;
    const field = it.field;
    const iso = zman?.[field];
    const minutes = zmanIsoToMinutes(iso);

    const row = document.createElement("div");
    row.className = "z-row";

    const left = document.createElement("div");
    left.className = "z-label";
    left.textContent = label;

    const right = document.createElement("div");
    right.className = "z-time";
    right.textContent = minutes === null ? "—" : minutesToDisplay(minutes, fmt);

    row.appendChild(left);
    row.appendChild(right);
    grid.appendChild(row);
  }
}

function shouldShowEntry(entry, todayDow){
  if (!entry) return false;
  if (entry.type === "fixedIfDow"){
    const allowed = entry.dow || [];
    return allowed.includes(todayDow);
  }
  return true;
}

function renderScheduleList(elId, entries, ctx){
  const el = $(elId);
  el.innerHTML = "";

  const fmt = ctx.fmt;

  for (const entry of entries){
    if (!shouldShowEntry(entry, ctx.todayDow)) continue;

    const row = document.createElement("div");
    row.className = "s-row";

    const label = document.createElement("div");
    label.className = "s-label";
    label.textContent = entry.label || "";

    const time = document.createElement("div");
    time.className = "s-time";

    const t = computeEntryTime(entry, ctx);
    time.textContent = t ?? "—";

    row.appendChild(label);
    row.appendChild(time);
    el.appendChild(row);
  }
}

function computeEntryTime(entry, ctx){
  const fmt = ctx.fmt;

  switch(entry.type){
    case "fixed": {
      const mins = hhmmToMinutes(entry.time);
      return mins === null ? null : minutesToDisplay(mins, fmt);
    }
    case "fixedIfDow": {
      const mins = hhmmToMinutes(entry.time);
      return mins === null ? null : minutesToDisplay(mins, fmt);
    }
    case "manualNote": {
      return entry.note || "";
    }
    case "weeklyEarliestZman": {
  const key = entry.baseField;
  const profile = entry.weekProfile || "sunThu";
  const agg = (ctx.weekAggByProfile && ctx.weekAggByProfile[profile]) ? ctx.weekAggByProfile[profile] : ctx.weekAgg;
  const res = agg?.earliest?.[key];
  if (!res) return null;
  const mins = res.minutes + (entry.offsetMin || 0);
  return minutesToDisplay(mins, fmt);
}
    case "weeklyLatestZman": {
  const key = entry.baseField;
  const profile = entry.weekProfile || "sunThu";
  const agg = (ctx.weekAggByProfile && ctx.weekAggByProfile[profile]) ? ctx.weekAggByProfile[profile] : ctx.weekAgg;
  const res = agg?.latest?.[key];
  if (!res) return null;
  const mins = res.minutes + (entry.offsetMin || 0);
  return minutesToDisplay(mins, fmt);
}
    case "weeklyLatestZmanOrFixed": {
  const key = entry.baseField;
  const profile = entry.weekProfile || "sunThu";
  const agg = (ctx.weekAggByProfile && ctx.weekAggByProfile[profile]) ? ctx.weekAggByProfile[profile] : ctx.weekAgg;
  const res = agg?.latest?.[key];
  if (!res) return null;
  const base = res.minutes + (entry.offsetMin || 0);

  const fixed = hhmmToMinutes(entry.fixedTime);
  const finalMins = (fixed === null) ? base : Math.max(base, fixed);
  return minutesToDisplay(finalMins, fmt);
}
    default:
      return null;
  }
}

/** Get all days (Sun–Thu) for the week and compute earliest/latest times for selected fields. */
/** Get days for the week and compute earliest/latest times for selected fields.
 * Supports multiple "week profiles" (e.g., Sun–Thu vs Sun–Fri) so different minyanim
 * can be computed using different day sets.
 */
async function computeWeekAggregates(cfg, locationId, anchorDate){
  const weekStartsOn = cfg?.rules?.weekStartsOn ?? 0;

  const profileDays = {
    sunThu: cfg?.rules?.weekdaySunThu ?? [0,1,2,3,4],
    sunFri: cfg?.rules?.weekdaySunFri ?? [0,1,2,3,4,5]
  };

  // Determine which profiles are actually used.
  const usedProfiles = new Set(["sunThu"]);

  const schedules = cfg?.davening || {};
  for (const group of ["shacharis","mincha","maariv"]){
    for (const entry of (schedules[group] || [])){
      if (!entry) continue;
      const t = entry.type;
      if (t === "weeklyEarliestZman" || t === "weeklyLatestZman" || t === "weeklyLatestZmanOrFixed"){
        usedProfiles.add(entry.weekProfile || "sunThu");
      }
    }
  }

  const badgeProfile = cfg?.rules?.weeklyMinchaMaariv?.weekProfile;
  if (badgeProfile) usedProfiles.add(badgeProfile);

  // Build week date list once, then slice per profile
  const weekStart = getWeekStart(anchorDate, weekStartsOn);
  const weekDates = [];
  for (let i=0; i<7; i++){
    weekDates.push(addDays(weekStart, i));
  }

  const datesByProfile = {};
  const unionYMDsSet = new Set();
  for (const profile of usedProfiles){
    const daysToInclude = profileDays[profile] || profileDays.sunThu;
    const dates = weekDates.filter(d => daysToInclude.includes(d.getDay()));
    datesByProfile[profile] = dates;
    for (const d of dates) unionYMDsSet.add(formatYMD(d));
  }

  // Which fields do we need for weekly computations?
  const needed = new Set();

  const minchaMaarivRule = cfg?.rules?.weeklyMinchaMaariv;
  const minchaGedolaRule = cfg?.rules?.weeklyLatestMinchaGedola;
  if (minchaMaarivRule?.baseField) needed.add(minchaMaarivRule.baseField);
  if (minchaGedolaRule?.baseField) needed.add(minchaGedolaRule.baseField);

  for (const group of ["shacharis","mincha","maariv"]){
    for (const entry of (schedules[group] || [])){
      const t = entry?.type;
      if (t === "weeklyEarliestZman" || t === "weeklyLatestZman" || t === "weeklyLatestZmanOrFixed"){
        if (entry.baseField) needed.add(entry.baseField);
      }
    }
  }

  const unionYMDs = Array.from(unionYMDsSet);
  unionYMDs.sort(); // stable order
  const dayResults = await Promise.all(unionYMDs.map(ymd => getDay(cfg, locationId, ymd)));

  const dayByYMD = {};
  for (let i=0; i<unionYMDs.length; i++){
    dayByYMD[unionYMDs[i]] = dayResults[i];
  }

  const aggByProfile = {};
  for (const profile of usedProfiles){
    const earliest = {}; // field -> {minutes, ymd}
    const latest = {};

    const dates = datesByProfile[profile] || [];
    for (const d of dates){
      const ymd = formatYMD(d);
      const day = dayByYMD[ymd];
      const z = day?.Zman || {};

      for (const field of needed){
        const mins = zmanIsoToMinutes(z?.[field]);
        if (mins === null) continue;

        if (!earliest[field] || mins < earliest[field].minutes){
          earliest[field] = { minutes: mins, ymd };
        }
        if (!latest[field] || mins > latest[field].minutes){
          latest[field] = { minutes: mins, ymd };
        }
      }
    }

    aggByProfile[profile] = { earliest, latest };
  }

  return aggByProfile;
}

function chooseAnchorDate(cfg){
  const anchorNextWeek = !!cfg?.display?.anchorNextWeekOnFriShabbos;
  const now = new Date();
  const dow = now.getDay(); // 0=Sun ... 6=Sat
  if (anchorNextWeek && (dow === 5 || dow === 6)){
    return addDays(now, 7);
  }
  return now;
}

function renderBadgeWeeklyMinchaMaariv(cfg, ctx){
  const badge = $("badge-weekly-mincha-maariv");
  const rule = cfg?.rules?.weeklyMinchaMaariv;
  const baseField = rule?.baseField || "SunsetDefault";
  const offsetMin = rule?.offsetMin ?? -15;

  const profile = rule?.weekProfile || "sunThu";
  const agg = (ctx.weekAggByProfile && ctx.weekAggByProfile[profile]) ? ctx.weekAggByProfile[profile] : ctx.weekAgg;

  const earliest = agg?.earliest?.[baseField];
  if (!earliest){
    badge.textContent = "Mincha/Maariv: —";
    badge.title = "Weekly rule could not be computed";
    return;
  }

  const mins = earliest.minutes + offsetMin;
  badge.textContent = `Mincha/Maariv (weekly): ${minutesToDisplay(mins, ctx.fmt)}`;
  badge.title = `Based on earliest ${baseField} in week (${earliest.ymd}), offset ${offsetMin} min`;
}

async function refreshOnce(){
  setStatus("Loading…");
  const cfg = await loadConfig();
  ensureCfg(cfg);

  const locationId = await getLocationId(cfg);

  const today = new Date();
  const todayYMD = formatYMD(today);

  const day = await getDay(cfg, locationId, todayYMD);

  renderHeader(cfg, day);
  renderZmanim(cfg, day);

  const anchor = chooseAnchorDate(cfg);
  const weekAggByProfile = await computeWeekAggregates(cfg, locationId, anchor);
  const weekAgg = weekAggByProfile?.sunThu || null;

  const fmt = cfg?.display?.timeFormat || "h12";
  const ctx = {
    cfg,
    fmt,
    todayDow: today.getDay(),
    weekAggByProfile,
    weekAgg
  };

  renderScheduleList("shacharis-list", cfg?.davening?.shacharis || [], ctx);
  renderScheduleList("mincha-list", cfg?.davening?.mincha || [], ctx);
  renderScheduleList("maariv-list", cfg?.davening?.maariv || [], ctx);
  renderBadgeWeeklyMinchaMaariv(cfg, ctx);

  const now = new Date();
  const updated = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  setStatus(`Updated ${updated} • Week computed from ${weekAgg.weekStartYMD} (Sun–Thu rules)`);
}

function looksLikeCorsError(err){
  const msg = String(err?.message || err);
  // Different browsers use different phrasing; keep it broad
  return /cors|cross-origin|failed to fetch|networkerror/i.test(msg);
}

async function main(){
  try{
    await refreshOnce();
  } catch (err){
    console.error(err);
    const msg = String(err?.message || err);

    if (looksLikeCorsError(err)){
      setStatus(
        "Error: The browser blocked the MyZmanim request (CORS). For testing you may need a small proxy (e.g., Cloudflare Worker).",
        true
      );
      return;
    }

    setStatus(`Error: ${msg}`, true);
    return;
  }

  // Auto-refresh
  try{
    const cfg = await loadConfig();
    const secs = Math.max(60, Number(cfg?.display?.refreshSeconds || 600));
    setInterval(async () => {
      try{
        await refreshOnce();
      } catch (err){
        console.error(err);
        setStatus(`Error refreshing: ${String(err?.message || err)}`, true);
      }
    }, secs * 1000);
  } catch {
    // If config can't reload for refresh interval, do nothing.
  }
}

document.addEventListener("DOMContentLoaded", main);
