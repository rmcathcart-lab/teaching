/* Teaching Hub — sub plans. Pick a day: the hub knows which class is in each block (Schedule), what each class is doing
 * that day (its calendar, through the course bridge) and the bell times, so it writes a plan for the whole day:
 *   the day at a glance (times, blocks, prep, lunch) · one section per class (the lesson, how to project it or let
 *   students teach themselves from it, the assignment and how students sign in; robotics missions) · rules and routines.
 * Every section is editable here before downloading (edits are kept on this device for that date), and the download is
 * a Word file (docx, assets/vendor/docx.js, loaded only when needed) to tweak, print or email.
 * Text format in the boxes: a line starting "- " is a bullet, **bold**, and web addresses become links. */
(function (root) {
  'use strict';
  var T = root.TEACH, H = root.HUB, el = H.el, button = H.button, esc = T.esc, S = H.S;
  var SP = H.subplan = {};

  function defaultDate() {
    var now = new Date(), today = T.today();
    if (T.isSchoolDay(today, S.data) && now.getHours() < 8) return today;   // early morning: today's plans
    return H.nextSchoolDay(T.addDays(today, 1));
  }
  function store(date, k, v) { var key = 'teach/sub:' + date + ':' + k; if (v === undefined) return T.raw(key); T.raw(key, v); }

  H.views.subs = function (body) {
    var date = /^\d{4}-\d{2}-\d{2}$/.test(H.arg) ? H.arg : defaultDate();
    var head = el('div', 'page-h sub-h');
    head.appendChild(el('h1', '', 'Sub plans'));
    var pick = el('div', 'sub-pick');
    var prev = button('btn-ghost btn-icon', '‹', function () { H.go('subs', H.prevSchoolDay(T.addDays(date, -1))); }); prev.setAttribute('aria-label', 'Previous school day');
    var di = el('input', 'field'); di.type = 'date'; di.value = date; di.setAttribute('aria-label', 'Day'); di.addEventListener('change', function () { if (di.value) H.go('subs', di.value); });
    var next = button('btn-ghost btn-icon', '›', function () { H.go('subs', H.nextSchoolDay(T.addDays(date, 1))); }); next.setAttribute('aria-label', 'Next school day');
    pick.appendChild(prev); pick.appendChild(di); pick.appendChild(next);
    head.appendChild(pick);
    var dl = button('btn-primary', 'Download Word file', download); dl.disabled = true; head.appendChild(dl);
    body.appendChild(head);
    var sem = T.semesterOn(date, S.data), ps = T.periods(date, S.data);
    body.appendChild(el('p', 'muted sub-date', '<b>' + esc(T.nice(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })) + '</b>' + (ps.length ? ' · ' + esc(H.dayLabel(date)) + (sem ? ' · ' + esc(sem.name) : '') : '')));
    if (!ps.length) { body.appendChild(el('div', 'panel empty', '<p>' + (T.dayType(date) ? 'That’s a day off — no school.' : 'That’s a weekend.') + '</p>')); return; }
    if (!sem) { body.appendChild(el('div', 'panel empty', '<p>This day isn’t in a semester on your schedule.</p><a class="btn" href="#/schedule">Schedule</a>')); return; }
    var warn = el('div', 'sub-warn'); body.appendChild(warn);
    var wrap = el('div', 'sub-sections'); body.appendChild(wrap);
    var sections = [];   // { key, title, gen, ta }
    var info = {};       // block → bridge sub info

    function section(key, title, gen, note) {
      var s = { key: key, title: title, gen: gen }, card = el('section', 'panel sub-sec'); card.dataset.key = key;
      var hd = el('div', 'sub-sec-h', '<h3>' + esc(title) + '</h3>');
      var reset = button('btn-ghost btn-small', 'Undo my edits', function () { store(date, key, null); ta.value = gen; size(); reset.hidden = true; });
      hd.appendChild(reset); card.appendChild(hd);
      if (note) card.appendChild(el('p', 'small muted', note));
      var ta = el('textarea', 'field sub-ta'); var saved = store(date, key); ta.value = saved != null ? saved : gen; reset.hidden = saved == null;
      ta.setAttribute('aria-label', title);
      ta.addEventListener('input', function () { store(date, key, ta.value); reset.hidden = false; size(); });
      function size() { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 4) + 'px'; }
      card.appendChild(ta); s.ta = ta; s.card = card; sections.push(s); wrap.appendChild(card); setTimeout(size, 0);
      return s;
    }

    /* the classes, in bell order */
    var jobs = ps.map(function (p) {
      var e = T.entry(sem, p.block), c = e ? T.course(e.c) : null;
      if (!c || !e.cls) return Promise.resolve({ p: p, prep: !c, c: c, e: e });
      return H.ready(c.id).then(function (b) {
        if (!b) return { p: p, c: c, e: e, err: H.statusText[H.BR[c.id].status] };
        return b.sub(e.cls, date, p.block).then(function (r) { return { p: p, c: c, e: e, r: r, b: b }; }, function (x) { return { p: p, c: c, e: e, err: x.message }; });
      });
    });
    wrap.appendChild(el('div', 'loading', 'Reading each class’s calendar…'));
    Promise.all(jobs).then(function (rows) {
      wrap.innerHTML = ''; SP.rows = rows;
      section('day', 'The day at a glance', dayText(rows), 'This becomes the timetable at the top of the plan.');
      rows.forEach(function (x) {
        if (x.prep) return;
        info[x.p.block] = x;
        var title = 'Block ' + x.p.block + ' · ' + T.time(x.p.start) + '–' + T.time(x.p.end) + ' · ' + (x.e.label || (x.r && x.r.label) || x.c.name);
        section('b' + x.p.block, title, classText(x));
        (x.r && x.r.items || []).forEach(function (it) {
          if (it.kind === 'test' || it.kind === 'exam') {
            var w = el('div', 'notice warn', '<b>Block ' + x.p.block + ' has ' + esc(it.kind === 'test' ? 'the ' + it.label : it.title) + ' that day.</b> Tests are written online in Test mode and only you can launch one, so a sub can’t give it. ');
            if (it.kind === 'test' && x.b && x.b.canDrag) w.appendChild(button('btn-small', 'Move it to the next class', function () {
              this.disabled = true; var to = H.nextSchoolDay(T.addDays(date, 1));
              x.b.move(x.e.cls, it.key, to).then(function (d) { if (d && d.ok) { store(date, 'b' + x.p.block, null); H.render(); } else alert('Couldn’t move it: ' + ((d && d.error) || 'no answer')); });
            }));
            warn.appendChild(w);
          }
        });
        if (x.err) warn.appendChild(el('div', 'notice bad', esc(x.c.name) + ': ' + esc(x.err) + ' — that block’s section has no lesson details.'));
      });
      section('rules', 'Rules and routines', rulesText());
      section('signin', 'If a student can’t get on the class site', signInText(rows));
      var sub = S.data.sub || {};
      if (sub.contact) section('contact', 'Contact', sub.contact);
      dl.disabled = false;
    });

    /* ---------- the generated text ---------- */
    function dayText(rows) {
      var out = [], gaps = H.gaps(ps);
      rows.forEach(function (x, i) {
        var what = x.prep ? 'Prep (no class)' : (x.e.label || x.c.name) + ' — ' + summary(x);
        out.push('- ' + T.time(x.p.start) + '–' + T.time(x.p.end) + ' · Block ' + x.p.block + ' · ' + what);
        gaps.filter(function (g) { return g.after === i; }).forEach(function (g) { out.push('- ' + T.time(g.start) + '–' + T.time(g.end) + ' · ' + g.name); });
      });
      return out.join('\n');
    }
    function summary(x) {
      var its = (x.r && x.r.items || []).filter(function (it) { return it.kind !== 'event'; });
      if (!its.length) return 'work period';
      return its.map(function (it) { return it.kind === 'lesson' ? 'Lesson ' + it.unit + '.' + it.num + ' ' + it.title : it.kind === 'mission' ? it.label + ' ' + it.title + ' (' + it.sub.toLowerCase() + ')' : it.kind === 'test' ? it.label : it.title; }).join(' + ');
    }
    function classText(x) {
      var out = [], r = x.r, code = r && r.signIn ? r.signIn.code : x.e.cls, site = r && r.signIn ? r.signIn.url : T.site(x.c);
      if (x.err || !r) { out.push('[Couldn’t read this class’s calendar: write the plan here.]'); return out.join('\n'); }
      if (r.students) out.push(r.students + ' students on the class list.');
      var its = r.items || [];
      its.filter(function (it) { return it.kind === 'event'; }).forEach(function (it) { out.push('Note: ' + it.title); });
      var main = its.filter(function (it) { return it.kind !== 'event'; });
      if (!main.length) {
        out.push('**No new lesson today.**');
        out.push('- Students work on any practice they haven’t finished on the class site: ' + site);
        if (x.c.kind === 'math') out.push('- They sign in with class code **' + code + '**, their name and their 4-digit PIN.');
      }
      main.forEach(function (it) {
        if (out.length) out.push('');
        if (it.kind === 'lesson' || it.kind === 'intro') out = out.concat(lessonText(it, x, code, site));
        else if (it.kind === 'mission') out = out.concat(missionText(it, x, code, site));
        else if (it.kind === 'test') { out.push('**' + it.label + ' (Unit ' + it.unit + ')**'); out.push('- [This is a test day, but only I can launch a test. Write what students should do instead, e.g. review with the Unit ' + it.unit + ' extra practice on the class site.]'); }
        else if (it.kind === 'exam') { out.push('**' + it.title + '**'); out.push('- [Write what students should do.]'); }
      });
      var note = ((S.data.sub || {}).notes || {})[x.c.id];
      if (note) { out.push(''); out.push('**For every ' + x.c.name + ' class**'); note.split('\n').forEach(function (l) { if (l.trim()) out.push('- ' + l.trim().replace(/^[-•]\s*/, '')); }); }
      return out.join('\n');
    }
    function lessonText(it, x, code, site) {
      var out = [], name = it.kind === 'intro' ? it.title : 'Lesson ' + it.unit + '.' + it.num + ': ' + it.title;
      out.push('**' + name + '**' + (it.unitTitle ? ' (Unit ' + it.unit + ' · ' + it.unitTitle + ')' : ''));
      if (it.calc === false) out.push('Calculators: none today (this lesson is done without a calculator).');
      else if (it.calc === true) out.push('Calculators: scientific calculators are fine today.');
      if (it.lessonUrl) {
        out.push('**Teach it from the lesson page (projected)**');
        out.push('- On the classroom computer, open the lesson: ' + it.lessonUrl);
        out.push('- Students start on the warm-up while you take attendance. Then go through the examples in order: click (or tap) an animation to play its next step, and use the arrows beside it to go back.');
        out.push('- Students copy the examples into their notes on paper.' + (it.notesUrl ? ' Printable notes for the unit: ' + it.notesUrl : ''));
        if (it.kind === 'lesson') {
          out.push('**Or let students teach themselves**');
          out.push('- Each student opens the lesson from the Lesson card beside Assignment ' + it.unit + '.' + it.num + ' on the class site, works through the examples and copies them into their notes.');
        }
      } else out.push('- The lesson is in the notes booklet' + (it.notesUrl ? ' (' + it.notesUrl + ')' : '') + ': students work through the examples into their notes.');
      if (it.kind === 'lesson') {
        out.push('**Then: Assignment ' + it.unit + '.' + it.num + '**');
        if (it.practice) {
          out.push('- On the class site: ' + site);
          out.push('- Students sign in with class code **' + code + '**, their name and their 4-digit PIN. Every student gets their own numbers, and the site checks each answer and gives hints.');
          out.push('- Work they finish today counts as class work, so please keep them on it until the end of class.');
        } else out.push('- The assignment is at the end of the lesson in the booklet.');
        out.push('- There’s no exit slip today.');
      }
      return out;
    }
    function missionText(it, x, code, site) {
      var out = [];
      out.push('**Mission ' + it.label + ': ' + it.title + '** — ' + it.sub.replace(' · due', '').toLowerCase() + (it.due ? ' (due ' + T.nice(it.due) + ')' : ''));
      if (it.tagline) out.push(it.tagline);
      out.push('- Students carry on with the mission guide on the Robotics site: ' + site + ' They sign in with class code **' + code + '** and their PIN; the guide remembers where each student left off.');
      out.push('- Missions are self-paced: students work through the steps (build, code, test) and check their work at each checkpoint.');
      if (it.parts && it.parts.length) out.push('- Kit parts for this mission: ' + it.parts.join(', ') + '.');
      if (it.extras && it.extras.length) out.push('- Extra materials: ' + it.extras.join(', ') + '.');
      if (it.day === it.len) out.push('- It’s due today: students hand in their evidence (photos, video and code) at the end of the guide.');
      if (!it.ready) out.push('- [This mission’s guide isn’t online yet: write the plan here.]');
      return out;
    }
    function rulesText() {
      var r = (S.data.sub || {}).rules; r = r != null && r !== '' ? r : H.DEFAULT_RULES;
      return r.split('\n').filter(function (l) { return l.trim(); }).map(function (l) { return '- ' + l.trim().replace(/^[-•]\s*/, ''); }).join('\n');
    }
    function signInText(rows) {
      var out = [], seen = {};
      rows.forEach(function (x) { if (x.prep || !x.r || !x.r.signIn || seen[x.c.id + x.e.cls]) return; seen[x.c.id + x.e.cls] = 1; out.push('- Block ' + x.p.block + ': ' + x.r.signIn.url + ' · class code **' + x.r.signIn.code + '**'); });
      out.push('- A student who forgot their PIN can’t reset it themselves: they can work from the notes (on paper) today, and I’ll reset it next class.');
      out.push('- If the site won’t load, students work from the notes booklet and the assignment questions in it.');
      return out.join('\n');
    }

    /* ---------- the Word file ---------- */
    function download() {
      dl.disabled = true; dl.textContent = 'Making the Word file…';
      loadDocx().then(function (D) {
        var blob = build(D);
        return D.Packer.toBlob(blob);
      }).then(function (b) {
        var a = el('a'); a.href = URL.createObjectURL(b); a.download = 'Sub plan ' + date + ' (' + H.teacherName().replace(/[^\w .-]/g, '') + ').docx';
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        dl.disabled = false; dl.textContent = 'Download Word file';
      }, function (e) { dl.disabled = false; dl.textContent = 'Download Word file'; alert('Couldn’t make the Word file: ' + e.message); });
    }
    function build(D) {
      var kids = [], sub = S.data.sub || {}, NAVY = '1C2230';
      kids.push(new D.Paragraph({ heading: D.HeadingLevel.TITLE, children: [new D.TextRun({ text: 'Sub plan · ' + H.teacherName(), color: NAVY })] }));
      kids.push(new D.Paragraph({ spacing: { after: 160 }, children: [new D.TextRun({ text: T.nice(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), bold: true, size: 28 }), new D.TextRun({ text: '   ' + (sub.room || 'Room 2997') + ' · ' + H.dayLabel(date), size: 24, color: '555555' })] }));
      sections.forEach(function (s) {
        if (s.key === 'day') { kids.push(heading(D, 'The day at a glance')); kids = kids.concat(dayTable(D, s.ta.value)); return; }
        kids.push(heading(D, s.title));
        kids = kids.concat(paras(D, s.ta.value));
      });
      return new D.Document({
        creator: H.teacherName(), title: 'Sub plan ' + date,
        styles: { default: { document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { after: 80 } } } } },
        numbering: { config: [{ reference: 'dot', levels: [{ level: 0, format: D.LevelFormat.BULLET, text: '•', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } }] }] },
        sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children: kids }]
      });
    }
    function heading(D, t) { return new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, spacing: { before: 280, after: 100 }, keepNext: true, children: [new D.TextRun({ text: t, color: '1C2230' })] }); }
    /* "**bold** and https://links" → runs */
    function runs(D, line, base) {
      var out = [], re = /(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g, last = 0, m;
      while ((m = re.exec(line))) {
        if (m.index > last) out.push(new D.TextRun(Object.assign({ text: line.slice(last, m.index) }, base)));
        var t = m[0];
        if (t.indexOf('**') === 0) out.push(new D.TextRun(Object.assign({ text: t.slice(2, -2), bold: true }, base)));
        else { var u = t.replace(/[.,;]$/, ''); out.push(new D.ExternalHyperlink({ link: u, children: [new D.TextRun(Object.assign({ text: u, style: 'Hyperlink' }, base))] })); if (u.length < t.length) out.push(new D.TextRun(t.slice(u.length))); }
        last = m.index + t.length;
      }
      if (last < line.length) out.push(new D.TextRun(Object.assign({ text: line.slice(last) }, base)));
      return out;
    }
    function paras(D, text) {
      var out = [];
      text.split('\n').forEach(function (l) {
        var t = l.replace(/\s+$/, '');
        if (!t.trim()) { out.push(new D.Paragraph({ spacing: { after: 40 }, children: [] })); return; }
        if (/^\s*[-•]\s+/.test(t)) { out.push(new D.Paragraph({ numbering: { reference: 'dot', level: 0 }, children: runs(D, t.replace(/^\s*[-•]\s+/, '')) })); return; }
        if (/^\*\*[^*]+\*\*\s*$/.test(t)) { out.push(new D.Paragraph({ spacing: { before: 120, after: 60 }, keepNext: true, children: [new D.TextRun({ text: t.trim().slice(2, -2), bold: true, size: 23 })] })); return; }
        out.push(new D.Paragraph({ children: runs(D, t) }));
      });
      return out;
    }
    function dayTable(D, text) {
      var lines = text.split('\n'), rowsOut = [], intro = [], border = { style: D.BorderStyle.SINGLE, size: 4, color: 'D9D4C7' };
      lines.forEach(function (l) {
        var m = /^\s*[-•]\s+(.+?)\s+·\s+(.+)$/.exec(l);
        if (!m) { if (l.trim()) intro.push(l); return; }
        var parts = m[2].split(' · '), blk = /^Block [A-D]$/.test(parts[0]) ? parts.shift() : '';
        rowsOut.push([m[1], blk, parts.join(' · ')]);
      });
      function cell(t, w, head) { return new D.TableCell({ width: { size: w, type: D.WidthType.PERCENTAGE }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, shading: head ? { fill: 'F1EEE6', type: D.ShadingType.CLEAR, color: 'auto' } : undefined, borders: { top: border, bottom: border, left: border, right: border }, children: [new D.Paragraph({ spacing: { after: 0 }, children: runs(D, t, head ? { bold: true } : {}) })] }); }
      var out = intro.map(function (l) { return new D.Paragraph({ children: runs(D, l) }); });
      if (rowsOut.length) out.push(new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [new D.TableRow({ tableHeader: true, children: [cell('Time', 24, true), cell('Block', 12, true), cell('Class', 64, true)] })].concat(rowsOut.map(function (r) { return new D.TableRow({ children: [cell(r[0], 24), cell(r[1], 12), cell(r[2], 64)] }); })) }));
      return out;
    }
  };
  var docxP = null;
  function loadDocx() {
    if (root.docx) return Promise.resolve(root.docx);
    if (docxP) return docxP;
    return (docxP = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = T.HUB + 'assets/vendor/docx.js';
      s.onload = function () { root.docx ? res(root.docx) : rej(new Error('the Word library didn’t load')); };
      s.onerror = function () { docxP = null; rej(new Error('the Word library didn’t load')); };
      document.head.appendChild(s);
    }));
  }
  SP.loadDocx = loadDocx;
})(window);
