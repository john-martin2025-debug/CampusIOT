/* CampusIoT script, ESSE Group 3
   All sensor data here is simulated in the browser for demonstration. */
(function () {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const fmt = (n, d = 1) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pad = (n) => String(n).padStart(2, "0");
  const rand = (a, b) => a + Math.random() * (b - a);
  const store = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };

  /* ================= Shared data ================= */
  const CO2_PER_KWH = 0.71; // kg CO2 per kWh, approx. Indian grid average (CEA)

  const ISSUES = {
    lights: { label: "Lights and fans on in an empty room", kind: "energy", rate: 0.63, unit: "kW",
      basis: "10 LED tube lights at 18 W plus 6 ceiling fans at 75 W" },
    ac: { label: "AC running in an empty room", kind: "energy", rate: 1.5, unit: "kW",
      basis: "Typical input power of a 1.5-ton split air conditioner" },
    pcs: { label: "Lab computers left on", kind: "energy", rate: 1.8, unit: "kW",
      basis: "30 desktop computers idling at about 60 W each" },
    drip: { label: "Dripping tap", kind: "water", rate: 1.3, unit: "L/h",
      basis: "EPA WaterSense: one drip per second wastes about 3,000 gallons (11,000 L) a year" },
    toilet: { label: "Leaking toilet cistern", kind: "water", rate: 30, unit: "L/h",
      basis: "EPA WaterSense: a leaking toilet can waste about 200 gallons (750 L) a day" },
    pipe: { label: "Burst pipe or overflowing tank", kind: "water", rate: 300, unit: "L/h",
      basis: "Assumed flow of 5 L per minute, for illustration" }
  };
  const PLACES = ["North Block", "South Block", "Library", "Computer Labs", "Hostel", "Canteen", "Admin Office"];

  const alerts = [];
  function pushAlert(text, kind) {
    const d = new Date();
    alerts.unshift({ text, kind: kind || "energy", time: pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) });
    if (alerts.length > 30) alerts.pop();
    renderAlerts();
  }
  function renderAlerts() {
    const ul = $("#alerts");
    if (!ul) return;
    if (!alerts.length) { ul.innerHTML = '<li class="empty">No alerts. Press "Ping sensors" to fetch new readings.</li>'; return; }
    ul.innerHTML = alerts.map(a => `<li class="${a.kind}"><time>${a.time}</time>${a.text}</li>`).join("");
  }

  /* ================= Routing ================= */
  const SCREENS = ["home", "problem", "solution", "monitor", "report", "references"];
  function route() {
    let id = location.hash.replace("#", "");
    if (id === "main") { $("#main").setAttribute("tabindex", "-1"); $("#main").focus(); return; }
    if (!SCREENS.includes(id)) id = "home";
    SCREENS.forEach(s => { $("#" + s).hidden = s !== id; });
    $$("nav a").forEach(a => { if (a.dataset.link === id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    $("#nav").classList.remove("open");
    $("#menuBtn").setAttribute("aria-expanded", "false");
    const titles = { home: "Home", problem: "The problem", solution: "Our solution", monitor: "Live monitor", report: "Report an issue", references: "References" };
    document.title = titles[id] + " | CampusIoT";
    window.scrollTo(0, 0);
    if (id === "monitor") drawChart();
  }
  window.addEventListener("hashchange", route);

  $("#menuBtn").addEventListener("click", () => {
    const open = $("#nav").classList.toggle("open");
    $("#menuBtn").setAttribute("aria-expanded", String(open));
  });

  /* ================= Theme ================= */
  const root = document.documentElement;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  function isDark() { const t = root.getAttribute("data-theme"); return t ? t === "dark" : mq.matches; }
  function syncThemeBtn() { $("#themeBtn").setAttribute("aria-label", isDark() ? "Switch to light theme" : "Switch to dark theme"); }
  const savedTheme = store.get("campusiot-theme", null);
  if (savedTheme) root.setAttribute("data-theme", savedTheme);
  syncThemeBtn();
  $("#themeBtn").addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    root.setAttribute("data-theme", next);
    store.set("campusiot-theme", next);
    syncThemeBtn();
    drawChart();
  });

  /* ================= Interactive feature 1: campus plan simulation ================= */
  const BLOCKS = [
    { name: "North Block", rooms: [
      { id: "N101", type: "Classroom", load: 0.63 },
      { id: "N102", type: "Classroom", load: 0.63 },
      { id: "N103", type: "Seminar hall, AC", load: 2.13, ac: true },
      { id: "N104", type: "Classroom", load: 0.63 } ] },
    { name: "Computer Labs", rooms: [
      { id: "Lab 1", type: "Computer lab", load: 2.43, pcs: true },
      { id: "Lab 2", type: "Computer lab", load: 2.43, pcs: true },
      { id: "Lab 3", type: "Computer lab, AC", load: 3.93, pcs: true, ac: true } ] },
    { name: "Library", rooms: [
      { id: "Reading", type: "Reading hall, AC", load: 2.13, ac: true },
      { id: "Stacks", type: "Book stacks", load: 0.63 } ] },
    { name: "Hostel", rooms: [
      { id: "Wash A", type: "Washroom", load: 0.1, wet: true },
      { id: "Wash B", type: "Washroom", load: 0.1, wet: true },
      { id: "Wash C", type: "Washroom", load: 0.1, wet: true } ] }
  ];
  const rooms = [];
  BLOCKS.forEach(b => b.rooms.forEach(r => rooms.push(Object.assign(r, {
    block: b.name, occupied: Math.random() < 0.55, power: true, leak: 0, emptyTicks: 0
  }))));
  // Start with a couple of problems so there is something to see
  rooms[1].occupied = false; rooms[1].emptyTicks = 2;
  rooms[5].occupied = false; rooms[5].emptyTicks = 1;
  rooms[10].leak = 30;

  let simMinutes = 9 * 60;
  let wastedKWh = 0;
  let selectedId = null;

  function roomState(r) {
    if (r.power && !r.occupied && !r.wet) return "waste";
    if (r.power && r.occupied) return "ok";
    return "off";
  }
  function renderPlan() {
    $("#blocks").innerHTML = BLOCKS.map(b => `
      <div class="block"><h3>${b.name}</h3><div class="rooms">
        ${b.rooms.map(r => {
          const st = roomState(r);
          const label = st === "waste" ? "Empty, power on" : st === "ok" ? "In use" : "Off";
          const icon = r.leak ? "Leak" : (r.occupied ? "People" : (r.power && !r.wet ? "No one" : ""));
          return `<button class="room ${st}${r.leak ? " leak" : ""}${r.id === selectedId ? " selected" : ""}" data-id="${r.id}"
            aria-label="${r.id}, ${r.type}: ${label}${r.leak ? ", leak detected" : ""}" aria-pressed="${r.id === selectedId}">
            ${r.id}<span class="ico">${icon}</span></button>`;
        }).join("")}
      </div></div>`).join("");
    const kw = rooms.reduce((s, r) => s + (roomState(r) === "waste" ? r.load : 0), 0);
    const lph = rooms.reduce((s, r) => s + r.leak, 0);
    $("#statPower").textContent = fmt(kw);
    $("#statWater").textContent = fmt(lph, 0);
    $("#statTotal").textContent = fmt(wastedKWh, 2);
    $("#simClock").textContent = "Simulated " + pad(Math.floor(simMinutes / 60) % 24) + ":" + pad(simMinutes % 60);
    renderDetail();
  }

  function renderDetail() {
    const box = $("#roomDetail");
    const r = rooms.find(x => x.id === selectedId);
    if (!r) { box.innerHTML = '<p class="muted">Select a room to see its sensor readings.</p>'; return; }
    const st = roomState(r);
    let status, cls;
    if (r.leak) { status = `Water flowing at ${fmt(r.leak, 0)} L/h with no one using it. Possible leak.`; cls = "bad"; }
    else if (st === "waste") { status = `Power on, no one here for ${r.emptyTicks * 10} minutes.`; cls = "bad"; }
    else if (st === "ok") { status = "In use. Nothing to fix."; cls = "good"; }
    else { status = "Power off. Nothing to fix."; cls = "good"; }
    box.innerHTML = `
      <h3>${r.id}, ${r.type}</h3>
      <p class="status-line ${cls}">${status}</p>
      <dl>
        <dt>Motion (PIR)</dt><dd>${r.occupied ? "Detected" : "None"}</dd>
        <dt>Power draw</dt><dd>${r.power ? fmt(r.load, 2) + " kW" : "0 kW"}</dd>
        <dt>Water flow</dt><dd>${r.wet || r.leak ? fmt(r.leak, 1) + " L/h" : "No meter"}</dd>
      </dl>
      <div class="row">
        ${r.power && !r.wet ? `<button class="btn" data-act="off">Switch off power</button>` : ""}
        ${!r.power && !r.wet ? `<button class="btn ghost" data-act="on">Switch power on</button>` : ""}
        ${r.leak ? `<button class="btn" data-act="fix">Mark leak as fixed</button>` : ""}
        ${(st === "waste" || r.leak) ? `<a class="btn ghost" href="#report" data-act="report">Report this</a>` : ""}
      </div>`;
  }

  $("#blocks").addEventListener("click", e => {
    const btn = e.target.closest(".room");
    if (!btn) return;
    selectedId = btn.dataset.id === selectedId ? null : btn.dataset.id;
    renderPlan();
  });
  $("#roomDetail").addEventListener("click", e => {
    const act = e.target.closest("[data-act]");
    const r = rooms.find(x => x.id === selectedId);
    if (!act || !r) return;
    const a = act.dataset.act;
    if (a === "off") { r.power = false; r.emptyTicks = 0; }
    if (a === "on") { r.power = true; }
    if (a === "fix") { r.leak = 0; }
    if (a === "report") {
      const place = r.block;
      const issue = r.leak ? (r.leak >= 200 ? "pipe" : r.leak >= 10 ? "toilet" : "drip") : (r.pcs ? "pcs" : r.ac ? "ac" : "lights");
      $("#place").value = place; $("#issue").value = issue;
      $("#hours").value = r.leak ? "" : String(Math.max(0.25, r.emptyTicks / 6).toFixed(2));
      return; // link navigates to #report
    }
    renderPlan();
  });

  function tick() {
    simMinutes = (simMinutes + 10) % (24 * 60);
    const hour = Math.floor(simMinutes / 60);
    const busy = hour >= 8 && hour < 17;
    rooms.forEach(r => {
      if (r.wet) {
        r.occupied = Math.random() < (busy ? 0.3 : 0.1);
        if (!r.leak && Math.random() < 0.02) r.leak = [1.3, 30, 300][Math.floor(Math.random() * 3)];
        return;
      }
      const pArrive = busy ? 0.25 : 0.03;
      const pLeave = busy ? 0.15 : 0.5;
      if (!r.occupied && Math.random() < pArrive) { r.occupied = true; r.power = true; r.emptyTicks = 0; }
      else if (r.occupied && Math.random() < pLeave) { r.occupied = false; r.power = Math.random() < 0.7; r.emptyTicks = 0; }
      if (!r.occupied && r.power) {
        r.emptyTicks++;
        if ($("#autoCut").checked && r.emptyTicks >= 1) { r.power = false; r.emptyTicks = 0; }
      }
    });
    const kw = rooms.reduce((s, r) => s + (roomState(r) === "waste" ? r.load : 0), 0);
    wastedKWh += kw / 6; // 10 simulated minutes
    renderPlan();
  }
  $("#autoCut").addEventListener("change", e => {
    if (e.target.checked) {
      rooms.forEach(r => { if (!r.occupied && r.power && !r.wet && r.emptyTicks >= 1) { r.power = false; r.emptyTicks = 0; } });
      renderPlan();
    }
  });
  renderPlan();
  setInterval(() => { if (!document.hidden) tick(); }, 3000);

  /* ================= Interactive feature 2: live monitor chart ================= */
  const ZONES = {
    "North Block":   { e: 6,   w: 180, eBase: 0.4, wBase: 4, pattern: "day" },
    "South Block":   { e: 5,   w: 150, eBase: 0.35, wBase: 3, pattern: "day" },
    "Library":       { e: 4,   w: 60,  eBase: 0.3, wBase: 2, pattern: "day" },
    "Computer Labs": { e: 9,   w: 40,  eBase: 0.6, wBase: 1, pattern: "day" },
    "Hostel":        { e: 7,   w: 600, eBase: 1.2, wBase: 12, pattern: "home" }
  };
  function occ(h, pattern) {
    if (pattern === "home") {
      if (h >= 6 && h < 9) return 1;
      if (h >= 18 && h < 23) return 0.9;
      if (h >= 9 && h < 18) return 0.3;
      return 0.08;
    }
    if (h >= 8 && h < 17) return h === 12 ? 0.7 : 1;
    if (h === 7 || h === 17) return 0.45;
    if (h === 18) return 0.2;
    return 0.03;
  }
  function expected(zone, metric, h) {
    const z = ZONES[zone];
    return metric === "energy" ? z.eBase + z.e * occ(h, z.pattern) : z.wBase + z.w * occ(h, z.pattern);
  }
  const series = {}; // series[zone] = {energy:[], water:[], anomE:Set, anomW:Set}
  const nowHour = () => new Date().getHours();

  function makeSeries(zone) {
    const s = { energy: [], water: [], anom: { energy: new Set(), water: new Set() } };
    for (let h = 0; h < 24; h++) {
      s.energy[h] = expected(zone, "energy", h) * rand(0.88, 1.12);
      s.water[h] = expected(zone, "water", h) * rand(0.85, 1.15);
    }
    series[zone] = s;
    return s;
  }
  function injectAnomaly(zone, metric, h, quiet) {
    const s = series[zone], z = ZONES[zone];
    if (metric === "energy") s.energy[h] = expected(zone, "energy", h) + z.e * rand(0.5, 0.8);
    else s.water[h] = expected(zone, "water", h) + z.w * rand(0.25, 0.5) + 40;
    const exp = expected(zone, metric, h);
    const floor = metric === "energy" ? z.e * 0.25 : z.w * 0.15;
    s[metric][h] = Math.max(s[metric][h], exp * rand(1.6, 1.9), exp + floor * 1.3);
    if (!quiet) announceAnomaly(zone, metric, h);
  }
  function isAnomaly(zone, metric, h) {
    const exp = expected(zone, metric, h);
    const v = series[zone][metric][h];
    const z = ZONES[zone];
    const floor = metric === "energy" ? z.e * 0.25 : z.w * 0.15;
    return v > exp * 1.5 && v - exp > floor;
  }
  function announceAnomaly(zone, metric, h) {
    const v = series[zone][metric][h], exp = expected(zone, metric, h);
    const times = v / exp;
    if (metric === "energy") {
      pushAlert(`${zone}: electricity at ${pad(h)}:00 was ${fmt(v)} kWh, about ${fmt(times)}× normal. Possible lights, AC or computers left on.`, "energy");
    } else {
      pushAlert(`${zone}: water use at ${pad(h)}:00 was ${fmt(v, 0)} L against a normal ${fmt(exp, 0)} L. Possible leak or overflow.`, "water");
    }
  }

  Object.keys(ZONES).forEach(makeSeries);
  // Seed realistic after-hours problems that fall in hours already past
  (function seed() {
    const h = nowHour();
    const past = (candidates) => candidates.filter(x => x < h);
    const labs = past([1, 2, 19, 20, 21, 22]);
    if (labs.length) injectAnomaly("Computer Labs", "energy", labs[labs.length - 1], true);
    const hostel = past([2, 3, 4]);
    if (hostel.length) injectAnomaly("Hostel", "water", hostel[0], true);
    Object.keys(ZONES).forEach(z => ["energy", "water"].forEach(m => {
      for (let i = 0; i < h; i++) if (isAnomaly(z, m, i)) announceAnomaly(z, m, i);
    }));
  })();

  const zoneSel = $("#zoneSelect");
  zoneSel.innerHTML = Object.keys(ZONES).map(z => `<option>${z}</option>`).join("");
  zoneSel.value = "Computer Labs";
  let selectedBar = null;

  function metric() { return $('input[name="metric"]:checked').value; }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  function drawChart() {
    const svg = $("#chart");
    if (!svg || $("#monitor").hidden) return;
    const zone = zoneSel.value, m = metric(), s = series[zone];
    const unit = m === "energy" ? "kWh" : "L";
    const h = nowHour();
    const W = 720, H = 300, L = 46, R = 10, T = 14, B = 34;
    const cw = W - L - R, ch = H - T - B;
    // Forecast: scale the normal pattern by today's trend, ignoring unusual hours
    let got = 0, norm = 0;
    for (let i = 0; i <= h; i++) { if (!isAnomaly(zone, m, i)) { got += s[m][i]; norm += expected(zone, m, i); } }
    const ratio = Math.min(1.25, Math.max(0.8, norm > 0 ? got / norm : 1));
    const vals = s[m].map((v, i) => i <= h ? v : expected(zone, m, i) * ratio);
    const exps = vals.map((_, i) => expected(zone, m, i));
    const max = niceMax(Math.max(...vals, ...exps) * 1.1);
    const y = v => T + ch - (v / max) * ch;
    const bw = cw / 24;
    const petrol = cssVar("--petrol"), alertC = cssVar("--alert");
    let out = `<desc id="chartDesc">Hourly ${m === "energy" ? "electricity" : "water"} use for ${zone}. Bars up to ${pad(h)}:00 are measured, later bars are forecasts.</desc>`;
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, yy = y(v);
      out += `<line class="axis" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke-width="1"/>`;
      out += `<text class="tick" x="${L - 6}" y="${yy + 4}" text-anchor="end">${fmt(v, max < 10 ? 1 : 0)}</text>`;
    }
    vals.forEach((v, i) => {
      const future = i > h;
      const anom = !future && isAnomaly(zone, m, i);
      const x = L + i * bw + bw * 0.14, w = bw * 0.72, yy = y(v);
      const fill = anom ? alertC : petrol;
      out += `<rect class="bar${selectedBar === i ? " sel" : ""}" data-h="${i}" tabindex="0" role="button"
        aria-label="${pad(i)}:00, ${fmt(v, m === "energy" ? 1 : 0)} ${unit}${future ? ", forecast" : ""}${anom ? ", unusual" : ""}"
        x="${x}" y="${yy}" width="${w}" height="${Math.max(1, T + ch - yy)}" rx="2"
        style="fill:${fill};opacity:${future ? 0.28 : 1}"><title>${pad(i)}:00 ${fmt(v, 1)} ${unit}</title></rect>`;
      if (i % 3 === 0) out += `<text class="tick" x="${L + i * bw + bw / 2}" y="${H - 12}" text-anchor="middle">${pad(i)}:00</text>`;
    });
    const path = exps.map((v, i) => `${i ? "L" : "M"}${L + i * bw + bw / 2},${y(v)}`).join(" ");
    out += `<path class="base" d="${path}"/>`;
    out += `<line x1="${L + (h + 1) * bw}" x2="${L + (h + 1) * bw}" y1="${T}" y2="${T + ch}" style="stroke:${cssVar("--muted")}" stroke-dasharray="2 3"/>`;
    out += `<text class="tick" x="${L + (h + 1) * bw + 4}" y="${T + 10}">Now</text>`;
    svg.innerHTML = out;

    $("#chartTitle").textContent = m === "energy" ? "Electricity, kWh per hour" : "Water, litres per hour";
    const used = sumTo(s[m], h);
    const forecast = vals.reduce((a, b) => a + b, 0);
    const normal = exps.reduce((a, b) => a + b, 0);
    const delta = ((forecast - normal) / normal) * 100;
    $("#kpiUsed").textContent = fmt(used, m === "energy" ? 1 : 0) + " " + unit;
    $("#kpiForecast").textContent = fmt(forecast, m === "energy" ? 1 : 0) + " " + unit;
    const k = $("#kpiDelta");
    k.textContent = (delta >= 0 ? "+" : "") + fmt(delta, 0) + "%";
    k.className = delta > 5 ? "up" : delta < -5 ? "down" : "";
  }
  function sumTo(arr, h) { let s = 0; for (let i = 0; i <= h; i++) s += arr[i]; return s; }
  function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }

  function showBar(i) {
    selectedBar = i;
    const zone = zoneSel.value, m = metric(), h = nowHour();
    const unit = m === "energy" ? "kWh" : "L";
    drawChart();
    const bar = $(`#chart .bar[data-h="${i}"]`);
    if (bar) bar.focus({ preventScroll: true });
    const exp = expected(zone, m, i);
    if (i > h) { $("#barInfo").textContent = `${pad(i)}:00 is a forecast based on today's trend and this zone's normal pattern (${fmt(exp, 1)} ${unit}).`; return; }
    const v = series[zone][m][i];
    const anom = isAnomaly(zone, m, i);
    $("#barInfo").innerHTML = `<strong>${pad(i)}:00</strong>: ${fmt(v, 1)} ${unit} measured, normal is ${fmt(exp, 1)} ${unit}. ` +
      (anom ? `<span style="color:var(--alert);font-weight:600">Unusual. Sent to the facility team.</span>` : "Within the normal range.");
  }
  $("#chart").addEventListener("click", e => { const b = e.target.closest(".bar"); if (b) showBar(+b.dataset.h); });
  $("#chart").addEventListener("keydown", e => {
    const b = e.target.closest(".bar"); if (!b) return;
    const i = +b.dataset.h;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showBar(i); }
    if (e.key === "ArrowRight" && i < 23) { e.preventDefault(); showBar(i + 1); }
    if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); showBar(i - 1); }
  });
  zoneSel.addEventListener("change", () => { selectedBar = null; $("#barInfo").textContent = "Select a bar to see that hour's reading."; drawChart(); });
  $$('input[name="metric"]').forEach(r => r.addEventListener("change", () => { selectedBar = null; $("#barInfo").textContent = "Select a bar to see that hour's reading."; drawChart(); }));

  $("#pingBtn").addEventListener("click", () => {
    const btn = $("#pingBtn");
    btn.disabled = true; btn.textContent = "Pinging sensors...";
    setTimeout(() => {
      const h = nowHour();
      Object.keys(ZONES).forEach(z => {
        series[z].energy[h] = expected(z, "energy", h) * rand(0.88, 1.12);
        series[z].water[h] = expected(z, "water", h) * rand(0.85, 1.15);
      });
      if (Math.random() < 0.65) {
        const zones = Object.keys(ZONES);
        const z = zones[Math.floor(Math.random() * zones.length)];
        const m = Math.random() < 0.5 ? "energy" : "water";
        injectAnomaly(z, m, h);
      } else {
        pushAlert(`All ${Object.keys(ZONES).length} zones reported normal readings for ${pad(h)}:00.`, "info");
      }
      const d = new Date();
      $("#pingTime").textContent = `Last ping at ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      btn.disabled = false; btn.textContent = "Ping sensors";
      drawChart();
    }, 700);
  });
  renderAlerts();

  /* ================= Interactive feature 3: report and loss estimator ================= */
  $("#place").insertAdjacentHTML("beforeend", PLACES.map(p => `<option>${p}</option>`).join(""));
  $("#issue").insertAdjacentHTML("beforeend",
    `<optgroup label="Electricity">${Object.entries(ISSUES).filter(([, v]) => v.kind === "energy").map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</optgroup>` +
    `<optgroup label="Water">${Object.entries(ISSUES).filter(([, v]) => v.kind === "water").map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</optgroup>`);
  $("#assumptions tbody").innerHTML = Object.values(ISSUES).map(v =>
    `<tr><td>${v.label}</td><td>${fmt(v.rate, v.rate < 10 ? 2 : 0)} ${v.unit}</td><td>${v.basis}</td></tr>`).join("");

  function estimate(issueKey, hours, rateE, rateW) {
    const i = ISSUES[issueKey];
    if (i.kind === "energy") {
      const kwh = i.rate * hours;
      return { kind: "energy", kwh, litres: 0, cost: kwh * rateE, co2: kwh * CO2_PER_KWH };
    }
    const litres = i.rate * hours;
    return { kind: "water", kwh: 0, litres, cost: (litres / 1000) * rateW, co2: 0 };
  }
  function priority(r) {
    if (r.cost >= 500 || r.litres >= 1000) return { cls: "high", label: "High priority" };
    if (r.cost >= 100 || r.litres >= 200) return { cls: "med", label: "Medium priority" };
    return { cls: "low", label: "Low priority" };
  }

  let reports = store.get("campusiot-reports", []);
  function renderLog() {
    const tb = $("#logBody");
    if (!reports.length) { tb.innerHTML = '<tr class="empty"><td colspan="5">No reports yet. Send one using the form above.</td></tr>'; return; }
    tb.innerHTML = reports.map(r => `<tr><td>${r.time}</td><td>${r.place}</td><td>${ISSUES[r.issue] ? ISSUES[r.issue].label : r.issue}</td><td>${fmt(r.hours, 2)}</td><td>${r.summary}</td></tr>`).join("");
  }
  renderLog();

  $("#reportForm").addEventListener("submit", e => {
    e.preventDefault();
    const place = $("#place"), issue = $("#issue"), hours = $("#hours");
    [place, issue, hours].forEach(el => el.classList.remove("invalid"));
    const h = parseFloat(hours.value);
    let msg = "";
    if (!place.value) { msg = "Choose the place where the problem is."; place.classList.add("invalid"); place.focus(); }
    else if (!issue.value) { msg = "Choose what's wrong."; issue.classList.add("invalid"); issue.focus(); }
    else if (!(h > 0) || h > 720) { msg = "Enter how many hours it has been going on, between 0.25 and 720."; hours.classList.add("invalid"); hours.focus(); }
    $("#formError").textContent = msg;
    if (msg) return;

    const rateE = Math.max(0, parseFloat($("#rateE").value) || 0);
    const rateW = Math.max(0, parseFloat($("#rateW").value) || 0);
    const r = estimate(issue.value, h, rateE, rateW);
    const p = priority(r);
    const info = ISSUES[issue.value];
    const main = r.kind === "energy" ? `${fmt(r.kwh, 1)} kWh` : `${fmt(r.litres, 0)} litres`;
    const perDay = r.kind === "energy" ? `${fmt(info.rate * 24, 1)} kWh` : `${fmt(info.rate * 24, 0)} litres`;

    $("#result").className = "result filled";
    $("#result").innerHTML = `
      <span class="priority ${p.cls}">${p.label}</span>
      <h3 style="margin-top:.7rem">${info.label}, ${place.value}</h3>
      <p class="big">${main}</p>
      <p class="muted">wasted over ${fmt(h, h % 1 ? 2 : 0)} hours</p>
      <dl>
        <dt>Estimated cost</dt><dd>₹${fmt(r.cost, 0)}</dd>
        ${r.kind === "energy" ? `<dt>CO₂ emitted</dt><dd>${fmt(r.co2, 1)} kg</dd>` : `<dt>Equivalent</dt><dd>${fmt(r.litres / 10, 0)} buckets of 10 L</dd>`}
        <dt>If left for a full day</dt><dd>${perDay}</dd>
      </dl>
      <p class="sent">Report sent to the facility team for ${place.value}.</p>`;

    const d = new Date();
    reports.unshift({ time: `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
      place: place.value, issue: issue.value, hours: h, summary: `${main}, ₹${fmt(r.cost, 0)}` });
    reports = reports.slice(0, 20);
    store.set("campusiot-reports", reports);
    renderLog();
    pushAlert(`Report from ${place.value}: ${info.label.toLowerCase()}, ${main} wasted so far. Sent to maintenance.`, r.kind === "water" ? "water" : "energy");
  });
  $("#clearLog").addEventListener("click", () => { reports = []; store.set("campusiot-reports", reports); renderLog(); });

  window.addEventListener("resize", () => { if (!$("#monitor").hidden) drawChart(); });
  route();
})();
