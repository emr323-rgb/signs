/* Shul Zmanim & Schedule (GitHub Pages friendly)
   - Pulls zmanim from Hebcal Zmanim API
   - Shows editable minyan times from config.json
   - Supports "weekly mincha/maariv = earliest shkiah (Sun–Thu) minus 15 minutes"
*/

(function(){
  const CONFIG_URL = "config.json";

  // ---------- DOM ----------
  const el = (id) => document.getElementById(id);
  const zmanimTableBody = () => document.querySelector("#zmanim-table tbody");
  const shacharisBody = () => document.querySelector("#shacharis-table tbody");
  const minchaBody = () => document.querySelector("#mincha-table tbody");
  const maarivBody = () => document.querySelector("#maariv-table tbody");

  // ---------- Time helpers ----------
  function pad2(n){ return String(n).padStart(2, "0"); }

  function ymdFromParts(y,m,d){ return `${y}-${pad2(m)}-${pad2(d)}`; }

  function parseYMD(ymd){
    const [y,m,d] = ymd.split("-").map(Number);
    return {y,m,d};
  }

  function toUTCDateFromYMD(ymd){
    const {y,m,d} = parseYMD(ymd);
    return new Date(Date.UTC(y, m-1, d));
  }

  function addDaysYMD(ymd, delta){
    const dt = toUTCDateFromYMD(ymd);
    dt.setUTCDate(dt.getUTCDate() + delta);
    return ymdFromParts(dt.getUTCFullYear(), dt.getUTCMonth()+1, dt.getUTCDate());
  }

  function getWeekRangeYMD(anchorYMD, weekStartsOn){
    const dt = toUTCDateFromYMD(anchorYMD);
    const dow = dt.getUTCDay(); // 0=Sun
    const diff = (dow - weekStartsOn + 7) % 7;
    const start = addDaysYMD(anchorYMD, -diff);
    const end = addDaysYMD(start, 6);
    return { start, end };
  }

  function getNowYMDInTimeZone(tzid){
    // en-CA returns YYYY-MM-DD; works well for signage
    const s = new Intl.DateTimeFormat("en-CA", {
      timeZone: tzid,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
    return s;
  }

  function formatNowTime(tzid, use24h){
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tzid,
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: !use24h
    }).format(new Date());
  }

  function formatNowDate(tzid){
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tzid,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(new Date());
  }

  function hhmmToMinutes(hhmm){
    const [h,m] = hhmm.split(":").map(Number);
    return (h*60) + m;
  }

  function normalizeMinutes(mins){
    mins = mins % 1440;
    if (mins < 0) mins += 1440;
    return mins;
  }

  function minutesToDisplay(mins, use24h){
    mins = normalizeMinutes(Math.round(mins));
    const h24 = Math.floor(mins/60);
    const m = mins % 60;

    if (use24h){
      return `${pad2(h24)}:${pad2(m)}`;
    }

    const ampm = h24 >= 12 ? "PM" : "AM";
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return `${h12}:${pad2(m)} ${ampm}`;
  }

  function isoToMinutes(isoString){
    // ISO: YYYY-MM-DDTHH:MM:SS-05:00 -> use local clock time after 'T'
    const hhmmss = isoString.split("T")[1].slice(0, 8); // HH:MM:SS
    const [hh, mm, ss] = hhmmss.split(":").map(Number);
    return hh*60 + mm + (ss ? ss/60 : 0);
  }

  function isoToDisplay(isoString, use24h){
    const mins = isoToMinutes(isoString);
    return minutesToDisplay(mins, use24h);
  }

  // ---------- Hebcal fetch ----------
  async function fetchJson(url){
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  function hebcalZmanimUrlByZipRange(zip, startYMD, endYMD){
    const url = new URL("https://www.hebcal.com/zmanim");
    url.search = new URLSearchParams({
      cfg: "json",
      zip: zip,
      start: startYMD,
      end: endYMD
    }).toString();
    return url.toString();
  }

  // ---------- Rendering ----------
  function setStatus(id, text){
    const node = el(id);
    if (node) node.textContent = text;
  }

  function clearTbody(tbody){
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
  }

  function addRow(tbody, label, value){
    const tr = document.createElement("tr");
    const td1 = document.createElement("td");
    td1.className = "label";
    td1.textContent = label;

    const td2 = document.createElement("td");
    td2.className = "value";
    td2.textContent = value;

    tr.appendChild(td1);
    tr.appendChild(td2);
    tbody.appendChild(tr);
  }

  function computeWeeklyEarliestZmanOffset(batchTimes, baseKey, daysToInclude, weekStartYMD, weekEndYMD, offsetMin){
    const obj = batchTimes?.[baseKey];
    if (!obj || typeof obj !== "object") return null;

    let best = null; // { ymd, minutes }
    // Iterate each day in the range explicitly so ordering doesn't matter
    let cur = weekStartYMD;
    while (true){
      const iso = obj[cur];
      if (iso){
        const dt = toUTCDateFromYMD(cur);
        const dow = dt.getUTCDay(); // day-of-week for that calendar date
        if (daysToInclude.includes(dow)){
          const mins = isoToMinutes(iso);
          if (best === null || mins < best.minutes){
            best = { ymd: cur, minutes: mins };
          }
        }
      }
      if (cur === weekEndYMD) break;
      cur = addDaysYMD(cur, 1);
    }

    if (!best) return null;

    return {
      basedOnYMD: best.ymd,
      minutes: normalizeMinutes(best.minutes + offsetMin)
    };
  }

  function computeMinyanTime(minyan, ctx){
    // ctx: { use24h, todayYMD, batchTimes, weeklyRuleResult }
    const use24h = ctx.use24h;

    if (minyan.type === "fixed"){
      if (!minyan.time) return "—";
      return minutesToDisplay(hhmmToMinutes(minyan.time), use24h);
    }

    if (minyan.type === "zmanimOffset"){
      const baseKey = minyan.base;
      const iso = ctx.batchTimes?.[baseKey]?.[ctx.todayYMD];
      if (!iso) return "—";
      const mins = isoToMinutes(iso) + (minyan.offsetMin || 0);
      return minutesToDisplay(mins, use24h);
    }

    if (minyan.type === "weeklyEarliestShkiahMinus15"){
      // Use the precomputed weekly rule (earliest sunset Sun–Thu minus 15) from config.rules.weeklyEarliestShkiah
      const wr = ctx.weeklyRuleResult;
      if (!wr) return "—";
      return minutesToDisplay(wr.minutes, use24h);
    }

    // Advanced generic weekly rule option, if you decide to use it:
    // {
    //   "type": "weeklyEarliestZmanOffset",
    //   "base": "sunset",
    //   "offsetMin": -15,
    //   "daysToInclude": [0,1,2,3,4],
    //   "weekStartsOn": 0
    // }
    if (minyan.type === "weeklyEarliestZmanOffset"){
      const baseKey = minyan.base;
      const days = minyan.daysToInclude || [0,1,2,3,4];
      const offset = (typeof minyan.offsetMin === "number") ? minyan.offsetMin : 0;
      const weekStartsOn = (typeof minyan.weekStartsOn === "number") ? minyan.weekStartsOn : 0;

      // Derive the current week range using today's date
      const { start, end } = getWeekRangeYMD(ctx.todayYMD, weekStartsOn);
      const wr = computeWeeklyEarliestZmanOffset(ctx.batchTimes, baseKey, days, start, end, offset);
      if (!wr) return "—";
      return minutesToDisplay(wr.minutes, use24h);
    }

    return "—";
  }

  function renderZmanim(config, batch, todayYMD){
    const tbody = zmanimTableBody();
    clearTbody(tbody);

    const use24h = (config.display?.timeFormat === "24h");

    const items = config.zmanim?.items || [];
    for (const it of items){
      const iso = batch?.times?.[it.key]?.[todayYMD];
      const val = iso ? isoToDisplay(iso, use24h) : "—";
      addRow(tbody, it.label || it.key, val);
    }
  }

  function renderMinyanim(config, batch, todayYMD, weeklyRuleResult){
    const use24h = (config.display?.timeFormat === "24h");

    // Shacharis
    {
      const tbody = shacharisBody();
      clearTbody(tbody);
      for (const minyan of (config.davening?.shacharis || [])){
        const time = computeMinyanTime(minyan, {use24h, todayYMD, batchTimes: batch?.times, weeklyRuleResult});
        addRow(tbody, minyan.label || "—", time);
      }
    }

    // Mincha
    {
      const tbody = minchaBody();
      clearTbody(tbody);
      for (const minyan of (config.davening?.mincha || [])){
        const time = computeMinyanTime(minyan, {use24h, todayYMD, batchTimes: batch?.times, weeklyRuleResult});
        addRow(tbody, minyan.label || "—", time);
      }
    }

    // Maariv
    {
      const tbody = maarivBody();
      clearTbody(tbody);
      for (const minyan of (config.davening?.maariv || [])){
        const time = computeMinyanTime(minyan, {use24h, todayYMD, batchTimes: batch?.times, weeklyRuleResult});
        addRow(tbody, minyan.label || "—", time);
      }
    }
  }

  // ---------- Main ----------
  async function loadConfig(){
    const bust = `?v=${Date.now()}`;
    return await fetchJson(CONFIG_URL + bust);
  }

  function startClock(tzid, use24h){
    function tick(){
      el("now-time").textContent = formatNowTime(tzid, use24h);
      el("now-date").textContent = formatNowDate(tzid);
    }
    tick();
    return setInterval(tick, 1000);
  }

  async function refreshOnce(){
    const config = await loadConfig();

    // Header
    el("shul-name").textContent = config.shul?.name || "Shul";
    el("location-label").textContent = config.shul?.locationLabel || "";

    if (config.footer?.dataCredit){
      el("data-credit").textContent = config.footer.dataCredit;
    }

    // Clock
    const tzid = config.shul?.tzid || "America/New_York";
    const use24h = (config.display?.timeFormat === "24h");

    // Determine "today" in the shul timezone
    const todayYMD = getNowYMDInTimeZone(tzid);

    // Determine current week range (Sunday-start by default for weekly rules)
    const weekStartsOn = config.rules?.weeklyEarliestShkiah?.weekStartsOn ?? 0;
    const weekRange = getWeekRangeYMD(todayYMD, weekStartsOn);

    // Fetch all zmanim for the week (single efficient call)
    const url = hebcalZmanimUrlByZipRange(config.shul?.zip || "08701", weekRange.start, weekRange.end);

    setStatus("zmanim-status", "Loading…");
    setStatus("schedule-status", "Loading…");

    const batch = await fetchJson(url);

    // Weekly rule: earliest shkiah Sun–Thu minus 15 minutes (configurable)
    let weeklyRuleResult = null;
    const weeklyCfg = config.rules?.weeklyEarliestShkiah;
    if (weeklyCfg?.enabled){
      weeklyRuleResult = computeWeeklyEarliestZmanOffset(
        batch?.times,
        "sunset",
        Array.isArray(weeklyCfg.daysToInclude) ? weeklyCfg.daysToInclude : [0,1,2,3,4],
        weekRange.start,
        weekRange.end,
        (typeof weeklyCfg.offsetMin === "number") ? weeklyCfg.offsetMin : -15
      );

      const noteEl = el("weekly-mincha-note");
      if (noteEl){
        noteEl.style.display = weeklyRuleResult ? "block" : "none";
        if (weeklyRuleResult){
          noteEl.textContent = `Weekly Mincha/Maariv basis: earliest Shkiah (Sun–Thu) this week, then ${weeklyCfg.offsetMin} minutes`;
        }
      }
    }

    // Render
    renderZmanim(config, batch, todayYMD);
    renderMinyanim(config, batch, todayYMD, weeklyRuleResult);

    setStatus("zmanim-status", `For ${todayYMD}`);
    setStatus("schedule-status", " ");

    // Last updated
    if (config.footer?.showLastUpdated !== false){
      el("last-updated").textContent = `Last updated: ${formatNowTime(tzid, use24h)}`;
    }

    return { tzid, use24h, refreshMinutes: config.display?.refreshMinutes ?? 10 };
  }

  let clockInterval = null;
  let refreshTimer = null;

  async function boot(){
    try{
      const { tzid, use24h, refreshMinutes } = await refreshOnce();

      // start clock once
      if (clockInterval) clearInterval(clockInterval);
      clockInterval = startClock(tzid, use24h);

      // refresh periodically
      const minutes = Math.max(2, Number(refreshMinutes) || 10);
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = setInterval(async ()=>{
        try{
          await refreshOnce();
        } catch (e){
          console.error(e);
          setStatus("zmanim-status", "Unable to load zmanim (network/API).");
          setStatus("schedule-status", "Showing last saved values.");
        }
      }, minutes * 60 * 1000);

    } catch (e){
      console.error(e);
      setStatus("zmanim-status", "Unable to load zmanim (check config / network).");
      setStatus("schedule-status", " ");
      // keep trying every 2 minutes
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = setInterval(async ()=> {
        try{ await boot(); } catch(_e) {}
      }, 2 * 60 * 1000);
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
