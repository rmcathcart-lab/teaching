/* Teaching Hub — sub plans. Pick a day: the hub knows which class is in each block (Schedule), what each class is doing
 * that day (its calendar, through the course bridge) and the bell times, so it writes the whole day:
 *   a welcome note (parking stall) · the day at a glance · one section per period in the order the sub teaches them
 *   (the lesson, how to project it or let students work through it, the assignment and sign-in; robotics missions;
 *   prep) · extra information and class rules · sign-in help · the Hour Zero emergency procedures · the parking map.
 * The page shows the plan as a sheet of paper with every section editable (edits are kept on this device for that date);
 * the download is a Word file (assets/vendor/docx.js, loaded only when needed) to tweak, print or email.
 * Text format in the boxes: a line starting "- " is a bullet, **bold**, and web addresses become links. */
(function (root) {
  'use strict';
  var T = root.TEACH, H = root.HUB, el = H.el, button = H.button, esc = T.esc, S = H.S;
  var SP = H.subplan = {};
  var INK = '1D2433', MUTED = '5B6577', MARK = 'F7D046';

  function defaultDate() {
    var now = new Date(), today = T.today();
    if (T.isSchoolDay(today, S.data) && now.getHours() < 8) return today;   // early morning: today's plans
    return H.nextSchoolDay(T.addDays(today, 1));
  }
  function store(date, k, v) { var key = 'teach/sub:' + date + ':' + k; if (v === undefined) return T.raw(key); T.raw(key, v); }
  function hex(c) { return String(c || '#64748b').replace('#', '').toUpperCase(); }

  H.views.subs = function (body) {
    var date = /^\d{4}-\d{2}-\d{2}$/.test(H.arg) ? H.arg : defaultDate(), cfg = H.subSettings();
    var sem = T.semesterOn(date, S.data), ps = T.periods(date, S.data);
    var page = el('div', 'subs'); body.appendChild(page);
    /* the sidebar: which day, the day at a glance, warnings, and the download */
    var side = el('aside', 'sub-side'); page.appendChild(side);
    side.appendChild(el('h1', '', 'Sub plans'));
    var pick = el('div', 'sub-pick');
    var prev = button('btn-icon', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>', function () { H.go('subs', H.prevSchoolDay(T.addDays(date, -1))); }); prev.setAttribute('aria-label', 'Previous school day');
    var di = el('input', 'field'); di.type = 'date'; di.value = date; di.setAttribute('aria-label', 'Day'); di.addEventListener('change', function () { if (di.value) H.go('subs', di.value); });
    var next = button('btn-icon', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>', function () { H.go('subs', H.nextSchoolDay(T.addDays(date, 1))); }); next.setAttribute('aria-label', 'Next school day');
    pick.appendChild(prev); pick.appendChild(di); pick.appendChild(next); side.appendChild(pick);
    side.appendChild(el('p', 'sub-day', '<b>' + esc(T.nice(date, { weekday: 'long', month: 'long', day: 'numeric' })) + '</b>' + (ps.length ? '<span>' + esc(H.dayLabel(date)) + (sem ? ', ' + esc(sem.name) : '') + '</span>' : '')));
    var paper = el('article', 'paper'); page.appendChild(paper);
    if (!ps.length || !sem) {
      paper.classList.add('paper-empty');
      paper.appendChild(el('p', '', !ps.length ? (T.dayType(date) ? 'That’s a day off: no school.' : 'That’s a weekend.') : 'This day isn’t in a semester on your schedule.'));
      return;
    }
    var glance = el('ol', 'glance'); side.appendChild(glance);
    var warn = el('div', 'sub-warn'); side.appendChild(warn);
    var dl = button('btn-primary btn-block', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>Download Word file', download); dl.disabled = true; side.appendChild(dl);
    var incl = el('ul', 'sub-incl'); side.appendChild(incl);

    var sections = [];   // { key, title, sub, gen, ta, kind }
    function section(key, title, gen, opts) {
      opts = opts || {};
      var s = { key: key, title: title, sub: opts.sub || '', gen: gen, kind: opts.kind || 'text', colour: opts.colour }, card = el('section', 'p-sec' + (opts.cls ? ' ' + opts.cls : '')); card.dataset.key = key;
      if (opts.colour) card.style.setProperty('--cc', opts.colour);
      var hd = el('header', 'p-sec-h', '<h3>' + esc(title) + '</h3>' + (s.sub ? '<p>' + esc(s.sub) + '</p>' : ''));
      var reset = button('btn-ghost btn-small p-reset', 'Undo my edits', function () { store(date, key, null); ta.value = gen; size(); reset.hidden = true; });
      hd.appendChild(reset); card.appendChild(hd);
      /* shown formatted, like the Word file; click (or Enter) to edit the text, click away to see it formatted again */
      var view = el('div', 'p-view'); view.tabIndex = 0; view.setAttribute('role', 'button'); view.setAttribute('aria-label', 'Edit ' + title); view.title = 'Click to edit';
      var ta = el('textarea', 'p-ta'); var saved = store(date, key); ta.value = saved != null ? saved : gen; reset.hidden = saved == null;
      ta.setAttribute('aria-label', title); ta.spellcheck = true; ta.hidden = true;
      ta.addEventListener('input', function () { store(date, key, ta.value); reset.hidden = false; size(); });
      ta.addEventListener('blur', function () { draw(); ta.hidden = true; view.hidden = false; });
      function edit() { view.hidden = true; ta.hidden = false; size(); ta.focus(); }
      view.addEventListener('click', function (e) { if (!e.target.closest('a')) edit(); });
      view.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); edit(); } });
      reset.addEventListener('click', function () { draw(); });
      function draw() { view.innerHTML = rich(ta.value) || '<p class="p-empty">Click to write this part.</p>'; }
      function size() { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; }
      draw(); card.appendChild(view); card.appendChild(ta); s.ta = ta; sections.push(s); paper.appendChild(card);
      return s;
    }

    /* the classes, in bell order */
    var jobs = ps.map(function (p, i) {
      var e = T.entry(sem, p.block), c = e ? T.course(e.c) : null, base = { p: p, n: i + 1, c: c, e: e };
      if (!c) return Promise.resolve(Object.assign(base, { prep: true }));
      if (!e.cls) return Promise.resolve(Object.assign(base, { err: 'no class linked yet' }));
      return H.ready(c.id).then(function (b) {
        if (!b) return Object.assign(base, { err: H.statusText[H.BR[c.id].status] });
        return b.sub(e.cls, date, p.block).then(function (r) { return Object.assign(base, { r: r, b: b }); }, function (x) { return Object.assign(base, { err: x.message }); });
      });
    });
    paper.appendChild(el('p', 'loading', 'Reading each class’s calendar…'));
    Promise.all(jobs).then(function (rows) {
      paper.innerHTML = ''; SP.rows = rows;
      var gaps = H.gaps(ps);
      /* the top of the plan, as the Word file will have it */
      paper.appendChild(el('header', 'p-head', '<h2>Substitute plans</h2><p><b>' + esc(cfg.teacher) + '</b>, ' + esc(T.nice(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })) + '</p><p>' + esc(cfg.room) + ', ' + esc(H.dayLabel(date)) + '</p>'));
      section('welcome', 'Welcome', cfg.welcome.replace(/\{stall\}/g, cfg.stall || '41'), { cls: 'p-welcome' });
      var tbl = el('table', 'p-day'); tbl.innerHTML = '<thead><tr><th>Time</th><th>Period</th><th>Class</th><th>Today</th></tr></thead>';
      var tb = el('tbody');
      rows.forEach(function (x, i) {
        var tr = el('tr'); if (x.c) tr.style.setProperty('--cc', x.c.colour);
        tr.innerHTML = '<td>' + esc(span(x.p.start, x.p.end)) + '</td><td>' + x.n + ' <span>(' + x.p.block + ')</span></td><td>' + (x.prep ? 'Prep' : esc(className(x))) + '</td><td>' + esc(summary(x)) + '</td>';
        tb.appendChild(tr);
        gaps.filter(function (g) { return g.after === i; }).forEach(function (g) { var gr = el('tr', 'gap-row'); gr.innerHTML = '<td>' + esc(span(g.start, g.end)) + '</td><td></td><td>' + esc(g.name) + '</td><td></td>'; tb.appendChild(gr); });
        var li = el('li'); if (x.c) li.style.setProperty('--cc', x.c.colour);
        li.innerHTML = '<span class="g-t">' + esc(T.time(x.p.start).replace(/ (am|pm)$/, '')) + '</span><span class="g-b">' + x.p.block + '</span><span class="g-c"><b>' + (x.prep ? 'Prep' : esc(className(x))) + '</b>' + (x.prep ? '' : '<small>' + esc(summary(x)) + '</small>') + '</span>';
        glance.appendChild(li);
      });
      tbl.appendChild(tb); var tw = el('div', 'p-tablewrap'); tw.appendChild(tbl); paper.appendChild(tw);
      rows.forEach(function (x) {
        var when = T.time(x.p.start) + ' to ' + T.time(x.p.end) + ', Block ' + x.p.block + (x.prep ? '' : ', ' + cfg.room);
        if (x.prep) { section('b' + x.p.block, 'Period ' + x.n + ': Prep', prepText(x, gaps), { sub: when, cls: 'p-prep' }); return; }
        section('b' + x.p.block, 'Period ' + x.n + ': ' + className(x), classText(x), { sub: when, colour: x.c.colour });
        (x.r && x.r.items || []).forEach(function (it) {
          if (it.kind !== 'test' && it.kind !== 'exam') return;
          var w = el('div', 'notice warn', '<b>Period ' + x.n + ' has ' + esc(it.kind === 'test' ? 'the ' + it.label : it.title) + '.</b> Only you can launch a test, so a sub can’t give it. ');
          if (it.kind === 'test' && x.b && x.b.canDrag) w.appendChild(button('btn-small', 'Move it to the next class', function () {
            this.disabled = true; var to = H.nextSchoolDay(T.addDays(date, 1));
            x.b.move(x.e.cls, it.key, to).then(function (d) { if (d && d.ok) { store(date, 'b' + x.p.block, null); H.render(); } else H.flash(warn, 'Couldn’t move it: ' + ((d && d.error) || 'no answer'), true); });
          }));
          warn.appendChild(w);
        });
        if (x.err) warn.appendChild(el('div', 'notice bad', esc(x.c.name) + ': ' + esc(x.err) + '. Period ' + x.n + ' has no lesson details.'));
      });
      section('rules', 'Extra information', cfg.rules.split('\n').filter(function (l) { return l.trim(); }).map(function (l) { return '- ' + l.trim().replace(/^[-•]\s*/, ''); }).join('\n'));
      section('signin', 'If a student can’t get on the class site', signInText(rows));
      if (cfg.contact) section('contact', 'Contact', cfg.contact);
      /* what else goes in the Word file */
      if (cfg.emergency) { incl.appendChild(el('li', '', 'Your Hour Zero emergency procedures (their own page)')); paper.appendChild(el('section', 'p-sec p-extra', '<h3>Hour Zero emergency procedures</h3><p>From Settings, added as their own page.</p>')); }
      else { var li2 = el('li', 'missing', 'No Hour Zero procedures yet. '); var a2 = el('a', '', 'Add them in Settings'); a2.href = '#/settings/subs'; li2.appendChild(a2); incl.appendChild(li2); }
      if (cfg.map) {
        incl.appendChild(el('li', '', 'The parking map, stall ' + esc(cfg.stall || '41') + ' circled (last page)'));
        paper.appendChild(el('section', 'p-sec p-extra', '<h3>Parking map</h3><img src="' + T.HUB + 'assets/parking-map.jpg" alt="School parking lot map with stall ' + esc(cfg.stall || '41') + ' circled" loading="lazy">'));
      }
      dl.disabled = false;
    });

    /* the box text as HTML: "- " bullets, **bold**, links (the same rules as the Word file) */
    function inline(t) {
      return esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s<)]+?)([.,;:]?)(?=\s|$)/g, function (m, u, p) { return '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>' + p; });
    }
    function rich(text) {
      var out = '', list = false;
      text.split('\n').forEach(function (l) {
        var t = l.replace(/\s+$/, '');
        if (/^\s*[-•]\s+/.test(t)) { if (!list) { out += '<ul>'; list = true; } out += '<li>' + inline(t.replace(/^\s*[-•]\s+/, '')) + '</li>'; return; }
        if (list) { out += '</ul>'; list = false; }
        if (!t.trim()) return;
        if (/^\*\*[^*]+\*\*\s*$/.test(t)) { out += '<h4>' + esc(t.trim().slice(2, -2)) + '</h4>'; return; }
        out += '<p>' + inline(t) + '</p>';
      });
      return out + (list ? '</ul>' : '');
    }

    /* ---------- the generated text ---------- */
    /* "9:00–10:28 am", "11:48 am–12:55 pm" */
    function span(a, b) { var x = T.time(a), y = T.time(b); return (x.slice(-2) === y.slice(-2) ? x.slice(0, -3) : x) + '–' + y; }
    function className(x) { return x.e.label || (x.r && x.r.label) || (x.c.name + ' – Block ' + x.p.block); }
    function summary(x) {
      if (x.prep) return '';
      var its = (x.r && x.r.items || []).filter(function (it) { return it.kind !== 'event'; });
      if (!its.length) return x.err ? 'see below' : 'work period';
      return its.map(function (it) { return it.kind === 'lesson' ? 'Lesson ' + it.unit + '.' + it.num + ': ' + it.title : it.kind === 'mission' ? 'Mission ' + it.label + ': ' + it.title : it.kind === 'test' ? it.label : it.title; }).join(' + ');
    }
    function prepText(x, gaps) {
      var lunch = gaps.filter(function (g) { return g.after === x.n - 2 && g.name === 'Lunch'; })[0];
      return (lunch ? 'Lunch is ' + T.time(lunch.start) + ' to ' + T.time(lunch.end) + ', then this block is my prep.' : 'This block is my prep.') + ' Depending on the office’s needs, they may ask you to cover a class if you’re willing.';
    }
    function classText(x) {
      var out = [], r = x.r, code = r && r.signIn ? r.signIn.code : x.e.cls, site = r && r.signIn ? r.signIn.url : T.site(x.c);
      if (x.err || !r) { out.push('[Couldn’t read this class’s calendar. Write the plan here.]'); return out.join('\n'); }
      var its = r.items || [];
      its.filter(function (it) { return it.kind === 'event'; }).forEach(function (it) { out.push('Note: ' + it.title); });
      var main = its.filter(function (it) { return it.kind !== 'event'; });
      if (!main.length) {
        out.push('There’s no new lesson today. Students can catch up on any practice they haven’t finished on the class site: ' + site);
        out.push('- They sign in with class code **' + code + '**, their name and their 4-digit PIN.');
      }
      main.forEach(function (it) {
        if (out.length) out.push('');
        if (it.kind === 'lesson' || it.kind === 'intro') out = out.concat(lessonText(it, code, site));
        else if (it.kind === 'mission') out = out.concat(missionText(it, code, site));
        else if (it.kind === 'test') { out.push('**' + it.label + '**'); out.push('[This is a test day, but only I can launch a test. Write what students should do instead, e.g. review with the Unit ' + it.unit + ' extra practice on the class site.]'); }
        else if (it.kind === 'exam') { out.push('**' + it.title + '**'); out.push('[Write what students should do.]'); }
      });
      var note = (H.subSettings().notes || {})[x.c.id];
      if (note) { out.push(''); note.split('\n').forEach(function (l) { if (l.trim()) out.push('- ' + l.trim().replace(/^[-•]\s*/, '')); }); }
      return out.join('\n');
    }
    function lessonText(it, code, site) {
      var out = [], name = it.kind === 'intro' ? it.title : 'Lesson ' + it.unit + '.' + it.num + ': ' + it.title;
      out.push('Thanks for running the lesson! We’re on ' + (it.unitTitle ? 'Unit ' + it.unit + ' (' + it.unitTitle + '), ' : '') + '**' + name + '**.' +
        (it.calc === false ? ' No calculators today.' : it.calc === true ? ' Scientific calculators are fine today.' : ''));
      if (it.lessonUrl) {
        out.push('**Teaching it from the lesson page**');
        out.push('- Open the lesson on the classroom computer and put it on the projector: ' + it.lessonUrl);
        out.push('- Students start on the warm-up while you take attendance. Then go through the examples in order: click an animation (or tap it) to play its next step, and use the arrows beside it to go back.');
        out.push('- Students copy the examples into their notes on paper.' + (it.notesUrl ? ' Printable notes for the unit: ' + it.notesUrl : ''));
        if (it.kind === 'lesson') {
          out.push('**Or let students work through it themselves**');
          out.push('- If you’d rather not teach it, students can open the lesson from the Lesson card beside Assignment ' + it.unit + '.' + it.num + ' on their class site, and work through the examples into their notes on their own.');
        }
      } else out.push('- The lesson is in the notes booklet' + (it.notesUrl ? ' (' + it.notesUrl + ')' : '') + '. Go through the examples with them, then release them to the assignment.');
      if (it.kind === 'lesson') {
        out.push('**Then: Assignment ' + it.unit + '.' + it.num + '**');
        if (it.practice) {
          out.push('- Students sign in to the class site (' + site + ') with class code **' + code + '**, their name and their 4-digit PIN.');
          out.push('- The site gives each student their own numbers, checks every answer and gives hints, so they can work on their own. Please keep them on it until the end of class; anything they don’t finish they can do at home.');
        } else out.push('- The assignment is at the end of the lesson in the booklet. Anything they don’t finish is homework.');
        out.push('- There’s no exit slip today.');
      }
      return out;
    }
    function missionText(it, code, site) {
      var out = [], dueNice = it.due ? T.nice(it.due, { weekday: 'long', month: 'long', day: 'numeric' }) : '';
      out.push('Students are working through **Mission ' + it.label + ': ' + it.title + '** on the Robotics site (day ' + it.day + ' of ' + it.len + (it.day === it.len ? ', due today' : dueNice ? ', due ' + dueNice : '') + '). They work independently and the guide remembers where each student left off, so you shouldn’t need to teach anything.');
      out.push('- Students sign in at ' + site + ' with class code **' + code + '** and their 4-digit PIN.');
      if (it.parts && it.parts.length) out.push('- Kit parts for this mission: ' + it.parts.join(', ') + '.');
      if (it.extras && it.extras.length) out.push('- Extra materials: ' + it.extras.join(', ') + '.');
      if (it.day === it.len) out.push('- It’s due today: at the end of the guide, students hand in their evidence (photos, a short video and their code).');
      if (!it.ready) out.push('- [This mission’s guide isn’t online yet. Write the plan here.]');
      return out;
    }
    function signInText(rows) {
      var out = [], seen = {};
      rows.forEach(function (x) { if (x.prep || !x.r || !x.r.signIn || seen[x.c.id + x.e.cls]) return; seen[x.c.id + x.e.cls] = 1; out.push('- Period ' + x.n + ': ' + x.r.signIn.url + ', class code **' + x.r.signIn.code + '**'); });
      out.push('- A student who forgot their PIN can’t reset it themselves. They can work from paper notes today, and I’ll reset it next class.');
      out.push('- If the site won’t load, students work from the notes booklet.');
      return out.join('\n');
    }

    /* ---------- the Word file ---------- */
    function download() {
      dl.disabled = true; var label = dl.innerHTML; dl.textContent = 'Making the Word file…';
      Promise.all([loadDocx(), cfg.map ? fetch(T.HUB + 'assets/parking-map.jpg').then(function (r) { return r.ok ? r.arrayBuffer() : null; }, function () { return null; }) : null]).then(function (z) {
        return z[0].Packer.toBlob(build(z[0], z[1]));
      }).then(function (b) {
        var a = el('a'); a.href = URL.createObjectURL(b); a.download = 'Sub plans ' + date + ' (' + cfg.teacher.replace(/[^\w .-]/g, '') + ').docx';
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        dl.disabled = false; dl.innerHTML = label;
      }, function (e) { dl.disabled = false; dl.innerHTML = label; H.flash(side, 'Couldn’t make the Word file: ' + e.message, true); });
    }
    function build(D, map) {
      var k = [];
      k.push(new D.Paragraph({ spacing: { after: 60 }, children: [new D.TextRun({ text: 'Substitute plans', bold: true, size: 44, color: INK })] }));
      k.push(new D.Paragraph({ spacing: { after: 20 }, children: [new D.TextRun({ text: cfg.teacher, bold: true, size: 26, color: INK }), new D.TextRun({ text: '   ' + T.nice(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), size: 26, color: INK })] }));
      k.push(new D.Paragraph({ spacing: { after: 220 }, children: [new D.TextRun({ text: cfg.room + ', ' + H.dayLabel(date), size: 22, color: MUTED })] }));
      sections.forEach(function (s) {
        if (s.key === 'welcome') {   // the welcome note in a soft box with a highlighter-yellow edge, then the day
          if (s.ta.value.trim()) k.push(new D.Paragraph({ spacing: { after: 240 }, shading: { type: D.ShadingType.CLEAR, color: 'auto', fill: 'FBF6DF' }, border: { left: { style: D.BorderStyle.SINGLE, size: 36, color: MARK, space: 10 } }, indent: { left: 200, right: 120 }, children: runs(D, s.ta.value.trim().replace(/\s*\n+\s*/g, ' '), { size: 23 }) }));
          k.push(heading(D, 'The day at a glance')); k.push(dayTable(D)); return;
        }
        k.push(periodHeading(D, s));
        paras(D, s.ta.value).forEach(function (p) { k.push(p); });
      });
      if (cfg.emergency) {
        k.push(new D.Paragraph({ pageBreakBefore: true, children: [new D.TextRun({ text: 'Hour Zero emergency procedures', bold: true, size: 34, color: INK })], spacing: { after: 160 } }));
        emergency(D, cfg.emergency).forEach(function (p) { k.push(p); });
      }
      if (cfg.map && map) {
        k.push(new D.Paragraph({ pageBreakBefore: true, spacing: { after: 80 }, children: [new D.TextRun({ text: 'Parking', bold: true, size: 34, color: INK })] }));
        k.push(new D.Paragraph({ spacing: { after: 160 }, children: [new D.TextRun({ text: 'Please park in stall ' + (cfg.stall || '41') + ' (circled in red).', size: 24 })] }));
        k.push(new D.Paragraph({ spacing: { line: 240, lineRule: D.LineRuleType.AUTO }, children: [new D.ImageRun({ type: 'jpg', data: map, transformation: { width: 640, height: 411 }, altText: { title: 'Parking map', description: 'School parking lot with stall ' + (cfg.stall || '41') + ' circled', name: 'parking-map' } })] }));
      }
      return new D.Document({
        creator: cfg.teacher, title: 'Sub plans ' + date,
        styles: { default: { document: { run: { font: 'Calibri', size: 22, color: '20242C' }, paragraph: { spacing: { after: 80, line: 276, lineRule: D.LineRuleType.AUTO } } } },
          paragraphStyles: [{ id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Calibri', size: 28, bold: true, color: INK }, paragraph: { spacing: { before: 300, after: 120 }, keepNext: true } }] },
        numbering: { config: [{ reference: 'dot', levels: [{ level: 0, format: D.LevelFormat.BULLET, text: '•', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 420, hanging: 260 } } } }] }] },
        sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1080, right: 1080 } } }, children: k }]
      });
    }
    function heading(D, t) { return new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, children: [new D.TextRun({ text: t })] }); }
    /* "Period 2: Math 15 – Block B" with the course colour down its left edge, and its time underneath */
    function periodHeading(D, s) {
      var col = s.colour ? hex(s.colour) : 'B8BFCC';
      return new D.Paragraph({ spacing: { before: 340, after: 100 }, keepNext: true, keepLines: true, border: { left: { style: D.BorderStyle.SINGLE, size: 30, color: col, space: 8 } }, indent: { left: 160 },
        children: [new D.TextRun({ text: s.title, bold: true, size: 28, color: INK })].concat(s.sub ? [new D.TextRun({ text: s.sub, size: 20, color: MUTED, break: 1 })] : []) });
    }
    /* "**bold** and https://links" → runs */
    function runs(D, line, base) {
      base = base || {};
      var out = [], re = /(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g, last = 0, m;
      while ((m = re.exec(line))) {
        if (m.index > last) out.push(new D.TextRun(Object.assign({ text: line.slice(last, m.index) }, base)));
        var t = m[0];
        if (t.indexOf('**') === 0) out.push(new D.TextRun(Object.assign({ text: t.slice(2, -2), bold: true }, base)));
        else { var u = t.replace(/[.,;:]$/, ''); out.push(new D.ExternalHyperlink({ link: u, children: [new D.TextRun(Object.assign({ text: u, style: 'Hyperlink' }, base))] })); if (u.length < t.length) out.push(new D.TextRun(Object.assign({ text: t.slice(u.length) }, base))); }
        last = m.index + t.length;
      }
      if (last < line.length) out.push(new D.TextRun(Object.assign({ text: line.slice(last) }, base)));
      return out;
    }
    function paras(D, text) {
      var out = [];
      text.split('\n').forEach(function (l) {
        var t = l.replace(/\s+$/, '');
        if (!t.trim()) return;
        if (/^\s*[-•]\s+/.test(t)) { out.push(new D.Paragraph({ numbering: { reference: 'dot', level: 0 }, spacing: { after: 60 }, children: runs(D, t.replace(/^\s*[-•]\s+/, '')) })); return; }
        if (/^\*\*[^*]+\*\*\s*$/.test(t)) { out.push(new D.Paragraph({ spacing: { before: 140, after: 50 }, keepNext: true, children: [new D.TextRun({ text: t.trim().slice(2, -2), bold: true, color: INK })] })); return; }
        out.push(new D.Paragraph({ spacing: { after: 100 }, children: runs(D, t) }));
      });
      return out;
    }
    function dayTable(D) {
      var line = { style: D.BorderStyle.SINGLE, size: 4, color: 'DDE2EA' }, none = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' }, gaps = H.gaps(ps);
      function cell(t, w, o) {
        o = o || {};
        return new D.TableCell({ width: { size: w, type: D.WidthType.PERCENTAGE }, margins: { top: 70, bottom: 70, left: 110, right: 110 },
          shading: o.fill ? { fill: o.fill, type: D.ShadingType.CLEAR, color: 'auto' } : undefined,
          borders: { top: none, bottom: line, left: o.edge ? { style: D.BorderStyle.SINGLE, size: 24, color: o.edge } : none, right: none },
          children: [new D.Paragraph({ spacing: { after: 0 }, children: [new D.TextRun({ text: t, bold: !!o.bold, color: o.color || '20242C', size: o.size || 21 })] })] });
      }
      var rowsOut = [new D.TableRow({ tableHeader: true, children: [cell('Time', 22, { fill: INK, color: 'FFFFFF', bold: true }), cell('Period', 11, { fill: INK, color: 'FFFFFF', bold: true }), cell('Class', 30, { fill: INK, color: 'FFFFFF', bold: true }), cell('Today', 37, { fill: INK, color: 'FFFFFF', bold: true })] })];
      SP.rows.forEach(function (x, i) {
        rowsOut.push(new D.TableRow({ cantSplit: true, children: [cell(span(x.p.start, x.p.end), 22), cell(x.n + ' (' + x.p.block + ')', 11), cell(x.prep ? 'Prep' : className(x), 30, { edge: x.c ? hex(x.c.colour) : 'C9CED8', bold: !x.prep }), cell(summary(x), 37, { color: MUTED })] }));
        gaps.filter(function (g) { return g.after === i; }).forEach(function (g) { rowsOut.push(new D.TableRow({ children: [cell(span(g.start, g.end), 22, { fill: 'F3F5F8', color: MUTED }), cell('', 11, { fill: 'F3F5F8' }), cell(g.name, 30, { fill: 'F3F5F8', color: MUTED }), cell('', 37, { fill: 'F3F5F8' })] })); });
      });
      return new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: rowsOut });
    }
    /* Hour Zero text: "Lock Down:" lines become headings, "•", "●", "-" lines bullets */
    function emergency(D, text) {
      var out = [], lines = [];
      text.split('\n').forEach(function (l) { var t = l.trim(); if (lines.length && /^[-•●▪◦]$/.test(lines[lines.length - 1]) && t) lines[lines.length - 1] = '• ' + t; else lines.push(t); });
      lines.forEach(function (l) {
        var t = l.trim(); if (!t) return;
        if (/^[-•●▪◦]\s*/.test(t)) { out.push(new D.Paragraph({ numbering: { reference: 'dot', level: 0 }, spacing: { after: 40 }, children: runs(D, t.replace(/^[-•●▪◦]\s*/, ''), { size: 21 }) })); return; }
        if (/:$/.test(t) && t.length < 60) { out.push(new D.Paragraph({ spacing: { before: 200, after: 60 }, keepNext: true, children: [new D.TextRun({ text: t.replace(/:$/, ''), bold: true, size: 24, color: INK })] })); return; }
        out.push(new D.Paragraph({ spacing: { after: 100 }, children: runs(D, t, { size: 21 }) }));
      });
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
