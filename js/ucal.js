/* Teaching Hub — the universal calendar: every class's calendar for a semester on one page, one row per block in each
 * school day (in that day's bell order). The rows ARE the class calendars: they're read through each course's bridge, and
 * a change here (drag a lesson to another day, skip one, change a mission's length, mark a day off) is saved to that
 * class's own calendar, so its ledger and its students see it too. Coming back to this tab reads them all again, so
 * changes made in a ledger show up here.
 *   Math lessons: drag onto another day (everything after moves by the same number of class days, like the ledger) or
 *   tap → Skip. Robotics missions run back to back: tap → one class longer / shorter, or take it off.
 *   Days off…: tap school days to mark them off for the whole school (every course's calendar moves along). */
(function (root) {
  'use strict';
  var T = root.TEACH, H = root.HUB, el = H.el, button = H.button, esc = T.esc, S = H.S;
  var U = H.ucal = { undo: [], hidden: {} };
  try { U.hidden = JSON.parse(T.raw('teach/calhide') || '{}') || {}; } catch (e) {}
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  H.views.calendar = function (body) {
    var sems = S.data.semesters;
    if (!sems.length) { body.appendChild(el('div', 'panel empty', '<h2>No schedule yet</h2><p>Set which course you teach in each block, and every class calendar shows up here.</p><a class="btn btn-primary" href="#/schedule">Go to Schedule</a>')); return; }
    var sem = sems.filter(function (s) { return s.id && s.id === U.semId; })[0] || H.semester();
    U.semId = sem.id; U.offMode = H.arg === 'daysoff';
    var classes = T.classesIn(sem).filter(function (x) { return x.course && x.cls; });
    var from = weekStart(sem.start), to = T.addDays(weekStart(sem.end), 6);

    /* toolbar */
    var bar = el('div', 'ucal-bar');
    bar.appendChild(el('h1', '', 'Calendar'));
    if (sems.length > 1) {
      var ss = el('select', 'field sem-pick'); ss.setAttribute('aria-label', 'Semester');
      sems.forEach(function (s) { var o = el('option', '', esc(s.name) + ' · ' + esc(T.nice(s.start, { month: 'short', day: 'numeric' })) + '–' + esc(T.nice(s.end, { month: 'short', day: 'numeric' }))); o.value = s.id; if (s.id === sem.id) o.selected = true; ss.appendChild(o); });
      ss.addEventListener('change', function () { U.semId = ss.value; U.scroll = null; H.render(); });
      bar.appendChild(ss);
    } else bar.appendChild(el('span', 'muted', esc(sem.name)));
    var tools = el('div', 'ucal-tools');
    var undoB = button('btn-small', 'Undo', undo); undoB.disabled = !U.undo.length; tools.appendChild(undoB);
    tools.appendChild(button('btn-small', 'Refresh', function () { forgetAll(); load(); }));
    tools.appendChild(button('btn-small' + (U.offMode ? ' btn-primary' : ''), U.offMode ? 'Done with days off' : 'Days off…', function () { H.go('calendar', U.offMode ? '' : 'daysoff'); }));
    bar.appendChild(tools);
    body.appendChild(bar);
    if (U.offMode) body.appendChild(el('div', 'notice off-note', '<b>Days off:</b> tap a school day to mark it off, tap it again to turn it back on. Days off are for the whole school: every class’s lessons move along (in every course), and work on a day off doesn’t count as in class.'));
    var legend = el('div', 'ucal-legend'), notes = el('div', 'ucal-notes'), msg = el('div', 'ucal-msg', '');
    body.appendChild(legend); body.appendChild(notes); body.appendChild(msg);
    var box = el('div', 'ucal'); body.appendChild(box);

    var E = U.E = {};   // block → { x: class, b: bridge, r: entries result }
    classes.forEach(function (x) { E[x.block] = { x: x, b: null, r: null, status: 'loading' }; });
    drawLegend();

    function load() {
      notes.innerHTML = ''; msg.textContent = 'Reading the class calendars…';
      return Promise.all(classes.map(function (x) {
        return H.ready(x.c).then(function (b) {
          var e = E[x.block]; e.b = b;
          if (!b) { e.status = H.BR[x.c].status; return; }
          return b.entries(x.cls, from, to, x.block).then(function (r) { e.r = r; e.status = r.ok ? 'ok' : 'error'; }, function (err) { e.r = { ok: false, error: err.message }; e.status = 'error'; });
        });
      })).then(function () { msg.textContent = ''; drawNotes(); drawGrid(); }, function (err) { msg.textContent = 'Couldn’t read the calendars: ' + err.message; drawNotes(); drawGrid(); });
    }
    function forgetAll() { classes.forEach(function (x) { var r = H.BR[x.c]; if (r && r.b && r.b.forget) r.b.forget(); }); }
    U.reload = function () { forgetAll(); return load(); };

    function drawLegend() {
      legend.innerHTML = '';
      classes.forEach(function (x) {
        var hid = U.hidden[x.block], t = el('button', 'lg' + (hid ? ' off' : ''), '<span class="blk">' + x.block + '</span>' + H.badge(x.course, true) + '<span>' + esc(x.label || x.course.name) + '</span>');
        t.type = 'button'; t.title = hid ? 'Show this class' : 'Hide this class'; t.setAttribute('aria-pressed', hid ? 'false' : 'true');
        t.addEventListener('click', function () { if (U.hidden[x.block]) delete U.hidden[x.block]; else U.hidden[x.block] = 1; T.raw('teach/calhide', JSON.stringify(U.hidden)); drawLegend(); drawGrid(); });
        legend.appendChild(t);
      });
      var off = T.BLOCKS.filter(function (b) { return !T.entry(sem, b); });
      if (off.length) legend.appendChild(el('span', 'small muted', (off.length > 1 ? 'Blocks ' : 'Block ') + off.join(', ') + ': prep'));
    }
    function drawNotes() {
      notes.innerHTML = ''; var late = [];
      classes.forEach(function (x) {
        var e = E[x.block], name = '<b>' + esc(x.label || x.course.name + ' · Block ' + x.block) + '</b>';
        if (!e.b || e.status !== 'ok') {
          var n = el('div', 'notice bad', name + ': ' + esc(H.statusText[e.status] || 'couldn’t read the calendar') + (e.r && e.r.error ? ' (' + esc(e.r.error) + ')' : '') + '. ');
          var a = el('a', '', 'Course sign-ins'); a.href = '#/settings'; n.appendChild(a); notes.appendChild(n); return;
        }
        if (e.r.none) {
          var m = el('div', 'notice', name + ' has no calendar yet. ');
          m.appendChild(button('btn-small btn-primary', 'Make it, starting ' + esc(T.nice(sem.start)), function () { this.disabled = true; e.b.makeCal(x.cls, sem.start).then(function () { load(); }); }));
          notes.appendChild(m); return;
        }
        if (e.r.last && e.r.last > sem.end) late.push(esc(x.label || x.course.name) + ' (' + esc(T.nice(e.r.last, { month: 'short', day: 'numeric' })) + ')');
        if (e.r.skipped && e.r.skipped.length && !U.hidden[x.block]) {
          var tray = el('div', 'tray', '<span class="small muted">' + esc(x.label || x.course.name) + ' · skipped:</span>');
          tray.dataset.block = x.block;
          e.r.skipped.forEach(function (it) { var c = H.chip(it, { cls: 'sm' }); c.dataset.key = it.key; c.dataset.block = x.block; c.dataset.skipped = '1'; hook(c, x, it, null); tray.appendChild(c); });
          notes.appendChild(tray);
        }
      });
      if (late.length) notes.insertBefore(el('div', 'notice warn', 'Planned past the end of ' + esc(sem.name) + ' (' + esc(T.nice(sem.end, { month: 'short', day: 'numeric' })) + '): ' + late.join(', ') + '.'), notes.firstChild);
    }
    function drawGrid() {
      var keep = U.scroll; box.innerHTML = '';
      /* header: the month you're reading, with ‹ Today › to jump a month at a time (like the course calendars) */
      var hd = el('div', 'ucal-hd'), mon = el('h2', 'ucal-month', ''), navb = el('div', 'ucal-nav');
      var pv = button('btn-icon', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>', function () { jump(-1); }); pv.setAttribute('aria-label', 'Previous month'); pv.title = 'Previous month';
      var tb = button('btn-today', 'Today', function () { scrollTo(T.today(), true); });
      var nx = button('btn-icon', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>', function () { jump(1); }); nx.setAttribute('aria-label', 'Next month'); nx.title = 'Next month';
      navb.appendChild(pv); navb.appendChild(tb); navb.appendChild(nx);
      hd.appendChild(mon); hd.appendChild(navb);
      var wh = el('div', 'ucal-wd'); WD.forEach(function (d, i) { wh.appendChild(el('div', i === 0 || i === 6 ? 'we' : '', d)); }); hd.appendChild(wh);
      box.appendChild(hd);
      var weeks = el('div', 'ucal-weeks' + (U.offMode ? ' offmode' : '')), today = T.today();
      for (var w = from; w <= to; w = T.addDays(w, 7)) {
        var row = el('div', 'uw'); row.dataset.week = w;
        for (var i = 0; i < 7; i++) {
          var d = T.addDays(w, i), dt = T.parse(d), first = dt.getDate() === 1, inSem = d >= sem.start && d <= sem.end;
          /* where a month starts: a line along the top of its first week and down the left of the 1st */
          var mcls = (dt.getDate() <= 7 ? ' wk1' : '') + (first ? ' first' : ''), num = (first ? '<b class="ud-mon">' + MONTHS[dt.getMonth()].slice(0, 3) + '</b> ' : '') + dt.getDate();
          var big = first ? '<div class="ud-mbig">' + MONTHS[dt.getMonth()] + '</div>' : '';   // the month's name, big while the calendar scrolls
          if (i === 0 || i === 6) { var wc = el('div', 'ud we' + mcls, '<div class="ud-h"><span class="ud-n">' + num + '</span></div>' + big); wc.dataset.ym = d.slice(0, 7); row.appendChild(wc); continue; }
          var off = T.isOff(d, S.data), cell = el('div', 'ud' + mcls + (off ? ' off' : '') + (d === today ? ' today' : '') + (d < today ? ' past' : '') + (inSem ? '' : ' outside'));
          cell.dataset.date = d; cell.dataset.ym = d.slice(0, 7);
          var t = T.dayType(d);
          cell.appendChild(el('div', 'ud-h', '<span class="ud-n">' + num + '</span>' + (off ? '' : '<span class="ud-t">' + ({ day1: 'Day 1', day2: 'Day 2', fri: 'Fri' })[t] + '</span>')));
          if (big) cell.insertAdjacentHTML('beforeend', big);
          if (off) cell.appendChild(el('div', 'ud-off', 'No school'));
          else T.periods(d, S.data).forEach(function (p) {
            var e = E[p.block], ent = T.entry(sem, p.block);
            if (!ent) { cell.appendChild(el('div', 'ub prep', '<span class="ub-b">' + p.block + '</span><span class="ub-p">Prep</span>')); return; }
            if (!e || U.hidden[p.block]) return;
            var r = el('div', 'ub'); r.dataset.block = p.block; r.style.setProperty('--cc', e.x.course.colour);
            r.appendChild(el('span', 'ub-b', p.block));
            var chips = el('div', 'ub-c');
            var items = e.r && e.r.ok && e.r.days ? (e.r.days[d] || []) : [];
            items.forEach(function (it) { var c = H.chip(it); c.dataset.key = it.key; c.dataset.block = p.block; hook(c, e.x, it, d); chips.appendChild(c); });
            if (!items.length && e.r && e.r.ok && !e.r.none) chips.appendChild(el('span', 'ub-none', 'nothing planned'));
            r.appendChild(chips); cell.appendChild(r);
          });
          if (U.offMode && t) cell.addEventListener('click', toggleOff.bind(null, d));
          row.appendChild(cell);
        }
        weeks.appendChild(row);
      }
      box.appendChild(weeks);
      U.box = box; U.weeks = weeks; U.mon = mon; U.shown = '';
      var raf = 0, still = 0;
      box.onscroll = function () {
        U.scroll = box.scrollTop;
        if (!raf) raf = requestAnimationFrame(function () { raf = 0; month(); });
        if (box._quiet) { box._quiet = false; return; }   // jumping to a date isn't scrolling
        box.classList.add('scrolling'); clearTimeout(still); still = setTimeout(function () { box.classList.remove('scrolling'); }, 550);
      };
      requestAnimationFrame(function () { if (keep != null) { box._quiet = true; box.scrollTop = keep; } else scrollTo(today < sem.start ? sem.start : today > sem.end ? sem.end : today); month(); });
    }
    /* the month you're reading: the week a third of the way down, by its middle day; other months' days are dimmer */
    function month() {
      if (!U.weeks) return;
      var rows = U.weeks.children, hdh = U.box.querySelector('.ucal-hd').offsetHeight, probe = U.box.scrollTop + hdh + (U.box.clientHeight - hdh) * 0.3, best = null;
      for (var i = 0; i < rows.length; i++) { var r = rows[i]; if (r.offsetTop + r.offsetHeight > probe) { best = rows[i]; break; } }
      if (!best) best = rows[rows.length - 1];
      var ym = T.addDays(best.dataset.week, 3).slice(0, 7);
      if (ym === U.shown) return;
      U.shown = ym; U.mon.innerHTML = MONTHS[+ym.slice(5, 7) - 1] + ' <small>' + ym.slice(0, 4) + '</small>';
      [].forEach.call(U.weeks.querySelectorAll('.ud'), function (c) { c.classList.toggle('other', c.dataset.ym !== ym); });
    }
    /* ‹ ›: the week of the 1st of the month before or after (quick repeated taps keep counting) */
    var aim = null;
    function jump(dm) {
      var ym = aim && Date.now() - aim.at < 900 ? aim.ym : (U.shown || T.today().slice(0, 7)), t = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + dm, 1, 12), k = T.key(t);
      if (k < from) k = from; if (k > to) return;
      aim = { ym: k.slice(0, 7), at: Date.now() }; scrollTo(k, true, true);
    }
    function scrollTo(date, smooth, noFlash) {
      var w = U.weeks && U.weeks.querySelector('[data-week="' + weekStart(date) + '"]'); if (!w) return;
      var y = Math.max(0, w.offsetTop - U.box.querySelector('.ucal-hd').offsetHeight - 6);
      if (smooth) U.box.scrollTo({ top: y, behavior: 'smooth' }); else { if (Math.abs(U.box.scrollTop - y) > 1) U.box._quiet = true; U.box.scrollTop = y; }
      var c = U.weeks.querySelector('.ud[data-date="' + date + '"]'); if (c && smooth && !noFlash) { c.classList.add('flash'); setTimeout(function () { c.classList.remove('flash'); }, 2500); }
    }
    U.scrollTo = scrollTo;

    /* ---- changes ---- */
    function after(x, p, note) {
      msg.textContent = 'Saving…';
      return p.then(function (d) {
        if (!d || !d.ok) { msg.textContent = 'Couldn’t save: ' + ((d && d.error) || 'no answer'); return; }
        if (d.before) { U.undo.push({ c: x.c, cls: x.cls, before: d.before, label: x.label }); undoB.disabled = false; }
        /* other classes of the same course may share this calendar ("keep all classes the same"): read them again */
        classes.forEach(function (y) { if (y.c === x.c) { var r = H.BR[y.c]; if (r && r.b) r.b.forget(); } });
        return load().then(function () { msg.textContent = note || 'Saved to ' + (x.label || x.course.name) + '’s calendar.'; });
      }, function (e) { msg.textContent = 'Couldn’t save: ' + e.message; });
    }
    function undo() {
      var u = U.undo.pop(); undoB.disabled = !U.undo.length; if (!u) return;
      var x = classes.filter(function (y) { return y.cls === u.cls && y.c === u.c; })[0] || { c: u.c, cls: u.cls, course: T.course(u.c), label: u.label };
      H.ready(u.c).then(function (b) { if (!b) return; after(x, b.putCal(u.cls, u.before), 'Undone.'); });
    }
    function toggleOff(d, ev) {
      if (ev && ev.target.closest('.uchip')) return;
      var list = S.data.noSchool.slice(), i = list.indexOf(d); if (i >= 0) list.splice(i, 1); else list.push(d);
      var cell = U.weeks.querySelector('.ud[data-date="' + d + '"]'); if (cell) cell.classList.toggle('off', i < 0);
      msg.textContent = 'Saving the days off…';
      H.save('noschool', list.sort()).then(function (r) {
        if (!r.ok) { msg.textContent = 'Couldn’t save: ' + r.error; return; }
        return H.pushAll('noschool').then(function (res) {
          var bad = res.filter(function (z) { return !z.ok; });
          return load().then(function () { msg.textContent = bad.length ? 'Saved. Not sent to ' + bad.map(function (z) { return T.course(z.id).name; }).join(', ') + ' yet.' : (i >= 0 ? T.nice(d) + ' is a school day again.' : T.nice(d) + ' is now a day off for every class.'); });
        });
      });
    }

    /* tap: options · drag (math lessons): move to another day */
    function hook(c, x, it, date) {
      var e = E[x.block];
      c.tabIndex = 0;
      c.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pop(c, x, it, date); } });
      var canDrag = e.b && e.b.canDrag && (it.kind === 'lesson' || it.kind === 'test' || it.kind === 'intro');
      c.addEventListener('pointerdown', function (ev) {
        if (U.offMode || ev.button > 0) return;
        ev.preventDefault(); ev.stopPropagation();
        var sx = ev.clientX, sy = ev.clientY, ghost = null, target = null, raf = 0, lastY = sy;
        function move(m) {
          if (!ghost && Math.hypot(m.clientX - sx, m.clientY - sy) < 7) return;
          if (!canDrag) return;
          if (!ghost) { closePop(); ghost = c.cloneNode(true); ghost.classList.add('ghost'); document.body.appendChild(ghost); c.classList.add('dragging'); document.body.classList.add('dragging-chip'); }
          ghost.style.left = (m.clientX + 8) + 'px'; ghost.style.top = (m.clientY + 8) + 'px'; lastY = m.clientY;
          var under = document.elementFromPoint(m.clientX, m.clientY), cell = under && under.closest('.ud[data-date]');
          if (target && target !== cell) target.classList.remove('drop');
          target = cell && !cell.classList.contains('off') ? cell : null; if (target) target.classList.add('drop');
          if (!raf) raf = requestAnimationFrame(edge);
        }
        function edge() {   // scroll while a lesson is held near the top or bottom of the calendar
          raf = 0; if (!ghost) return; var r = U.box.getBoundingClientRect(), dy = lastY < r.top + 90 ? -14 : lastY > r.bottom - 50 ? 14 : 0;
          if (dy) { U.box.scrollTop += dy; raf = requestAnimationFrame(edge); }
        }
        function up() {
          document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
          if (!ghost) { pop(c, x, it, date); return; }
          ghost.remove(); c.classList.remove('dragging'); document.body.classList.remove('dragging-chip'); if (target) target.classList.remove('drop');
          if (target && target.dataset.date !== date) after(x, e.b.move(x.cls, it.key, target.dataset.date), it.label + ' moved to ' + T.nice(target.dataset.date) + ' — everything after it moved with it.');
        }
        document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
      });
    }
    function closePop() { if (U.pop) { U.pop.remove(); U.pop = null; } }
    U.closePop = closePop;
    function pop(c, x, it, date) {
      closePop(); var e = E[x.block], b = e.b; if (!b) return;
      var p = el('div', 'upop'); p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', it.title);
      p.appendChild(el('div', 'upop-h', H.badge(x.course, true) + '<div><b>' + esc(it.kind === 'lesson' || it.kind === 'intro' ? it.label + ': ' + it.title : it.title) + '</b><span class="small muted">' + esc(x.label || x.course.name) + ' · Block ' + x.block + (date ? ' · ' + esc(T.nice(date)) : ' · skipped') + (it.sub ? ' · ' + esc(it.sub) : '') + '</span></div>'));
      var acts = el('div', 'upop-acts');
      function act(label, fn, cls) { acts.appendChild(button('btn-small ' + (cls || ''), label, function () { closePop(); fn(); })); }
      function link(label, href) { var a = el('a', 'btn btn-small', label); a.href = href; if (/↗/.test(label)) { a.target = '_blank'; a.rel = 'noopener'; } acts.appendChild(a); }
      if (it.lessonUrl) link('Lesson page ↗', it.lessonUrl);
      if (it.teacherUrl) link('Mission guide ↗', it.teacherUrl);
      if (it.kind === 'mission') {
        if (date) {
          act('One class longer', function () { after(x, b.lengthen(x.cls, it.key, 1), it.label + ' is one class longer — everything after it moved.'); });
          if (it.len > 1) act('One class shorter', function () { after(x, b.lengthen(x.cls, it.key, -1), it.label + ' is one class shorter.'); });
          act('Take off the calendar', function () { after(x, b.skip(x.cls, it.key), it.label + ' is off the calendar.'); });
        } else act('Put back (at the end)', function () { after(x, b.restore(x.cls, it.key), it.label + ' is back, at the end of the plan.'); });
      } else if (it.kind === 'lesson' || it.kind === 'test' || it.kind === 'intro') {
        if (date) act('Skip', function () { after(x, b.skip(x.cls, it.key), it.label + ' skipped — everything after it moved up a day.'); });
        else acts.appendChild(el('span', 'small muted', 'Drag it onto a day to put it back.'));
      }
      link('Open in the ledger’s calendar ›', T.ledger(x.course, x.cls) + '&tab=calendar');
      p.appendChild(acts);
      if (b.canDrag && date && (it.kind === 'lesson' || it.kind === 'test')) p.appendChild(el('p', 'small muted', 'Tip: drag a lesson onto another day to move it (and everything after it).'));
      document.body.appendChild(p); U.pop = p;
      var r = c.getBoundingClientRect(), pw = p.offsetWidth, ph = p.offsetHeight;
      p.style.left = Math.max(8, Math.min(r.left, root.innerWidth - pw - 8)) + 'px';
      p.style.top = (r.bottom + ph + 8 > root.innerHeight ? Math.max(8, r.top - ph - 6) : r.bottom + 6) + 'px';
      var f = p.querySelector('button, a'); if (f) f.focus();
    }
    drawGrid(); load();
  };
  document.addEventListener('pointerdown', function (ev) { if (U.pop && !U.pop.contains(ev.target) && !ev.target.closest('.uchip')) U.closePop(); }, true);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && U.closePop) U.closePop(); });
  root.addEventListener('hashchange', function () { if (U.closePop) U.closePop(); });
  function weekStart(date) { var d = T.parse(date); d.setDate(d.getDate() - d.getDay()); return T.key(d); }
})(window);
