/* Ryan's courses and teaching schedule — the ONE shared copy, loaded by every Teacher Ledger (math10c, math15,
 * robotics), the Teaching Hub (teaching/) and the universal bookmark (teaching/go/).
 *
 *  TEACH.COURSES        every course site: badge, colour, folder, where its ledger keeps its teacher key
 *  TEACH.data()         the hub's settings as last seen on this device: bell times, days off, semesters (the schedule)
 *  TEACH.refresh()      fetches them from the Teaching Hub backend (and keeps a copy on this device)
 *  TEACH.target(now)    which class is on now (or was taught last) → its ledger address
 *  TEACH.menu(btn, o)   the course switcher (the badge in a ledger's corner): This semester / Other courses / Universal settings
 *
 * To add a course: add a line to COURSES below (nothing else to copy between repos any more).
 * BACKEND is the Teaching Hub's Apps Script web-app URL (teaching/backend/Code.gs). Empty = the hub keeps its settings
 * on this device only (handy until the backend is deployed). */
(function (root) {
  'use strict';
  var BACKEND = '';

  var T = root.TEACH = root.TEACH || {};
  /* the site root (https://rmcathcart-lab.github.io/): this file lives at <root>/teaching/js/courses.js */
  var here = (document.currentScript && document.currentScript.src) || '';
  T.SITE = here ? here.replace(/teaching\/js\/courses\.js(\?.*)?$/, '') : '/';
  T.HUB = T.SITE + 'teaching/';
  T.BACKEND = root.TEACH_BACKEND != null ? root.TEACH_BACKEND : BACKEND;

  /* ns = the prefix the site's js/ns.js puts on its browser storage; key = the storage key its ledger signs in with */
  T.COURSES = [
    { id: 'math10c', mark: '10C', name: 'Math 10C', colour: '#0f5f5a', path: 'math10c', ns: '', key: 'hw:tkey', kind: 'math', prefix: '10c' },
    { id: 'math15', mark: '15', name: 'Math 15', colour: '#1e3a6e', path: 'math15', ns: 'm15/', key: 'hw:tkey', kind: 'math', prefix: '15' },
    { id: 'robotics', mark: 'RL', name: 'Robotics', full: 'Robotics (DTFI 15/25/35)', colour: '#0b1422', path: 'robotics', ns: 'rl/', key: 'tkey', kind: 'robotics', prefix: 'rl', robot: true }
  ];
  T.course = function (id) { return T.COURSES.filter(function (c) { return c.id === id; })[0] || null; };
  T.ledger = function (c, code) { c = typeof c === 'string' ? T.course(c) : c; return c ? T.SITE + c.path + '/teacher/' + (code ? '?class=' + encodeURIComponent(code) : '') : T.HUB; };
  T.site = function (c) { c = typeof c === 'string' ? T.course(c) : c; return c ? T.SITE + c.path + '/' : T.SITE; };
  /* the old list name, for anything that still reads it */
  root.HW_COURSES = T.COURSES.map(function (c) { return { mark: c.mark, name: c.name, colour: c.colour, ledger: T.ledger(c) }; });
  T.ROBOT = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="10" fill="#070d17"/><path d="M32 18v-7" stroke="#22d3ee" stroke-width="3"/><circle cx="32" cy="8.5" r="4.5" fill="#ff8a3d"/><rect x="7" y="28" width="6" height="13" rx="2" fill="#22d3ee"/><rect x="51" y="28" width="6" height="13" rx="2" fill="#22d3ee"/><rect x="12" y="17" width="40" height="36" rx="7" fill="#22d3ee"/><rect x="19" y="26" width="10" height="10" rx="2.5" fill="#070d17"/><rect x="35" y="26" width="10" height="10" rx="2.5" fill="#070d17"/><circle cx="26.5" cy="28.5" r="1.8" fill="#22d3ee"/><circle cx="42.5" cy="28.5" r="1.8" fill="#22d3ee"/><rect x="23" y="42" width="18" height="4.5" rx="1.5" fill="#070d17"/></svg>';
  T.badge = function (c, cls) {
    c = typeof c === 'string' ? T.course(c) : c; if (!c) return '';
    return c.robot ? '<span class="' + (cls || 'tsw-mark') + ' tsw-robot">' + T.ROBOT + '</span>' : '<span class="' + (cls || 'tsw-mark') + '" style="background:' + c.colour + '">' + esc(c.mark) + '</span>';
  };

  /* ---- browser storage, without a site's ns.js prefix (all the course sites share rmcathcart-lab.github.io) ----
   * Named properties (localStorage['x']) skip the getItem/setItem that ns.js wraps, so this reads the real key. */
  T.raw = function (k, v) {
    try {
      var s = root.localStorage;
      if (v === undefined) { var x = s[k]; return x == null || typeof x === 'function' ? null : String(x); }
      if (v === null) delete s[k]; else s[k] = String(v);
    } catch (e) { return null; }
    return v;
  };
  /* a course ledger's teacher key on this device ('' if it isn't signed in here) */
  T.courseKey = function (id, v) { var c = T.course(id); if (!c) return ''; var k = c.ns + c.key; if (v === undefined) return T.raw(k) || ''; T.raw(k, v || null); return v; };

  /* ---- the hub's settings ---- */
  T.DEFAULT_BELL = {
    day1: [['A', '09:00', '10:28'], ['B', '10:33', '12:00'], ['C', '12:45', '14:13'], ['D', '14:18', '15:45']],
    day2: [['B', '09:00', '10:28'], ['A', '10:33', '12:00'], ['D', '12:45', '14:13'], ['C', '14:18', '15:45']],
    fri:  [['A', '09:00', '10:07'], ['B', '10:11', '11:18'], ['C', '11:48', '12:55'], ['D', '12:58', '14:05']]
  };
  T.BLOCKS = ['A', 'B', 'C', 'D'];
  T.DAYTYPES = [['day1', 'Mon / Wed', 'Day 1'], ['day2', 'Tue / Thu', 'Day 2'], ['fri', 'Friday', 'Short periods']];
  var CACHE = 'teach/hub';
  T.empty = function () { return { bell: T.DEFAULT_BELL, noSchool: [], semesters: [] }; };
  T.data = function () {
    var c = null; try { c = JSON.parse(T.raw(CACHE) || 'null'); } catch (e) {}
    var d = (c && c.data) || T.empty();
    if (!d.bell || !d.bell.day1) d.bell = T.DEFAULT_BELL;
    d.noSchool = Array.isArray(d.noSchool) ? d.noSchool : []; d.semesters = Array.isArray(d.semesters) ? d.semesters : [];
    return d;
  };
  T.dataAge = function () { try { var c = JSON.parse(T.raw(CACHE) || 'null'); return c && c.at ? Date.now() - c.at : Infinity; } catch (e) { return Infinity; } };
  T.remember = function (d) { if (d) T.raw(CACHE, JSON.stringify({ at: Date.now(), data: { bell: d.bell, noSchool: d.noSchool, semesters: d.semesters } })); };

  /* GET the backend: fetch, then JSONP if the browser blocks the redirect */
  var cbN = 0;
  function qs(p) { return Object.keys(p).filter(function (k) { return p[k] != null; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(p[k]); }).join('&'); }
  function jsonp(url, p, timeout) {
    return new Promise(function (res, rej) {
      var name = '__teachcb' + (++cbN) + '_' + Date.now(), s = document.createElement('script'), done = false;
      root[name] = function (d) { done = true; clean(); res(d); };
      function clean() { try { delete root[name]; } catch (e) { root[name] = undefined; } if (s.parentNode) s.parentNode.removeChild(s); }
      s.src = url + '?' + qs(Object.assign({}, p, { callback: name }));
      s.onerror = function () { if (!done) { clean(); rej(new Error('network')); } };
      setTimeout(function () { if (!done) { clean(); rej(new Error('timeout')); } }, timeout || 20000);
      document.head.appendChild(s);
    });
  }
  T.get = function (action, params, timeout) {
    if (!T.BACKEND) return Promise.reject(new Error('no backend'));
    var p = Object.assign({ action: action }, params || {}), url = T.BACKEND;
    return fetch(url + '?' + qs(p), { credentials: 'omit', redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .catch(function () { return jsonp(url, p, timeout); });
  };
  T.post = function (body) {
    if (!T.BACKEND) return Promise.reject(new Error('no backend'));
    return fetch(T.BACKEND, { method: 'POST', credentials: 'omit', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
  };
  T.refresh = function () {
    if (!T.BACKEND) return Promise.resolve(T.data());
    return T.get('public').then(function (d) { if (d && d.ok) T.remember(d); return T.data(); }, function () { return T.data(); });
  };

  /* ---- dates and the bell schedule (local time) ---- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  T.key = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  T.parse = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; };
  T.addDays = function (s, n) { var d = T.parse(s); d.setDate(d.getDate() + n); return T.key(d); };
  T.today = function () { return T.key(new Date()); };
  T.nice = function (s, o) { var d = T.parse(s); return d ? d.toLocaleDateString('en-CA', o || { weekday: 'short', month: 'short', day: 'numeric' }) : s; };
  /* Mon/Wed = Day 1, Tue/Thu = Day 2, Friday = short periods */
  T.dayType = function (date) { var d = T.parse(date); if (!d) return null; return ({ 1: 'day1', 2: 'day2', 3: 'day1', 4: 'day2', 5: 'fri' })[d.getDay()] || null; };
  T.isOff = function (date, data) { return (data || T.data()).noSchool.indexOf(date) >= 0; };
  T.isSchoolDay = function (date, data) { return !!T.dayType(date) && !T.isOff(date, data); };
  function mins(t) { var a = String(t || '').split(':'); return (+a[0]) * 60 + (+a[1] || 0); }
  T.mins = mins;
  T.time = function (t) { var m = mins(t), h = Math.floor(m / 60), mm = m % 60; return ((h + 11) % 12 + 1) + ':' + pad(mm) + (h < 12 ? ' am' : ' pm'); };
  /* the day's periods in time order: [{ block, start, end }] (none on a weekend or day off) */
  T.periods = function (date, data) {
    data = data || T.data(); var t = T.dayType(date); if (!t || T.isOff(date, data)) return [];
    return ((data.bell && data.bell[t]) || T.DEFAULT_BELL[t]).map(function (x) { return { block: x[0], start: x[1], end: x[2] }; })
      .sort(function (a, b) { return mins(a.start) - mins(b.start); });
  };
  /* semesters: [{ id, name, start, end, blocks: { A: { c: course id, cls: class code, label } | null (prep) } }] */
  T.semesterOn = function (date, data) { return ((data || T.data()).semesters || []).filter(function (s) { return s.start <= date && date <= s.end; })[0] || null; };
  /* "this semester": the one on today, else the next one to start, else the last one that ended */
  T.currentSemester = function (data, today) {
    data = data || T.data(); today = today || T.today();
    var on = T.semesterOn(today, data); if (on) return on;
    var s = (data.semesters || []).slice().sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    var next = s.filter(function (x) { return x.start > today; })[0]; if (next) return next;
    return s.filter(function (x) { return x.end < today; }).pop() || null;
  };
  T.entry = function (sem, block) { var e = sem && sem.blocks && sem.blocks[block]; return e && e.c ? e : null; };
  /* every class in a semester, in block order: [{ block, c, cls, label, course }] */
  T.classesIn = function (sem) { return T.BLOCKS.map(function (b) { var e = T.entry(sem, b); return e ? { block: b, c: e.c, cls: e.cls || '', label: e.label || '', course: T.course(e.c) } : null; }).filter(Boolean); };
  /* the class code the course's ledger should give each block now: { courseId: { classCode: 'B' } } */
  T.expectedBlocks = function (courseId, data, today) {
    var sem = T.semesterOn(today || T.today(), data || T.data()), out = {};
    T.classesIn(sem).forEach(function (x) { if (x.c === courseId && x.cls) out[x.cls] = x.block; });
    return sem ? out : null;
  };

  /* what's on at a moment: { date, block, start, end, sem, entry } — a block counts from LEAD minutes before its bell */
  var LEAD = 5;
  T.slotAt = function (ms, data) {
    data = data || T.data(); var d = new Date(ms), date = T.key(d), m = d.getHours() * 60 + d.getMinutes(), sem = T.semesterOn(date, data);
    var ps = T.periods(date, data);
    for (var i = 0; i < ps.length; i++) if (m >= mins(ps[i].start) - LEAD && m <= mins(ps[i].end)) return { date: date, block: ps[i].block, start: ps[i].start, end: ps[i].end, sem: sem, entry: T.entry(sem, ps[i].block) };
    return null;
  };
  /* the class that's on now, or the last class taught (today's earlier blocks, then earlier school days) */
  T.target = function (ms, data) {
    data = data || T.data(); ms = ms || Date.now();
    var now = T.slotAt(ms, data);
    if (now && now.entry) return mk(now, 'now');
    var d = new Date(ms), date = T.key(d), m = d.getHours() * 60 + d.getMinutes();
    for (var g = 0; g < 400; g++) {
      var sem = T.semesterOn(date, data), ps = T.periods(date, data).slice().reverse();
      for (var i = 0; i < ps.length; i++) {
        if (g === 0 && mins(ps[i].start) - LEAD > m) continue;   // later today: not taught yet
        var e = T.entry(sem, ps[i].block); if (e) return mk({ date: date, block: ps[i].block, start: ps[i].start, end: ps[i].end, sem: sem, entry: e }, 'last');
      }
      date = T.addDays(date, -1);
    }
    /* nothing taught yet (before the first class of the first semester): the first class there will be */
    var first = (data.semesters || []).slice().sort(function (a, b) { return a.start < b.start ? -1 : 1; })[0], fc = T.classesIn(first)[0];
    return fc ? { why: 'first', course: fc.course, cls: fc.cls, block: fc.block, label: fc.label, sem: first, url: T.ledger(fc.course, fc.cls) } : null;
    function mk(s, why) { var c = T.course(s.entry.c); return { why: why, date: s.date, block: s.block, start: s.start, end: s.end, sem: s.sem, course: c, cls: s.entry.cls || '', label: s.entry.label || '', url: T.ledger(c, s.entry.cls) }; }
  };

  /* ---- the course switcher ---- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  T.esc = esc;
  var CSS = '.tsw{position:fixed;z-index:1000;min-width:290px;max-width:calc(100vw - 16px);max-height:calc(100vh - 80px);overflow:auto;padding:6px;background:#fff;color:#1c2230;border:1px solid #e5e0d5;border-radius:14px;box-shadow:0 14px 34px rgba(28,34,48,.16),0 2px 6px rgba(28,34,48,.08);font:15px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:left}' +
    '.tsw-h{display:flex;justify-content:space-between;gap:10px;padding:8px 10px 5px;font-size:12.5px;font-weight:700;color:#6b7280}.tsw-h span{font-weight:500}' +
    '.tsw-row{display:flex;align-items:center;gap:11px;padding:7px 10px 7px 7px;border-radius:10px;color:inherit;text-decoration:none}' +
    'a.tsw-row:hover,a.tsw-row:focus-visible{background:#f4f1ea;outline:none}.tsw-row.is-here{cursor:default}' +
    '.tsw-mark{flex:none;display:inline-grid;place-items:center;width:34px;height:34px;border-radius:9px;color:#fff;font-weight:800;font-size:13px;letter-spacing:.02em}' +
    '.tsw-robot{background:none!important}.tsw-robot svg{width:34px;height:34px;display:block}' +
    '.tsw-t{display:grid;line-height:1.2;flex:1;min-width:0}.tsw-t b{font-size:15px}.tsw-t>span{font-size:12.5px;color:#6b7280}' +
    '.tsw-tick{color:#2b55a0;font-weight:800}.tsw-blocks{display:flex;gap:4px;flex-wrap:wrap;margin-top:3px}' +
    '.tsw-bk{font-size:11.5px;font-weight:700;padding:1px 7px;border-radius:999px;background:#eef0f4;color:#3a4254;text-decoration:none;border:1px solid transparent}a.tsw-bk:hover{border-color:#9aa3b5;background:#fff}' +
    '.tsw-sep{height:1px;background:#ece9e1;margin:6px 4px}.tsw-other .tsw-mark{opacity:.75}' +
    '.tsw-foot{display:flex;gap:6px;padding:4px}.tsw-btn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 10px;border-radius:10px;border:1px solid #e2ded4;background:#faf9f6;color:#1c2230;font-weight:600;font-size:14px;text-decoration:none;white-space:nowrap}.tsw-btn:hover,.tsw-btn:focus-visible{background:#f1eee6;outline:none}.tsw-btn svg{width:17px;height:17px}' +
    '.tsw.dark{background:#0d1626;color:#e6edf6;border-color:#22324a;box-shadow:0 14px 34px rgba(0,0,0,.5)}.tsw.dark .tsw-h,.tsw.dark .tsw-t>span{color:#8ea0b8}.tsw.dark a.tsw-row:hover,.tsw.dark a.tsw-row:focus-visible{background:#15223a}' +
    '.tsw.dark .tsw-sep{background:#22324a}.tsw.dark .tsw-bk{background:#1a2840;color:#cfe3f5}.tsw.dark .tsw-btn{background:#111d31;border-color:#22324a;color:#e6edf6}.tsw.dark .tsw-btn:hover{background:#1a2840}.tsw.dark .tsw-tick{color:#22d3ee}';
  function css() { if (document.getElementById('tsw-css')) return; var s = document.createElement('style'); s.id = 'tsw-css'; s.textContent = CSS; document.head.appendChild(s); }
  var GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  var CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>';
  var open = null;
  function close(refocus) { if (!open) return; var b = open.btn; open.m.remove(); open = null; b.setAttribute('aria-expanded', 'false'); if (refocus) b.focus(); }
  T.closeMenu = close;
  /* toggle the menu under a button. opts: { current: course id, theme: 'dark' } */
  T.menu = function (btn, opts) {
    if (open) { var same = open.btn === btn; close(); if (same) return; }
    opts = opts || {}; css();
    var data = T.data(), sem = T.currentSemester(data), mine = {}, order = [];
    T.classesIn(sem).forEach(function (x) { if (!x.course) return; if (!mine[x.c]) { mine[x.c] = []; order.push(x.c); } mine[x.c].push(x); });
    var m = document.createElement('div'); m.className = 'tsw' + (opts.theme === 'dark' ? ' dark' : ''); m.setAttribute('role', 'menu'); m.setAttribute('aria-label', 'Your courses');
    function row(c, list) {
      var here = c.id === opts.current, r = document.createElement(here ? 'div' : 'a');
      r.className = 'tsw-row' + (here ? ' is-here' : '') + (list ? '' : ' tsw-other');
      var sub = list ? (list.length > 1 ? 'Blocks ' : 'Block ') + list.map(function (x) { return x.block; }).join(' · ') : 'Teacher Ledger';
      if (here) sub = 'You’re here' + (list ? ' · ' + sub : '');
      r.innerHTML = T.badge(c) + '<span class="tsw-t"><b>' + esc(c.name) + '</b><span>' + esc(sub) + '</span></span>' + (here ? '<span class="tsw-tick" aria-hidden="true">✓</span>' : '');
      if (here) r.setAttribute('aria-current', 'page'); else { r.href = T.ledger(c); r.setAttribute('role', 'menuitem'); }
      if (list && list.length > 1 && list.every(function (x) { return x.cls; })) {   // jump straight to one block's class
        var bl = document.createElement('span'); bl.className = 'tsw-blocks';
        list.forEach(function (x) { var a = document.createElement('a'); a.className = 'tsw-bk'; a.href = T.ledger(c, x.cls); a.textContent = 'Block ' + x.block; a.title = (x.label || c.name + ' · Block ' + x.block); a.addEventListener('click', function (e) { e.stopPropagation(); }); bl.appendChild(a); });
        r.querySelector('.tsw-t').appendChild(bl);
      }
      m.appendChild(r);
    }
    if (order.length) {
      var h = document.createElement('div'); h.className = 'tsw-h'; h.innerHTML = 'This semester<span>' + esc(sem.name || '') + '</span>'; m.appendChild(h);
      order.forEach(function (id) { row(T.course(id), mine[id]); });
      var rest = T.COURSES.filter(function (c) { return !mine[c.id]; });
      if (rest.length) { m.appendChild(sep()); var h2 = document.createElement('div'); h2.className = 'tsw-h'; h2.textContent = 'Other courses'; m.appendChild(h2); rest.forEach(function (c) { row(c, null); }); }
    } else {
      var h3 = document.createElement('div'); h3.className = 'tsw-h'; h3.textContent = 'Your courses'; m.appendChild(h3);
      T.COURSES.forEach(function (c) { row(c, null); });
    }
    m.appendChild(sep());
    var f = document.createElement('div'); f.className = 'tsw-foot';
    var a1 = document.createElement('a'); a1.className = 'tsw-btn'; a1.href = T.HUB + '#/today'; a1.innerHTML = CAL + 'All classes'; a1.setAttribute('role', 'menuitem'); f.appendChild(a1);
    var a2 = document.createElement('a'); a2.className = 'tsw-btn tsw-settings'; a2.href = T.HUB + '#/settings'; a2.innerHTML = GEAR + 'Universal settings'; a2.setAttribute('role', 'menuitem'); f.appendChild(a2);
    m.appendChild(f);
    var r0 = btn.getBoundingClientRect(); m.style.left = Math.max(8, Math.min(r0.left, root.innerWidth - 306)) + 'px'; m.style.top = (r0.bottom + 6) + 'px';
    document.body.appendChild(m); open = { m: m, btn: btn }; btn.setAttribute('aria-expanded', 'true');
    var first = m.querySelector('a.tsw-row') || m.querySelector('a'); if (first && opts.focus !== false) first.focus();
    /* catch up on the schedule in the background (another device may have changed it) */
    if (T.dataAge() > 60000) T.refresh();
    function sep() { var s = document.createElement('div'); s.className = 'tsw-sep'; return s; }
  };
  document.addEventListener('click', function (e) { if (open && !open.m.contains(e.target) && !open.btn.contains(e.target)) close(); });
  document.addEventListener('keydown', function (e) {
    if (!open) return;
    if (e.key === 'Escape') { close(true); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      var items = [].slice.call(open.m.querySelectorAll('a')), i = items.indexOf(document.activeElement);
      if (items.length) { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
    }
  });
  root.addEventListener('resize', function () { close(); });
  /* keep this device's copy of the schedule fresh (ledgers load this file on every visit) */
  if (T.BACKEND && T.dataAge() > 10 * 60000) setTimeout(function () { T.refresh(); }, 1500);
})(window);
