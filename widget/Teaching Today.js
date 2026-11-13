// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: calendar-alt;

/* Teaching Today — a Scriptable widget for the Teaching Hub (https://rmcathcart-lab.github.io/teaching/).
 * Shows the day's blocks in bell order with each class's lesson, mission or test, like the hub's Today page.
 * Once the last class of the day is over (and on weekends and days off) it shows the next school day.
 *
 * Sizes: small (the class on now or next), medium (the four blocks), large (the four blocks with full titles),
 * and the Lock Screen rectangle and inline widgets (the class on now or next).
 * Tap a block to open that class's Teacher Ledger; tap the date to open the hub.
 *
 * Taps open in Safari. To try opening the Home Screen app instead, long-press the widget → Edit Widget and type
 * app as the Parameter. That uses iOS's unofficial webapp:// links: they only work on some iOS versions, and when
 * the app wasn't already open they land on its start page rather than the class. Clear the Parameter to go back.
 *
 * Nothing to set up and no keys: it reads the same public schedule and class calendars the sites read, and it
 * loads the sites' own schedule and calendar code, so a change on the sites shows up here by itself.
 * It keeps the last copy that worked, so it still shows the day with no signal. */

const SITE = 'https://rmcathcart-lab.github.io/';
const SRC_TTL = 6 * 3600e3;   // the sites' code: look for a new copy every 6 hours
const DATA_TTL = 5 * 60e3;    // schedule and calendars: every 5 minutes at most

const fm = FileManager.local();
const DIR = fm.joinPath(fm.libraryDirectory(), 'teaching-today');
if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true);
const IN_APP = /app/i.test(String(args.widgetParameter || ''));
function link(url) { return IN_APP ? url.replace(/^https:\/\//, 'webapp://') : url; }
let offline = false;          // true when something came from the saved copy because the fetch failed

/* ---------- fetching, with a saved copy of the last answer that worked ---------- */
async function get(url) {
  const r = new Request(url); r.timeoutInterval = 20;
  const t = await r.loadString(), code = r.response && r.response.statusCode;
  if (code && code >= 400) throw new Error('HTTP ' + code);
  return t;
}
async function cached(name, urls, ttl, use) {
  const p = fm.joinPath(DIR, name.replace(/[^\w.-]+/g, '_') + '.json');
  let saved = null;
  if (fm.fileExists(p)) { try { saved = JSON.parse(fm.readString(p)); } catch (e) { saved = null; } }
  if (saved && Date.now() - fm.modificationDate(p).getTime() < ttl) { try { return use(saved); } catch (e) { /* fetch again */ } }
  try {
    const fresh = await Promise.all(urls.map(get)), out = use(fresh);
    fm.writeString(p, JSON.stringify(fresh));
    return out;
  } catch (e) {
    if (!saved) throw e;
    offline = true; return use(saved);
  }
}
function json(texts) { const d = JSON.parse(texts[0]); if (!d || !d.ok) throw new Error((d && d.error) || 'no answer'); return d; }

/* ---------- running the sites' own code (it expects a browser window; it gets a bare stand-in) ---------- */
function standIn(href) {
  const noop = function () {};
  const win = { addEventListener: noop, location: { href: href } };
  win.document = { currentScript: { src: href }, addEventListener: noop };
  return win;
}
function run(win, src) { new Function('window', 'document', 'location', 'setTimeout', src)(win, win.document, win.location, function () {}); }

/* the shared course list, bell schedule and semester logic (teaching/js/courses.js) */
function loadTeach() {
  const url = SITE + 'teaching/js/courses.js';
  return cached('courses', [url], SRC_TTL, function (s) {
    const win = standIn(url); run(win, s[0]);
    const T = win.TEACH; if (!T || !T.periods || !T.semesterOn || !T.BACKEND) throw new Error('courses.js has changed');
    return T;
  });
}
/* one course's catalog and calendar code, and where its backend is */
const courses = {};
function loadCourse(c) {
  if (courses[c.id]) return courses[c.id];
  const base = SITE + c.path + '/js/', robotics = c.kind === 'robotics';
  return (courses[c.id] = cached('course-' + c.id, [base + 'config.js', base + 'catalog.js', base + (robotics ? 'cal.js' : 'calendar.js')], SRC_TTL, function (s) {
    const cfg = new Function(s[0] + '\n;return (typeof HW_CONFIG !== "undefined" && HW_CONFIG) || (typeof RL_CONFIG !== "undefined" && RL_CONFIG) || null;')();
    const win = standIn(SITE + c.path + '/teacher/'); run(win, s[1]); run(win, s[2]);
    const ns = robotics ? win.RL : win.HW;
    if (!cfg || !cfg.backend || !ns || !ns.Cal || !ns.Cal.layout) throw new Error(c.id + ' has changed');
    return { backend: cfg.backend, ns: ns, C: ns.Cal, robotics: robotics };
  }));
}
/* what a class has on a date: [{ label, title, sub, bg, ink }] (the teacher's own entries first, as on the hub).
 * bg / ink = the unit's colour for the label chip, the same colours the hub's chips use. */
function itemsOn(m, cal, off, date) {
  const C = m.C, L = C.layout(cal, off), out = [];
  (cal.events || []).forEach(function (e) { if (e.date === date) out.push({ label: (e.kind === 'exam' ? '📝 ' : '') + e.title, title: '', sub: '' }); });
  (L.byDate[date] || []).forEach(function (x) {
    if (m.robotics) {
      const i = C.info(x.k); if (!i) return;
      out.push({ label: m.ns.mcode(i.num), title: i.title, sub: 'Day ' + x.day + ' of ' + x.len + (x.day === x.len ? ' · due' : ''), bg: m.ns.unitColour ? m.ns.unitColour(i.unit) : '#22d3ee', ink: '#0b1422' });
    } else {
      const i = C.info(x); if (!i) return;
      if (i.kind === 'test') out.push({ label: '📝 ' + C.label(x), title: '', sub: '' });
      else out.push({ label: C.label(x), title: String(i.title || '').replace(/<[^>]+>/g, ''), sub: '', bg: m.ns.unitColor ? m.ns.unitColor(i.unit).solid : '#24508f', ink: '#ffffff' });
    }
  });
  return out;
}
function line(it) { return [it.label, it.title].filter(Boolean).join(' · ') + (it.sub ? ' (' + it.sub + ')' : ''); }

/* ---------- the day ---------- */
async function loadDay() {
  const T = await loadTeach();
  const data = await cached('hub', [T.BACKEND + '?action=public'], DATA_TTL, json);
  if (!data.bell || !data.bell.day1) data.bell = T.DEFAULT_BELL;
  data.noSchool = Array.isArray(data.noSchool) ? data.noSchool : [];
  data.semesters = Array.isArray(data.semesters) ? data.semesters : [];

  const now = new Date(), today = T.key(now), nowM = now.getHours() * 60 + now.getMinutes();
  function teaching(d) { return T.periods(d, data).length > 0 && !!T.semesterOn(d, data); }
  let date = today;
  const semNow = T.semesterOn(today, data);
  const taught = T.periods(today, data).filter(function (p) { return T.entry(semNow, p.block); });   // today's classes (not prep)
  if (!teaching(today) || !taught.length || nowM > T.mins(taught[taught.length - 1].end)) {   // the last class is over, or no school today: the next school day
    date = null;
    for (let d = today, i = 0; i < 150 && !date; i++) { d = T.addDays(d, 1); if (teaching(d)) date = d; }
  }
  const day = { T: T, today: today, nowM: nowM, date: date, rows: [], hasSchedule: data.semesters.length > 0 };
  if (!date) return day;

  const sem = T.semesterOn(date, data);
  day.rows = await Promise.all(T.periods(date, data).map(async function (p) {
    const e = T.entry(sem, p.block), c = e ? T.course(e.c) : null;
    const row = { p: p, e: e, c: c, items: [], note: '', state: 'later',
      label: e ? (e.label || (c ? c.name : e.c) + ' – Block ' + p.block) : 'Prep', url: link(c ? T.ledger(c, e.cls) : T.HUB + '#/today/' + date) };
    if (date === today) row.state = nowM > T.mins(p.end) ? 'past' : nowM >= T.mins(p.start) - 5 ? 'now' : 'later';
    if (!c) return row;
    if (!e.cls) { row.note = 'No class linked yet'; return row; }
    try {
      const m = await loadCourse(c);
      const r = await cached('cal-' + c.id + '-' + e.cls, [m.backend + '?action=cal&class=' + encodeURIComponent(e.cls)], DATA_TTL, json);
      const cal = r.cal ? m.C.clean(r.cal) : null;
      if (!cal) row.note = 'No calendar yet';
      else { row.items = itemsOn(m, cal, r.noSchool || data.noSchool, date); if (!row.items.length) row.note = 'Nothing planned'; }
    } catch (err) { row.note = 'Couldn’t read the calendar'; }
    return row;
  }));
  const dt = T.dayType(date);
  day.type = dt === 'day1' ? 'Day 1' : dt === 'day2' ? 'Day 2' : 'Short periods';
  day.title = (date === today ? 'Today · ' : date === T.addDays(today, 1) ? 'Tomorrow · ' : '') + T.nice(date).replace(',', '');
  day.focus = day.rows.filter(function (r) { return r.e && r.state !== 'past'; })[0] || null;   // the class on now, or the next one
  return day;
}

/* ---------- drawing ---------- */
function dyn(light, dark) { return Color.dynamic(new Color(light), new Color(dark)); }
function mix(a, b, t) { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); let out = '#'; [16, 8, 0].forEach(function (sh) { out += ('0' + Math.round(((x >> sh) & 255) * (1 - t) + ((y >> sh) & 255) * t).toString(16)).slice(-2); }); return out; }
const K = {
  bg: dyn('#eef1f5', '#141a26'), card: dyn('#ffffff', '#1f2737'), ink: dyn('#1d2433', '#eef1f5'), muted: dyn('#5b6577', '#a3acbd'),
  faint: dyn('#8a93a3', '#6f7889'), nowBg: dyn('#fbf3c8', '#4a3f12'), mark: new Color('#f7d046'), markInk: new Color('#4a3a00'), white: new Color('#ffffff'),
  prep: dyn('#c9d0db', '#2b3445')
};
function text(stack, s, font, colour, lines) { const t = stack.addText(String(s)); t.font = font; t.textColor = colour; t.lineLimit = lines || 1; return t; }
function clock(T, t) { return T.time(t).replace(/ (am|pm)$/, ''); }
/* a course's colours: its own colour for the time panel, a pale tint of it for the card. Robotics is near-black, so
 * its tint and accents use the Robotics Lab cyan */
function tones(c) {
  const accent = c.robot ? '#22d3ee' : c.colour;
  return { panel: new Color(c.colour), panelInk: c.robot ? new Color('#22d3ee') : K.white, panelSub: new Color(c.robot ? '#8fdcec' : '#ffffff', 0.78),
    card: dyn(mix(accent, '#ffffff', 0.88), mix(accent, '#141a26', 0.8)), title: dyn(mix(c.robot ? '#0e7490' : c.colour, '#000000', 0.25), mix(accent, '#ffffff', 0.55)) };
}
function badge(stack, c, w, h, size) {
  const b = stack.addStack(); b.size = new Size(w, h); b.cornerRadius = Math.round(h / 3.2); b.centerAlignContent();
  b.backgroundColor = new Color(c.colour);
  b.addSpacer(); const t = text(b, c.mark, Font.heavySystemFont(size), c.robot ? new Color('#22d3ee') : K.white); t.minimumScaleFactor = 0.6; b.addSpacer();
  return b;
}
/* a lesson's label as a chip in its unit's colour ("U4 L8", "M04"); tests and the teacher's own entries are plain */
function chip(stack, it, size, dim) {
  if (!it.bg) return text(stack, it.label, Font.boldSystemFont(size + 1.5), dim ? K.faint : K.ink);
  const c = stack.addStack(); c.setPadding(1.5, 5, 1.5, 5); c.cornerRadius = 5; c.backgroundColor = new Color(it.bg, dim ? 0.45 : 1);
  return text(c, it.label, Font.heavySystemFont(size), new Color(it.ink));
}
function header(w, day, size) {
  const T = day.T, h = w.addStack(); h.centerAlignContent(); h.url = link(T.HUB + '#/today/' + day.date);
  const parts = day.title.split(' · ');
  if (parts.length > 1) { text(h, parts[0], Font.heavySystemFont(size), K.ink); h.addSpacer(6); text(h, parts[1], Font.mediumSystemFont(size), K.muted).minimumScaleFactor = 0.8; }
  else text(h, day.title, Font.heavySystemFont(size), K.ink);
  h.addSpacer();
  const pill = h.addStack(); pill.setPadding(2, 8, 2, 8); pill.cornerRadius = 9; pill.backgroundColor = K.mark;
  text(pill, day.type + (offline ? ' · saved' : ''), Font.boldSystemFont(size - 3.5), K.markInk);
}

function medium(w, day) {
  const T = day.T;
  w.setPadding(11, 9, 10, 9); w.spacing = 2;
  header(w, day, 13.5); w.addSpacer(3);
  day.rows.forEach(function (r) {
    const s = w.addStack(); s.centerAlignContent(); s.setPadding(2.5, 5, 2.5, 6); s.cornerRadius = 7; s.spacing = 6; s.url = r.url;
    if (r.state === 'now') s.backgroundColor = K.nowBg;
    const past = r.state === 'past';
    const tm = s.addStack(); tm.size = new Size(35, 16); tm.centerAlignContent(); tm.addSpacer();
    text(tm, clock(T, r.p.start), Font.semiboldSystemFont(12), past ? K.faint : K.ink);
    if (r.c) badge(s, r.c, 30, 16, 10); else { const gap = s.addStack(); gap.size = new Size(30, 16); gap.centerAlignContent(); gap.addSpacer(); text(gap, r.p.block, Font.semiboldSystemFont(11), K.faint); gap.addSpacer(); }
    const colour = !r.e || past ? K.faint : r.items.length ? K.ink : K.muted;
    if (!r.e) text(s, 'Prep', Font.mediumSystemFont(12.5), colour);
    else if (!r.items.length) text(s, r.note || r.label, Font.mediumSystemFont(12.5), colour);
    else {
      const it = r.items[0]; chip(s, it, 10, past);
      const rest = [it.title, it.sub].filter(Boolean).join(' · ') + (r.items.length > 1 ? '  + ' + r.items.slice(1).map(function (x) { return x.label; }).join(', ') : '');
      if (rest) text(s, rest, Font.mediumSystemFont(12.5), colour);
    }
    s.addSpacer();
  });
  w.addSpacer();
}
/* Large: the cards stretch to share the widget's height (the flexible spacers inside each card do that), so there's
 * no empty space under the last block whatever the widget's size */
function large(w, day) {
  const T = day.T, gaps = [];
  for (let i = 1; i < day.rows.length; i++) { const a = T.mins(day.rows[i - 1].p.end), b = T.mins(day.rows[i].p.start); if (b - a >= 20) gaps[i] = (a >= 660 && a <= 780 ? 'Lunch' : 'Break') + ' · ' + clock(T, day.rows[i - 1].p.end) + ' to ' + T.time(day.rows[i].p.start); }
  w.setPadding(14, 12, 12, 12); w.spacing = 6;
  header(w, day, 16); w.addSpacer(1);
  day.rows.forEach(function (r, i) {
    if (gaps[i]) { const g = w.addStack(); g.centerAlignContent(); g.addSpacer(); text(g, gaps[i], Font.mediumSystemFont(11), K.faint); g.addSpacer(); }
    const past = r.state === 'past', now = r.state === 'now', tn = r.c ? tones(r.c) : null;
    const s = w.addStack(); s.cornerRadius = 14; s.setPadding(5, 5, 5, 0); s.url = r.url;
    s.backgroundColor = now ? K.nowBg : tn ? tn.card : K.card;
    if (now) { s.borderWidth = 2.5; s.borderColor = K.mark; }
    /* the time, on the course's colour */
    const tm = s.addStack(); tm.layoutVertically(); tm.size = new Size(60, 0); tm.setPadding(5, 9, 5, 4); tm.cornerRadius = 10;
    tm.backgroundColor = tn ? new Color(r.c.colour, past ? 0.5 : 1) : K.prep;
    tm.addSpacer();
    text(tm, clock(T, r.p.start), Font.heavySystemFont(16), tn ? tn.panelInk : K.ink);
    text(tm, 'to ' + clock(T, r.p.end), Font.mediumSystemFont(10.5), tn ? tn.panelSub : K.muted);
    tm.addSpacer();
    /* the class and what's on */
    const body = s.addStack(); body.layoutVertically(); body.setPadding(3, 10, 3, 10); body.spacing = 3;
    body.addSpacer();
    const top = body.addStack(); top.centerAlignContent(); top.spacing = 6;
    if (now) { const n = top.addStack(); n.setPadding(1, 5, 1, 5); n.cornerRadius = 5; n.backgroundColor = K.mark; text(n, 'NOW', Font.heavySystemFont(9.5), K.markInk); }
    text(top, r.label, Font.boldSystemFont(14), !r.e ? K.muted : past ? K.faint : tn ? tn.title : K.ink).minimumScaleFactor = 0.75;
    top.addSpacer();
    if (r.e) {
      if (!r.items.length) text(body, r.note, Font.systemFont(12.5), K.muted);
      r.items.slice(0, 2).forEach(function (it) {
        const ln = body.addStack(); ln.topAlignContent(); ln.spacing = 6;
        chip(ln, it, 11, past);
        const rest = [it.title, it.sub].filter(Boolean).join(' · ');
        if (rest) text(ln, rest, Font.mediumSystemFont(13), past ? K.faint : K.ink, r.items.length > 1 ? 1 : 2).minimumScaleFactor = 0.9;
      });
      if (r.items.length > 2) text(body, '+ ' + (r.items.length - 2) + ' more', Font.systemFont(11), K.faint);
    }
    body.addSpacer();
    s.addSpacer();
  });
}
function small(w, day) {
  const T = day.T, r = day.focus;
  w.setPadding(12, 12, 12, 12); w.spacing = 3; w.url = r ? r.url : link(T.HUB + '#/today/' + day.date);
  if (!r) { text(w, day.title, Font.boldSystemFont(12), K.muted); w.addSpacer(4); text(w, 'No more classes today', Font.boldSystemFont(15), K.ink, 2); w.addSpacer(); return; }
  const lead = day.date !== day.today ? day.title.split(' · ')[0] : r.state === 'now' && day.nowM >= T.mins(r.p.start) ? 'Now' : 'Next';
  const h = w.addStack(); h.centerAlignContent();
  text(h, lead.toUpperCase(), Font.heavySystemFont(10.5), r.state === 'now' ? new Color('#b8860b') : K.muted); h.addSpacer();
  text(h, clock(T, r.p.start) + '–' + clock(T, r.p.end), Font.mediumSystemFont(10.5), K.muted);
  w.addSpacer(3);
  const top = w.addStack(); top.centerAlignContent(); top.spacing = 6;
  badge(top, r.c || { mark: r.p.block, colour: '#5b6577' }, 30, 17, 10.5);
  text(top, r.c ? r.c.name : r.label, Font.boldSystemFont(14), K.ink).minimumScaleFactor = 0.7;
  w.addSpacer(2);
  if (r.items.length) {
    const it = r.items[0];
    text(w, it.label, Font.boldSystemFont(13), K.ink).minimumScaleFactor = 0.7;
    if (it.title) text(w, it.title, Font.systemFont(12), K.muted, 3).minimumScaleFactor = 0.85;
    if (it.sub) text(w, it.sub, Font.systemFont(11), K.faint);
    if (r.items.length > 1) text(w, '+ ' + (r.items.length - 1) + ' more', Font.systemFont(11), K.faint);
  } else text(w, r.note, Font.systemFont(12.5), K.muted, 2);
  w.addSpacer();
}
/* Lock Screen: no colour, three short lines (or one for the inline widget) */
function lock(w, day, inline) {
  const T = day.T, r = day.focus;
  w.url = r ? r.url : link(T.HUB + '#/today/' + day.date);
  if (!r) { w.addText(inline ? 'No more classes today' : day.title).font = Font.boldSystemFont(13); if (!inline) w.addText('No more classes').font = Font.systemFont(12); return; }
  const name = r.c ? r.c.name : r.label, it = r.items[0], first = it ? it.label : r.note;
  if (inline) { w.addText(clock(T, r.p.start) + ' ' + (r.c ? r.c.mark : name) + ' · ' + first); return; }
  const a = w.addText(clock(T, r.p.start) + '  ' + name + ' ' + r.p.block); a.font = Font.boldSystemFont(13); a.lineLimit = 1; a.minimumScaleFactor = 0.8;
  const b = w.addText(first + (it && it.sub ? ' · ' + it.sub.replace(' · due', ', due') : '')); b.font = Font.semiboldSystemFont(12); b.lineLimit = 1; b.minimumScaleFactor = 0.8;
  if (it && it.title) { const c = w.addText(it.title); c.font = Font.systemFont(12); c.lineLimit = 1; }
}
function message(w, title, body, url) {
  w.setPadding(14, 14, 14, 14); if (url) w.url = link(url);
  text(w, title, Font.boldSystemFont(14), K.ink, 2); w.addSpacer(4); text(w, body, Font.systemFont(12), K.muted, 4); w.addSpacer();
}

/* ---------- go ---------- */
const family = config.widgetFamily || 'medium';
const onLock = family.indexOf('accessory') === 0;
const widget = new ListWidget();
if (!onLock) widget.backgroundColor = K.bg;
let nextLook = Date.now() + 30 * 60e3;
try {
  const day = await loadDay();
  if (!day.date) message(widget, day.hasSchedule ? 'No school days coming up' : 'Set up your schedule', day.hasSchedule ? 'The schedule has no classes in the next few months.' : 'Open the Teaching Hub and say which course is in each block.', day.T.HUB + '#/schedule');
  else if (onLock) lock(widget, day, family === 'accessoryInline');
  else if (family === 'small') small(widget, day);
  else if (family === 'large' || family === 'extraLarge') large(widget, day);
  else medium(widget, day);
  if (day.date === day.today) {   // look again when the next block starts or ends, so "now" keeps up
    const base = new Date(); base.setHours(0, 0, 0, 0);
    day.rows.forEach(function (r) {
      [day.T.mins(r.p.start) - 5, day.T.mins(r.p.end) + 1].forEach(function (m) { const t = base.getTime() + m * 60e3; if (t > Date.now() + 30e3 && t < nextLook) nextLook = t; });
    });
  }
} catch (err) {
  message(widget, 'Can’t reach the Teaching Hub', 'It will try again in a few minutes. (' + String((err && err.message) || err).slice(0, 80) + ')', SITE + 'teaching/');
  nextLook = Date.now() + 5 * 60e3;
}
widget.refreshAfterDate = new Date(nextLook);
Script.setWidget(widget);
if (config.runsInApp) await widget.presentMedium();
Script.complete();
