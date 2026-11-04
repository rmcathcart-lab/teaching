/* Teaching Hub — the universal settings and the view across every class.
 *  Today      every block's class and lesson for a day (‹ › to look ahead), with links into each ledger and lesson
 *  Calendar   the universal calendar: every class's calendar on one page (js/ucal.js) — the SAME calendars the ledgers
 *             edit, read and changed through each course's bridge (teacher/bridge.html), so changes go both ways
 *  Schedule   semesters: which course is in which block; saving makes the classes in each course's ledger
 *  Sub plans  a full day's plans for a substitute, as a Word file (js/subplan.js)
 *  Settings   bell times, days off, sub-plan details, course sign-ins, the universal bookmark
 * Settings live in the Teaching Hub backend (backend/Code.gs; TEACH.BACKEND in js/courses.js). With no backend yet they
 * are kept on this device. Bell times and days off are also sent to every course's backend, where class time and the
 * class calendars use them. */
(function (root) {
  'use strict';
  var T = root.TEACH, esc = T.esc;
  var H = root.HUB = { views: {} };
  var view = document.getElementById('view'), top = document.getElementById('topbar');
  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function button(cls, html, fn) { var b = el('button', 'btn ' + (cls || ''), html); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  H.el = el; H.button = button;
  var LOCAL = !T.BACKEND;
  H.local = LOCAL;

  /* ---------------- the settings store ---------------- */
  var S = H.S = { key: T.raw('teach/key') || '', data: null };
  function localData() { var d = null; try { d = JSON.parse(T.raw('teach/local') || 'null'); } catch (e) {} return d || {}; }
  function normalise(d) {
    d = d || {};
    return { bell: d.bell && d.bell.day1 ? d.bell : T.DEFAULT_BELL, bellCustom: !!d.bellCustom, noSchool: Array.isArray(d.noSchool) ? d.noSchool.slice().sort() : [],
      semesters: Array.isArray(d.semesters) ? d.semesters : [], sub: d.sub || {}, keys: d.keys || {} };
  }
  H.load = function () {
    if (LOCAL) { S.data = normalise(localData()); T.remember(S.data); return Promise.resolve(S.data); }
    return T.get('all', { key: S.key }).then(function (d) {
      if (!d || !d.ok) { var e = new Error((d && d.error) || 'no answer'); e.code = d && d.error; throw e; }
      S.data = normalise(d); T.remember(S.data); return S.data;
    });
  };
  /* save one setting: what = bell | noschool | semesters | sub | keys */
  var FIELD = { bell: 'bell', noschool: 'noSchool', semesters: 'semesters', sub: 'sub', keys: 'keys' };
  H.save = function (what, value) {
    if (LOCAL) {
      var all = localData();
      if (what === 'keys') { all.keys = Object.assign({}, all.keys || {}, value); Object.keys(all.keys).forEach(function (k) { if (!all.keys[k]) delete all.keys[k]; }); value = all.keys; }
      else if (what === 'bell' && value === 'reset') { delete all.bell; all.bellCustom = false; value = T.DEFAULT_BELL; }
      else { all[FIELD[what]] = value; if (what === 'bell') all.bellCustom = true; }
      T.raw('teach/local', JSON.stringify(all)); S.data = normalise(all); T.remember(S.data);
      return Promise.resolve({ ok: true });
    }
    return T.post({ action: 'save', key: S.key, what: what, value: value }).then(function (d) {
      if (!d || !d.ok) return d || { ok: false, error: 'no answer' };
      if (what === 'bell') { S.data.bell = d.bell; S.data.bellCustom = !!d.custom; }
      else if (what === 'noschool') S.data.noSchool = d.noSchool;
      else if (what === 'semesters') S.data.semesters = d.semesters;
      else if (what === 'sub') S.data.sub = d.sub;
      else if (what === 'keys') S.data.keys = d.keys;
      T.remember(S.data); return d;
    });
  };

  /* ---------------- the course bridges (hidden frames, one per course) ---------------- */
  var BR = H.BR = {};
  H.bridge = function (id) {
    if (BR[id]) return BR[id].p;
    var c = T.course(id), rec = BR[id] = { status: 'loading', b: null };
    rec.p = new Promise(function (res) {
      var f = el('iframe', 'bridge-frame'); f.title = c.name + ' (connection)'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
      f.src = T.SITE + c.path + '/teacher/bridge.html'; document.body.appendChild(f); rec.frame = f;
      var t0 = Date.now(), done = false;
      function poll() {
        if (done) return; var b = null; try { b = f.contentWindow && f.contentWindow.COURSE_BRIDGE; } catch (e) {}
        if (b) { done = true; res(b); return; }
        if (Date.now() - t0 > 20000) { done = true; res(null); return; }
        setTimeout(poll, 60);
      }
      f.addEventListener('load', poll); setTimeout(poll, 300);
    }).then(function (b) {
      rec.b = b;
      if (!b) { rec.status = 'offline'; return null; }
      if (!b.enabled) { rec.status = 'nobackend'; return b; }
      var stored = (S.data && S.data.keys && S.data.keys[id]) || '';
      if (!b.hasKey() && stored) b.setKey(stored);
      if (!b.hasKey()) { rec.status = 'nokey'; return b; }
      return b.classes(true).then(function (r) {
        if (r.ok) {
          rec.status = 'ok'; rec.classes = r.classes;
          if (stored !== b.key()) { var o = {}; o[id] = b.key(); H.save('keys', o); }   // remember this device's key for the others
        } else if (r.error === 'bad key') {
          if (stored && stored !== b.key()) { b.setKey(stored); return b.classes(true).then(function (r2) { rec.status = r2.ok ? 'ok' : 'badkey'; rec.classes = r2.classes; return b; }); }
          rec.status = 'badkey';
        } else rec.status = 'offline';
        return b;
      });
    });
    return rec.p;
  };
  /* the bridge only if it's signed in and working */
  H.ready = function (id) { return H.bridge(id).then(function (b) { return BR[id].status === 'ok' ? b : null; }); };
  H.resetBridge = function (id) { var r = BR[id]; if (r && r.frame) r.frame.remove(); delete BR[id]; };
  H.statusText = { ok: 'Connected', loading: 'Connecting…', nokey: 'Not signed in', badkey: 'Key not accepted', offline: 'Can’t reach it', nobackend: 'No backend set in its js/config.js' };
  /* sign a course in with its ledger key (also signs that ledger in on this device) */
  H.setCourseKey = function (id, k) {
    return H.bridge(id).then(function (b) {
      if (!b) return { ok: false, error: 'offline' };
      b.setKey(k); return b.classes(true).then(function (r) {
        if (!r.ok) { BR[id].status = r.error === 'bad key' ? 'badkey' : 'offline'; return r; }
        BR[id].status = 'ok'; BR[id].classes = r.classes; var o = {}; o[id] = k; return H.save('keys', o).then(function () { return r; });
      });
    });
  };
  /* bell times and days off go to every course (each keeps a copy for class time and its calendars) */
  H.pushAll = function (what) {
    return Promise.all(T.COURSES.map(function (c) {
      return H.ready(c.id).then(function (b) {
        if (!b) return { id: c.id, ok: false, skipped: true, why: H.statusText[BR[c.id].status] };
        var p = what === 'bell' ? b.setBell(S.data.bellCustom ? S.data.bell : null) : b.setNoSchool(S.data.noSchool);
        return p.then(function (d) { return { id: c.id, ok: !!(d && d.ok), none: d && d.none, error: d && d.error }; }, function (e) { return { id: c.id, ok: false, error: e.message }; });
      });
    }));
  };
  H.pushNote = function (box, res, what) {
    var bad = res.filter(function (r) { return !r.ok; });
    var msg = bad.length ? 'Saved here. Not sent to ' + bad.map(function (r) { return T.course(r.id).name + (r.why ? ' (' + r.why.toLowerCase() + ')' : ''); }).join(', ') + ' — it will be sent next time you open the hub.' : 'Saved and sent to every course.';
    H.flash(box, msg, !!bad.length);
    if (bad.length) T.raw('teach/pending:' + what, '1'); else T.raw('teach/pending:' + what, null);
  };
  /* check every course has the hub's days off and bell times; send them again where they differ */
  function catchUp() {
    T.COURSES.forEach(function (c) {
      H.ready(c.id).then(function (b) {
        if (!b) return;
        b.classes().then(function (r) {
          if (!r.ok) return;
          if (JSON.stringify((r.noSchool || []).slice().sort()) !== JSON.stringify(S.data.noSchool)) b.setNoSchool(S.data.noSchool);
          if (r.bell && b.kind === 'math' && JSON.stringify(r.bell) !== JSON.stringify(S.data.bell)) b.setBell(S.data.bellCustom ? S.data.bell : null);
        });
        applyBlocks(c.id, b);
      });
    });
  }
  /* the semester that's on now decides each class's block (class time); other semesters' classes give theirs up */
  function applyBlocks(id, b) {
    var exp = T.expectedBlocks(id, S.data); if (!exp || b.kind !== 'math') return;
    var known = {}; S.data.semesters.forEach(function (s) { T.classesIn(s).forEach(function (x) { if (x.c === id && x.cls) known[x.cls] = 1; }); });
    b.classes().then(function (r) {
      if (!r.ok) return;
      var taken = {}; Object.keys(exp).forEach(function (code) { taken[exp[code]] = code; });
      r.classes.forEach(function (c) {
        if (exp[c.code] && c.block !== exp[c.code]) b.setBlock(c.code, exp[c.code]);
        else if (!exp[c.code] && known[c.code] && c.block && taken[c.block]) b.setBlock(c.code, '');
      });
    });
  }
  H.applyBlocks = applyBlocks;

  /* ---------------- shell ---------------- */
  var TABS = [['today', 'Today'], ['calendar', 'Calendar'], ['schedule', 'Schedule'], ['subs', 'Sub plans'], ['settings', 'Settings']];
  H.tab = 'today';
  function route() { var h = location.hash.replace(/^#\/?/, '').split('/'); H.tab = TABS.some(function (t) { return t[0] === h[0]; }) ? h[0] : 'today'; H.arg = h[1] || ''; }
  H.go = function (tab, arg) { location.hash = '#/' + tab + (arg ? '/' + arg : ''); };
  function drawTop() {
    top.innerHTML = '';
    var brand = el('button', 'brand brand-btn', '<span class="brand-mark hub-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 4l9 5.5-9 5.5z"/><path d="M7 12v4.5c3 2.2 7 2.2 10 0V12"/></svg></span><span class="brand-name">Teaching Hub</span><span class="brand-caret" aria-hidden="true"></span>');
    brand.type = 'button'; brand.title = 'Switch course'; brand.setAttribute('aria-haspopup', 'menu'); brand.setAttribute('aria-expanded', 'false');
    brand.addEventListener('click', function (e) { e.stopPropagation(); T.menu(brand, { current: 'hub' }); });
    top.appendChild(brand);
    var nav = el('nav', 'tabs'); nav.setAttribute('aria-label', 'Hub');
    TABS.forEach(function (t) { var a = el('a', 'tab' + (H.tab === t[0] ? ' on' : ''), t[1]); a.href = '#/' + t[0]; if (H.tab === t[0]) a.setAttribute('aria-current', 'page'); nav.appendChild(a); });
    top.appendChild(nav);
    document.documentElement.style.setProperty('--toph', top.offsetHeight + 'px');
  }
  H.drawTop = drawTop;
  function render() {
    route(); drawTop(); view.innerHTML = '';
    if (LOCAL) view.appendChild(el('div', 'notice local-note', '<b>Saved on this device only.</b> The Teaching Hub backend isn’t connected yet, so these settings stay in this browser. To share them with your other devices, deploy <code>teaching/backend/Code.gs</code> and put its web-app URL in <code>teaching/js/courses.js</code>.'));
    var body = el('div', 'hub-body hub-' + H.tab); view.appendChild(body);
    (H.views[H.tab] || H.views.today)(body);
    root.scrollTo(0, 0);
  }
  H.render = render;
  H.flash = function (box, msg, bad) { var n = box.querySelector(':scope > .flash'); if (!n) { n = el('div', 'flash'); box.appendChild(n); } n.className = 'flash' + (bad ? ' bad' : ''); n.textContent = msg; clearTimeout(n._t); n._t = setTimeout(function () { n.remove(); }, bad ? 9000 : 4000); };
  function keyScreen(msg) {
    route(); drawTop(); view.innerHTML = '';
    var c = el('div', 'signin-card'); c.innerHTML = '<div class="signin-mark hub-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 4l9 5.5-9 5.5z"/><path d="M7 12v4.5c3 2.2 7 2.2 10 0V12"/></svg></div><h1>Teaching Hub</h1><p class="muted">Enter the hub’s teacher key. It’s in the Teaching Hub Apps Script project (Project Settings → Script properties → TEACHER_KEY). Once you’re in, every course ledger on this device is signed in too.</p>';
    if (msg) c.appendChild(el('div', 'notice', esc(msg)));
    var inp = el('input', 'field'); inp.type = 'password'; inp.placeholder = 'Teacher key'; inp.autocomplete = 'off'; c.appendChild(inp);
    var go = button('btn-primary btn-block', 'Open the hub', sub); c.appendChild(go);
    function sub() { S.key = inp.value.trim(); if (!S.key) return; T.raw('teach/key', S.key); boot(); }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') sub(); });
    view.appendChild(c); inp.focus();
  }
  function boot() {
    if (!LOCAL && !S.key) return keyScreen();
    view.innerHTML = '<div class="loading">Opening the hub…</div>';
    H.load().then(function () {
      render(); catchUp();
    }, function (e) {
      if (e.code === 'bad key') { T.raw('teach/key', null); S.key = ''; return keyScreen('That key didn’t work.'); }
      /* offline: use this device's copy so Today and the bookmark still work */
      S.data = normalise(Object.assign({}, T.data())); render();
      view.insertBefore(el('div', 'notice bad', 'Couldn’t reach the Teaching Hub backend (' + esc(e.message) + '). Showing the copy saved on this device; changes can’t be saved until it’s back.'), view.firstChild);
    });
  }
  root.addEventListener('hashchange', function () { if (S.data) render(); });
  /* coming back to the hub (after editing a ledger's calendar in another tab): read the calendars again */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !S.data) return;
    Object.keys(BR).forEach(function (id) { var b = BR[id].b; if (b && b.forget) b.forget(); });
    if (H.tab === 'calendar' || H.tab === 'today') render();
  });

  /* ---------------- shared bits ---------------- */
  H.semester = function () { return T.currentSemester(S.data); };
  H.dayLabel = function (date) { var t = T.dayType(date); return t ? ({ day1: 'Day 1', day2: 'Day 2', fri: 'Friday' })[t] : 'Weekend'; };
  /* the next school day on or after a date */
  H.nextSchoolDay = function (date, data) { var d = date; for (var g = 0; g < 60; g++) { if (T.isSchoolDay(d, data || S.data)) return d; d = T.addDays(d, 1); } return date; };
  H.prevSchoolDay = function (date, data) { var d = date; for (var g = 0; g < 60; g++) { if (T.isSchoolDay(d, data || S.data)) return d; d = T.addDays(d, -1); } return date; };
  /* lunch and other gaps of 20+ minutes between periods */
  H.gaps = function (ps) { var out = []; for (var i = 1; i < ps.length; i++) { var a = T.mins(ps[i - 1].end), b = T.mins(ps[i].start); if (b - a >= 20) out.push({ after: i - 1, start: ps[i - 1].end, end: ps[i].start, name: a >= 11 * 60 && a <= 13 * 60 ? 'Lunch' : 'Break' }); } return out; };
  H.chip = function (it, opts) {
    opts = opts || {};
    var c = el(opts.tag || 'span', 'uchip kind-' + it.kind + (opts.cls ? ' ' + opts.cls : ''));
    c.style.setProperty('--uc', it.colour || '#64748b'); c.style.setProperty('--ucl', it.tint || '#eef1f5'); c.style.setProperty('--ucd', it.dark || '#1f2937');
    var label = it.kind === 'test' ? '📝 ' + it.label : it.kind === 'exam' ? '📝 ' + it.title : it.kind === 'event' ? it.title : it.label;
    c.innerHTML = '<b>' + esc(label) + '</b>' + (it.kind === 'event' || it.kind === 'exam' || it.kind === 'test' ? '' : '<span>' + esc(it.title) + '</span>') + (it.sub ? '<i>' + esc(it.sub) + '</i>' : '');
    c.title = (it.kind === 'lesson' ? it.label + ': ' : '') + it.title + (it.sub ? ' — ' + it.sub : '');
    return c;
  };
  H.badge = function (c, small) { return T.badge(c, 'cmark' + (small ? ' sm' : '')); };

  /* ---------------- Today ---------------- */
  H.views.today = function (body) {
    var date = /^\d{4}-\d{2}-\d{2}$/.test(H.arg) ? H.arg : T.today(), data = S.data;
    var sem = T.semesterOn(date, data), ps = T.periods(date, data), now = T.slotAt(Date.now(), data);
    var head = el('div', 'day-head');
    var prev = button('btn-ghost btn-icon', '‹', function () { H.go('today', H.prevSchoolDay(T.addDays(date, -1))); }); prev.setAttribute('aria-label', 'Previous school day');
    var next = button('btn-ghost btn-icon', '›', function () { H.go('today', H.nextSchoolDay(T.addDays(date, 1))); }); next.setAttribute('aria-label', 'Next school day');
    var h = el('div', 'day-title', '<h1>' + esc(T.nice(date, { weekday: 'long', month: 'long', day: 'numeric' })) + '</h1><div class="muted">' +
      (ps.length ? esc(H.dayLabel(date)) + (sem ? ' · ' + esc(sem.name) : ' · not in a semester') : T.dayType(date) ? 'No school' : 'Weekend') + '</div>');
    head.appendChild(prev); head.appendChild(h); head.appendChild(next);
    if (date !== T.today()) head.appendChild(button('btn-small', 'Today', function () { H.go('today'); }));
    var acts = el('div', 'day-acts');
    acts.appendChild(button('btn-small', 'Sub plans for this day', function () { H.go('subs', date); }));
    head.appendChild(acts);
    body.appendChild(head);
    if (!data.semesters.length) { body.appendChild(el('div', 'panel empty', '<h2>Set up your schedule</h2><p>Tell the hub which course you teach in each block this semester, and it will make the classes in each ledger and fill this page.</p><a class="btn btn-primary" href="#/schedule">Go to Schedule</a>')); return; }
    if (!ps.length) { body.appendChild(el('div', 'panel empty', '<p class="muted">' + (T.dayType(date) ? 'No school on this day.' : 'It’s the weekend.') + '</p><button class="btn" type="button">Next school day ›</button>')); body.querySelector('.empty .btn').addEventListener('click', function () { H.go('today', H.nextSchoolDay(T.addDays(date, 1))); }); return; }
    var list = el('div', 'today-list'), gaps = H.gaps(ps);
    ps.forEach(function (p, i) {
      var e = T.entry(sem, p.block), c = e ? T.course(e.c) : null, isNow = now && now.date === date && now.block === p.block;
      var card = el('section', 'period' + (c ? '' : ' prep') + (isNow ? ' now' : ''));
      if (c) card.style.setProperty('--cc', c.colour);
      card.appendChild(el('div', 'p-time', '<b>' + esc(T.time(p.start)) + '</b><span>' + esc(T.time(p.end)) + '</span>' + (isNow ? '<em>Now</em>' : '')));
      var main = el('div', 'p-main');
      main.appendChild(el('div', 'p-h', '<span class="blk">Block ' + p.block + '</span>' + (c ? H.badge(c, true) + '<b>' + esc(e.label || c.name + ' · Block ' + p.block) + '</b>' : '<b class="muted">Prep</b>')));
      var items = el('div', 'p-items'); main.appendChild(items);
      if (c) {
        if (!e.cls) items.appendChild(el('div', 'small muted', 'No class linked yet — save the schedule to make it.'));
        else {
          items.appendChild(el('div', 'small muted', 'Loading…'));
          H.ready(c.id).then(function (b) {
            items.innerHTML = '';
            if (!b) { items.appendChild(el('div', 'small bad-t', c.name + ': ' + H.statusText[BR[c.id].status] + '. ')); var a = el('a', 'small', 'Sign in under Settings'); a.href = '#/settings'; items.lastChild.appendChild(a); return; }
            b.entries(e.cls, date, date, p.block).then(function (r) {
              if (!r.ok) { items.appendChild(el('div', 'small bad-t', 'Couldn’t read the calendar: ' + esc(r.error))); return; }
              if (r.none) { items.appendChild(el('div', 'small muted', 'This class has no calendar yet. Make one in the Calendar tab.')); return; }
              var its = r.days[date] || [];
              if (!its.length) items.appendChild(el('div', 'small muted', 'Nothing planned.'));
              its.forEach(function (it) {
                var row = el('div', 'p-item'); row.appendChild(H.chip(it, { cls: 'big' }));
                if (it.kind === 'lesson' || it.kind === 'intro') { var bx = el('div', 'p-links'); if (it.lessonUrl) { var l = el('a', 'btn btn-small', 'Lesson page ↗'); l.href = it.lessonUrl; l.target = '_blank'; l.rel = 'noopener'; bx.appendChild(l); } row.appendChild(bx); }
                if (it.kind === 'mission' && it.due) row.appendChild(el('div', 'small muted', 'Due ' + esc(T.nice(it.due))));
                items.appendChild(row);
              });
            });
          });
        }
        var go = el('a', 'btn btn-small p-ledger', 'Teacher Ledger ›'); go.href = T.ledger(c, e.cls); card.appendChild(main); card.appendChild(go);
      } else card.appendChild(main);
      list.appendChild(card);
      gaps.filter(function (g) { return g.after === i; }).forEach(function (g) { list.appendChild(el('div', 'gap', esc(g.name) + ' · ' + esc(T.time(g.start)) + '–' + esc(T.time(g.end)))); });
    });
    body.appendChild(list);
    var bm = el('div', 'panel tip'), url = T.HUB + 'go/';
    bm.innerHTML = '<h3>One bookmark for every class</h3><p class="small muted">Bookmark this address (or add it to your iPad’s home screen). During a class it opens that class’s Teacher Ledger; at any other time it opens the class you taught last.</p>';
    var row = el('div', 'linkrow'), inp = el('input', 'field'); inp.readOnly = true; inp.value = url; row.appendChild(inp);
    row.appendChild(button('', 'Copy', function (ev) { inp.select(); try { navigator.clipboard.writeText(url); ev.target.textContent = 'Copied'; } catch (e) { document.execCommand('copy'); } }));
    var op = el('a', 'btn', 'Try it'); op.href = url; row.appendChild(op);
    bm.appendChild(row); body.appendChild(bm);
  };

  /* ---------------- Schedule ---------------- */
  function semDraft() { return { id: '', name: 'Semester 1', start: '2026-09-02', end: '2027-01-29', blocks: { A: { c: 'robotics', cls: '', label: '' }, B: { c: 'math15', cls: '', label: '' }, C: null, D: { c: 'math15', cls: '', label: '' } }, draft: true }; }
  function nextDraft(list) {
    var last = list[list.length - 1], n = list.length + 1;
    if (!last) return semDraft();
    var s = H.nextSchoolDay(T.addDays(last.end, 1), { noSchool: [] }), y = +s.slice(0, 4), m = +s.slice(5, 7);
    return { id: '', name: m >= 1 && m <= 6 ? 'Semester 2' : 'Semester ' + n, start: s, end: m >= 1 && m <= 6 ? y + '-06-25' : (y + 1) + '-01-29', blocks: { A: null, B: null, C: null, D: null }, draft: true };
  }
  function suggestCode(c, block, sem, taken) {
    var base = c.prefix + '-' + block.toLowerCase(), code = base, n = 2;
    while (taken[code]) code = base + (n++);
    return code;
  }
  H.views.schedule = function (body) {
    var sems = JSON.parse(JSON.stringify(S.data.semesters));
    if (!sems.length) sems.push(semDraft());
    body.appendChild(el('div', 'page-h', '<h1>Schedule</h1><p class="muted">Which course you teach in each block, semester by semester. Saving makes any new classes in each course’s Teacher Ledger and gives the current semester’s classes their block (class time). The class calendars, the course switcher and the universal bookmark all follow this.</p>'));
    var classes = {}, wrap = el('div', 'sems'); body.appendChild(wrap);
    /* each course's classes, for linking a block to an existing class */
    var loads = T.COURSES.map(function (c) { return H.ready(c.id).then(function (b) { return b ? b.classes() : null; }).then(function (r) { classes[c.id] = r && r.ok ? r.classes : null; }); });
    function draw() {
      wrap.innerHTML = '';
      var used = {};   // class codes already in a block (so two blocks can't share a class)
      sems.forEach(function (s) { T.BLOCKS.forEach(function (b) { var e = s.blocks[b]; if (e && e.c && e.cls) used[e.c + ':' + e.cls] = (used[e.c + ':' + e.cls] || 0) + 1; }); });
      sems.forEach(function (s, si) {
        var card = el('section', 'panel sem' + (s.draft ? ' draft' : '') + (T.semesterOn(T.today(), { semesters: [s] }) ? ' current' : ''));
        var hd = el('div', 'sem-h');
        var nm = el('input', 'field sem-name'); nm.value = s.name; nm.setAttribute('aria-label', 'Semester name'); nm.addEventListener('input', function () { s.name = nm.value; });
        var st = el('input', 'field'); st.type = 'date'; st.value = s.start; st.setAttribute('aria-label', 'First day'); st.addEventListener('change', function () { s.start = st.value; });
        var en = el('input', 'field'); en.type = 'date'; en.value = s.end; en.setAttribute('aria-label', 'Last day'); en.addEventListener('change', function () { s.end = en.value; });
        hd.appendChild(nm); hd.appendChild(el('span', 'small muted', 'from')); hd.appendChild(st); hd.appendChild(el('span', 'small muted', 'to')); hd.appendChild(en);
        if (T.semesterOn(T.today(), { semesters: [s] })) hd.appendChild(el('span', 'tag good', 'Now'));
        if (s.draft) hd.appendChild(el('span', 'tag', 'Not saved yet'));
        var del = button('btn-ghost btn-small sem-del', 'Remove', function () { if (!confirm('Remove ' + (s.name || 'this semester') + ' from the schedule? Its classes stay in the ledgers.')) return; sems.splice(si, 1); draw(); }); hd.appendChild(del);
        card.appendChild(hd);
        var grid = el('div', 'blocks');
        T.BLOCKS.forEach(function (b) {
          var e = s.blocks[b], row = el('div', 'brow'), c = e && e.c ? T.course(e.c) : null;
          row.appendChild(el('div', 'blk big', b));
          var sel = el('select', 'field'); sel.setAttribute('aria-label', 'Block ' + b + ' course');
          [['', 'Prep (no class)']].concat(T.COURSES.map(function (x) { return [x.id, x.full || x.name]; })).forEach(function (o) { var op = el('option', '', esc(o[1])); op.value = o[0]; if ((e && e.c || '') === o[0]) op.selected = true; sel.appendChild(op); });
          sel.addEventListener('change', function () { s.blocks[b] = sel.value ? { c: sel.value, cls: '', label: '' } : null; draw(); });
          row.appendChild(sel);
          var cl = el('div', 'bclass');
          if (c) {
            var list = classes[c.id];
            if (list === undefined) cl.appendChild(el('span', 'small muted', 'Loading ' + esc(c.name) + ' classes…'));
            else {
              if (!e.cls && !e.tried) {   // first look: link the class that already has this block in the ledger
                e.tried = 1;
                var hit = (list || []).filter(function (x) { return x.block === b && !used[c.id + ':' + x.code]; })[0];
                if (hit) { e.cls = hit.code; e.label = hit.label; used[c.id + ':' + hit.code] = 1; }
              }
              var pick = el('select', 'field'); pick.setAttribute('aria-label', 'Block ' + b + ' class');
              var mk = el('option', '', '＋ New class'); mk.value = ''; pick.appendChild(mk);
              (list || []).forEach(function (x) { var o = el('option', '', esc(x.label) + ' (' + x.students + ')' + (x.block ? ' · Block ' + x.block : '')); o.value = x.code; if (x.code === e.cls) o.selected = true; pick.appendChild(o); });
              if (e.cls && list && !list.some(function (x) { return x.code === e.cls; })) { var gone = el('option', '', esc(e.cls) + ' (not found)'); gone.value = e.cls; gone.selected = true; pick.appendChild(gone); }
              pick.addEventListener('change', function () { e.cls = pick.value; var x = (list || []).filter(function (y) { return y.code === pick.value; })[0]; e.label = x ? x.label : ''; draw(); });
              cl.appendChild(pick);
              if (!e.cls) {
                var taken = {}; (list || []).forEach(function (x) { taken[x.code] = 1; taken[x.show] = 1; }); sems.forEach(function (z) { T.BLOCKS.forEach(function (bb) { var q = z.blocks[bb]; if (q && q.c === c.id && q.newCode) taken[q.newCode] = q !== e; }); });
                e.newCode = e.newCode || suggestCode(c, b, s, taken); e.newLabel = e.newLabel || (c.name + ' - Block ' + b);
                var nc = el('input', 'field code'); nc.value = e.newCode; nc.setAttribute('aria-label', 'New class code'); nc.title = 'Class code (what students type)'; nc.addEventListener('input', function () { e.newCode = nc.value.trim().toLowerCase(); });
                var nl = el('input', 'field'); nl.value = e.newLabel; nl.setAttribute('aria-label', 'New class name'); nl.title = 'Class name (what you and students see)'; nl.addEventListener('input', function () { e.newLabel = nl.value; });
                cl.appendChild(nc); cl.appendChild(nl);
              }
              if (list === null) cl.appendChild(el('span', 'small bad-t', esc(c.name) + ': ' + esc(H.statusText[(BR[c.id] || {}).status] || 'not connected')));
              if (e.cls && used[c.id + ':' + e.cls] > 1) cl.appendChild(el('span', 'small bad-t', 'This class is in more than one block.'));
            }
          } else cl.appendChild(el('span', 'small muted', 'Prep'));
          row.appendChild(cl); grid.appendChild(row);
        });
        card.appendChild(grid); wrap.appendChild(card);
      });
      var acts = el('div', 'sem-acts');
      acts.appendChild(button('', '＋ Add a semester', function () { sems.push(nextDraft(sems)); draw(); }));
      var sv = button('btn-primary', 'Save schedule', save); acts.appendChild(sv);
      var log = el('div', 'save-log'); acts.appendChild(log);
      if (H.schedMsg) { log.appendChild(el('div', 'flash', esc(H.schedMsg))); H.schedMsg = ''; }
      wrap.appendChild(acts);
      function save() {
        sv.disabled = true; log.innerHTML = '';
        var bad = sems.filter(function (s) { return !s.start || !s.end || s.start > s.end; })[0];
        if (bad) { sv.disabled = false; H.flash(log, (bad.name || 'A semester') + ' needs a first day before its last day.', true); return; }
        var jobs = [];
        sems.forEach(function (s) {
          T.BLOCKS.forEach(function (b) {
            var e = s.blocks[b]; if (!e || !e.c || e.cls) return;
            var code = String(e.newCode || '').toLowerCase().replace(/[^a-z0-9\-_]/g, ''), c = T.course(e.c);
            if (!code) return;
            jobs.push(function () {
              log.appendChild(el('div', 'small', 'Making ' + esc(c.name) + ' class <b>' + esc(code) + '</b>…'));
              return H.ready(c.id).then(function (bb) {
                if (!bb) throw new Error(c.name + ' isn’t connected (' + H.statusText[BR[c.id].status].toLowerCase() + ')');
                return bb.createClass(code, e.newLabel || (c.name + ' - Block ' + b)).then(function (d) { if (!d.ok) throw new Error(d.error); e.cls = d.code || code; e.label = e.newLabel || ''; });
              });
            });
          });
        });
        jobs.reduce(function (p, f) { return p.then(f); }, Promise.resolve()).then(function () {
          var clean = sems.map(function (s) { var o = { id: s.id, name: s.name, start: s.start, end: s.end, blocks: {} }; T.BLOCKS.forEach(function (b) { var e = s.blocks[b]; o.blocks[b] = e && e.c ? { c: e.c, cls: e.cls || '', label: e.label || '' } : null; }); return o; });
          return H.save('semesters', clean);
        }).then(function (d) {
          sv.disabled = false;
          if (!d.ok) { H.flash(log, d.error, true); return; }
          T.COURSES.forEach(function (c) { H.ready(c.id).then(function (b) { if (b) { b.classes(true); applyBlocks(c.id, b); } }); });
          sems = JSON.parse(JSON.stringify(S.data.semesters)); log.innerHTML = '';
          H.schedMsg = 'Schedule saved' + (jobs.length ? ' (' + jobs.length + ' new class' + (jobs.length === 1 ? '' : 'es') + ' made)' : '') + '. Each class’s calendar is on the Calendar tab.';
          draw();
          T.COURSES.forEach(function (c) { if (BR[c.id] && BR[c.id].b && BR[c.id].status === 'ok') BR[c.id].b.classes(true).then(function (r) { classes[c.id] = r.ok ? r.classes : null; var m = wrap.querySelector('.save-log .flash'); if (m) H.schedMsg = m.textContent; draw(); }); });
        }, function (e) { sv.disabled = false; H.flash(log, 'Stopped: ' + e.message, true); });
      }
    }
    draw();
    Promise.all(loads).then(draw);
  };

  /* ---------------- Settings ---------------- */
  H.views.settings = function (body) {
    body.appendChild(el('div', 'page-h', '<h1>Universal settings</h1><p class="muted">Settings for every course. Bell times and days off are sent to every course’s ledger: they decide class time, when tests “until the end of class” end, and where lessons fall on every class calendar.</p>'));
    body.appendChild(bellPanel());
    var cols = el('div', 'set-cols'), a = el('div', 'set-col'), b = el('div', 'set-col'); cols.appendChild(a); cols.appendChild(b); body.appendChild(cols);
    a.appendChild(daysOffPanel());
    b.appendChild(coursesPanel()); b.appendChild(subPanel()); b.appendChild(devicePanel());
    if (H.arg === 'daysoff') setTimeout(function () { var p = body.querySelector('.daysoff'); if (p) p.scrollIntoView({ behavior: 'smooth' }); }, 50);
  };
  function bellPanel() {
    var p = el('section', 'panel bell-panel'); p.appendChild(el('h3', '', 'Bell times'));
    p.appendChild(el('p', 'small muted', 'Mon/Wed are Day 1, Tue/Thu Day 2, and Friday has short periods. ' + (S.data.bellCustom ? 'You’ve changed these from the 2026–27 times.' : 'These are the 2026–27 times.')));
    var t = el('table', 'tbl bell-tbl'), head = '<thead><tr><th>Block</th>';
    T.DAYTYPES.forEach(function (d) { head += '<th>' + d[1] + '<div class="th-sub">' + d[2] + '</div></th>'; });
    t.innerHTML = head + '</tr></thead>';
    var tb = el('tbody'), ins = {};
    T.BLOCKS.forEach(function (bk) {
      var tr = el('tr'); tr.appendChild(el('td', '', '<b>' + bk + '</b>'));
      T.DAYTYPES.forEach(function (d) {
        var row = (S.data.bell[d[0]] || []).filter(function (x) { return x[0] === bk; })[0] || [bk, '', ''], td = el('td', 'bell-cell');
        var s = el('input', 'field bell-t'), e = el('input', 'field bell-t'); s.type = e.type = 'time'; s.value = row[1]; e.value = row[2];
        s.setAttribute('aria-label', 'Block ' + bk + ' ' + d[1] + ' start'); e.setAttribute('aria-label', 'Block ' + bk + ' ' + d[1] + ' end');
        td.appendChild(s); td.appendChild(el('span', 'bell-to', '–')); td.appendChild(e); tr.appendChild(td); ins[bk + d[0]] = [s, e];
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb); var w = el('div', 'tbl-wrap'); w.appendChild(t); p.appendChild(w);
    var acts = el('div', 'row-acts');
    var sv = button('btn-primary btn-small', 'Save bell times', function () {
      var out = {}, bad = '';
      T.DAYTYPES.forEach(function (d) { out[d[0]] = T.BLOCKS.map(function (bk) { var x = ins[bk + d[0]]; if (!x[0].value || !x[1].value || x[0].value >= x[1].value) bad = bad || ('Block ' + bk + ', ' + d[1]); return [bk, x[0].value, x[1].value]; }).sort(function (x, y) { return x[1] < y[1] ? -1 : 1; }); });
      if (bad) { H.flash(p, 'Check ' + bad + ': it needs a start time before its end time.', true); return; }
      sv.disabled = true;
      H.save('bell', out).then(function (d) { if (!d.ok) { sv.disabled = false; H.flash(p, 'Couldn’t save: ' + d.error, true); return; } return H.pushAll('bell').then(function (res) { sv.disabled = false; H.pushNote(p, res, 'bell'); }); }, function () { sv.disabled = false; H.flash(p, 'Couldn’t reach the hub backend.', true); });
    });
    acts.appendChild(sv);
    if (S.data.bellCustom) acts.appendChild(button('btn-ghost btn-small', 'Go back to the 2026–27 times', function () { if (!confirm('Go back to the 2026–27 bell times?')) return; H.save('bell', 'reset').then(function () { return H.pushAll('bell'); }).then(function () { render(); }); }));
    p.appendChild(acts); return p;
  }
  function daysOffPanel() {
    var p = el('section', 'panel daysoff'); p.appendChild(el('h3', '', 'Days off'));
    p.appendChild(el('p', 'small muted', 'No-school days for the whole school (PD days, holidays, breaks). Every class’s lessons move along around them, and work on a day off doesn’t count as in class. You can also tap days on the Calendar tab (Days off…).'));
    var add = el('div', 'off-add'), a1 = el('input', 'field'), a2 = el('input', 'field'), nm = el('span', 'small muted', '');
    a1.type = a2.type = 'date'; a1.setAttribute('aria-label', 'First day off'); a2.setAttribute('aria-label', 'Last day off (for a break)');
    add.appendChild(a1); add.appendChild(el('span', 'small muted', 'to')); add.appendChild(a2);
    add.appendChild(button('btn-small', 'Add', function () {
      var s = a1.value, e = a2.value || a1.value; if (!s) { a1.focus(); return; } if (e < s) { var t = s; s = e; e = t; }
      var list = S.data.noSchool.slice(), d = s, n = 0;
      for (var g = 0; g < 120 && d <= e; g++) { if (T.dayType(d) && list.indexOf(d) < 0) { list.push(d); n++; } d = T.addDays(d, 1); }
      if (!n) { H.flash(p, 'Those are already days off (or weekends).', true); return; }
      saveOff(list, p);
    }));
    add.appendChild(nm); p.appendChild(add);
    var groups = {}, list = el('div', 'off-list');
    S.data.noSchool.forEach(function (d) { var m = d.slice(0, 7); (groups[m] = groups[m] || []).push(d); });
    var months = Object.keys(groups).sort();
    if (!months.length) list.appendChild(el('p', 'small muted', 'No days off yet.'));
    months.forEach(function (m) {
      var g = el('div', 'off-m'); g.appendChild(el('div', 'off-mh', esc(T.nice(m + '-01', { month: 'long', year: 'numeric' }))));
      var chips = el('div', 'off-chips');
      groups[m].forEach(function (d) { var c = el('span', 'off-chip', esc(T.nice(d, { weekday: 'short', day: 'numeric' }))); var x = button('off-x', '×', function () { saveOff(S.data.noSchool.filter(function (z) { return z !== d; }), p); }); x.setAttribute('aria-label', 'Remove ' + T.nice(d)); c.appendChild(x); chips.appendChild(c); });
      g.appendChild(chips); list.appendChild(g);
    });
    p.appendChild(list);
    var cal = el('a', 'btn btn-small btn-ghost', 'Pick days on the calendar ›'); cal.href = '#/calendar/daysoff'; p.appendChild(cal);
    return p;
  }
  function saveOff(list, box) {
    list = list.slice().sort();
    return H.save('noschool', list).then(function (d) {
      if (!d.ok) { H.flash(box, 'Couldn’t save: ' + d.error, true); return; }
      render();
      return H.pushAll('noschool').then(function (res) { var p = view.querySelector('.daysoff') || view.querySelector('.hub-body'); if (p) H.pushNote(p, res, 'noschool'); return res; });
    }, function () { H.flash(box, 'Couldn’t reach the hub backend.', true); });
  }
  H.saveOff = saveOff;
  function coursesPanel() {
    var p = el('section', 'panel courses'); p.appendChild(el('h3', '', 'Course sign-ins'));
    p.appendChild(el('p', 'small muted', 'The hub reads and changes each course through its own ledger, with that ledger’s teacher key. A key used once here is kept in the hub, so on a new device signing in to the hub signs you in to every ledger.'));
    T.COURSES.forEach(function (c) {
      var row = el('div', 'course-row'); row.innerHTML = H.badge(c) + '<div class="cr-t"><b>' + esc(c.name) + '</b><span class="cr-st small muted">Connecting…</span></div>';
      var form = el('div', 'cr-form'); row.appendChild(form); p.appendChild(row);
      H.bridge(c.id).then(function () {
        var s = BR[c.id].status, st = row.querySelector('.cr-st');
        st.textContent = H.statusText[s] + (s === 'ok' && BR[c.id].classes ? ' · ' + BR[c.id].classes.length + ' class' + (BR[c.id].classes.length === 1 ? '' : 'es') : '');
        st.className = 'cr-st small ' + (s === 'ok' ? 'good-t' : 'bad-t');
        form.innerHTML = '';
        if (s === 'nokey' || s === 'badkey') {
          var k = el('input', 'field'); k.type = 'password'; k.placeholder = c.name + ' ledger key'; k.autocomplete = 'off';
          var go = button('btn-small btn-primary', 'Sign in', function () { if (!k.value.trim()) return; go.disabled = true; H.setCourseKey(c.id, k.value.trim()).then(function (r) { go.disabled = false; if (!r.ok) { H.flash(p, c.name + ': ' + (r.error === 'bad key' ? 'that key didn’t work.' : r.error), true); return; } render(); }); });
          form.appendChild(k); form.appendChild(go);
        } else if (s === 'ok') { var o = el('a', 'btn btn-small btn-ghost', 'Open ledger ›'); o.href = T.ledger(c); form.appendChild(o); }
      });
    });
    return p;
  }
  function subPanel() {
    var sub = S.data.sub || {}, p = el('section', 'panel subset'); p.appendChild(el('h3', '', 'Sub plan details'));
    p.appendChild(el('p', 'small muted', 'Used on every sub plan. Keep anything a substitute needs every time here; each day’s plan adds the lessons.'));
    function field(label, val, rows, ph) { var l = el('label', 'fld', '<span>' + esc(label) + '</span>'), f = rows ? el('textarea', 'field') : el('input', 'field'); if (rows) f.rows = rows; f.value = val || ''; if (ph) f.placeholder = ph; l.appendChild(f); p.appendChild(l); return f; }
    var who = field('Your name on the plans', sub.teacher || 'Mr. Cathcart');
    var room = field('Room', sub.room || 'Room 2997');
    var contact = field('Contact or notes for the sub (optional)', sub.contact || '', 2, 'e.g. email rcathcart@rvschools.ab.ca if anything comes up');
    var rules = field('Rules and routines', sub.rules != null ? sub.rules : H.DEFAULT_RULES, 6);
    var notes = {};
    T.COURSES.forEach(function (c) { notes[c.id] = field(c.name + ': notes for every ' + c.name + ' class (optional)', (sub.notes || {})[c.id] || '', 2, c.kind === 'robotics' ? 'e.g. kits are in the blue bins; students put everything back 5 minutes before the bell' : 'e.g. calculators are in the cupboard by the door'); });
    var sv = button('btn-primary btn-small', 'Save sub plan details', function () {
      var n = {}; Object.keys(notes).forEach(function (k) { n[k] = notes[k].value; });
      sv.disabled = true;
      H.save('sub', { room: room.value, rules: rules.value, contact: contact.value, notes: n, teacher: who.value }).then(function (d) { sv.disabled = false; H.flash(p, d.ok ? 'Saved.' : 'Couldn’t save: ' + d.error, !d.ok); }, function () { sv.disabled = false; H.flash(p, 'Couldn’t reach the hub backend.', true); });
    });
    p.appendChild(sv); return p;
  }
  H.DEFAULT_RULES = 'No phones during class time.\nA student who leaves the room leaves their phone on my desk and takes the hall pass. One student out at a time.';
  H.teacherName = function () { var s = S.data.sub || {}; return s.teacher || 'Mr. Cathcart'; };
  function devicePanel() {
    var p = el('section', 'panel'); p.appendChild(el('h3', '', 'Universal bookmark'));
    var url = T.HUB + 'go/';
    p.appendChild(el('p', 'small muted', 'One address for every class: during a class it opens that class’s Teacher Ledger; at any other time, the class you taught last.'));
    var row = el('div', 'linkrow'), inp = el('input', 'field'); inp.readOnly = true; inp.value = url; row.appendChild(inp);
    row.appendChild(button('', 'Copy', function (ev) { inp.select(); try { navigator.clipboard.writeText(url); ev.target.textContent = 'Copied'; } catch (e) { document.execCommand('copy'); } }));
    p.appendChild(row);
    if (!LOCAL) p.appendChild(button('btn-small btn-ghost', 'Forget the hub key on this device', function () { T.raw('teach/key', null); S.key = ''; keyScreen(); }));
    return p;
  }

  H.boot = boot;
  root.addEventListener('DOMContentLoaded', function () { if (!S.data) boot(); });
  if (document.readyState !== 'loading') setTimeout(function () { if (!S.data && !view.querySelector('.signin-card')) boot(); }, 0);
})(window);
