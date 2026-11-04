/* ============================================================
 * Teaching Hub — universal settings (Google Apps Script backend)
 * ------------------------------------------------------------
 * A standalone Apps Script project deployed as a web app (Execute as: me · Who has access: Anyone).
 * It only stores settings: the hub (https://rmcathcart-lab.github.io/teaching/) and every course's Teacher Ledger read
 * them. Nothing about students is kept here (class lists, work and calendars stay in each course's own backend).
 *
 * Run setup() once from the editor: it makes the teacher key and logs it (View → Execution log). The key is also under
 * Project Settings → Script properties → TEACHER_KEY (change it there if you like).
 *
 * Script properties (each a JSON value):
 *   BELL       the bell schedule { day1: [[block, 'HH:MM', 'HH:MM']…], day2: […], fri: […] }  (Mon/Wed Day 1, Tue/Thu Day 2)
 *   NOSCHOOL   days off ["2026-10-12", …], for the whole school
 *   SEMESTERS  [{ id, name, start, end, blocks: { A: { c: course id, cls: class code, label } | null (prep), … } }]
 *   SUB        sub-plan text { teacher, room, rules, contact, notes: { courseId: text } }
 *   KEYS       each course ledger's teacher key { math10c: '…', … } — so signing in to the hub signs in everywhere
 * Reads: ?action=public (no key: bell, days off, semesters — the ledgers' course switcher and the bookmark use it)
 *        ?action=all&key=… (everything). Writes: ?action=save&key=…&what=bell|noschool|semesters|sub|keys&value=<json>
 *        or POST {"action":"save","key":…,"what":…,"value":…} (text/plain) for long values.
 * ============================================================ */

var TZ = 'America/Edmonton';
var COURSE_IDS = /^[a-z0-9]{1,20}$/;
var DEFAULT_BELL = {
  day1: [['A', '09:00', '10:28'], ['B', '10:33', '12:00'], ['C', '12:45', '14:13'], ['D', '14:18', '15:45']],
  day2: [['B', '09:00', '10:28'], ['A', '10:33', '12:00'], ['D', '12:45', '14:13'], ['C', '14:18', '15:45']],
  fri:  [['A', '09:00', '10:07'], ['B', '10:11', '11:18'], ['C', '11:48', '12:55'], ['D', '12:58', '14:05']]
};

function props_() { return PropertiesService.getScriptProperties(); }
function read_(p, dflt) { try { var v = JSON.parse(props_().getProperty(p) || 'null'); return v == null ? dflt : v; } catch (e) { return dflt; } }
function write_(p, v) { var t = JSON.stringify(v); if (t.length > 8800) throw new Error('too big'); props_().setProperty(p, t); props_().setProperty('UPDATED', String(Date.now())); }
function teacherKey_() { return props_().getProperty('TEACHER_KEY') || ''; }
function json_(obj, cb) {
  var t = JSON.stringify(obj);
  if (cb && /^[A-Za-z_$][\w$]*$/.test(cb)) return ContentService.createTextOutput(cb + '(' + t + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(t).setMimeType(ContentService.MimeType.JSON);
}
function clean_(s, max) { s = String(s == null ? '' : s).replace(/[<>]/g, ' ').replace(/[ \t]+/g, ' ').trim(); return s.length > max ? s.slice(0, max) : s; }
function text_(s, max) { s = String(s == null ? '' : s).replace(/[<>]/g, ' ').replace(/\r\n?/g, '\n').trim(); return s.length > max ? s.slice(0, max) : s; }
function isDate_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

function setup() {
  if (!teacherKey_()) props_().setProperty('TEACHER_KEY', 'T-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase());
  Logger.log('Teacher key: ' + teacherKey_());
  Logger.log('Deploy → New deployment → Web app (Execute as: me · Who has access: Anyone), then put the /exec URL in teaching/js/courses.js (BACKEND).');
}

function publicData_() {
  return { ok: true, bell: bell_(), noSchool: read_('NOSCHOOL', []), semesters: read_('SEMESTERS', []), updated: Number(props_().getProperty('UPDATED') || 0), now: Date.now() };
}
function bell_() { var b = read_('BELL', null); return b && b.day1 && b.day2 && b.fri ? b : DEFAULT_BELL; }
function all_() {
  var d = publicData_();
  d.sub = read_('SUB', {}); d.keys = read_('KEYS', {}); d.bellCustom = !!read_('BELL', null);
  return d;
}

function doGet(e) { var p = (e && e.parameter) || {}; return json_(route_(p), p.callback || ''); }
function doPost(e) {
  var b; try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  return json_(route_(b));
}
function route_(p) {
  try {
    var a = p.action || 'ping';
    if (a === 'ping') return { ok: true, t: Date.now() };
    if (a === 'public') return publicData_();
    if (!teacherKey_() || p.key !== teacherKey_()) return { ok: false, error: 'bad key' };
    if (a === 'all') return all_();
    if (a === 'save') return save_(String(p.what || ''), typeof p.value === 'string' ? parse_(p.value) : p.value);
    return { ok: false, error: 'unknown action' };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
}
function parse_(s) { try { return JSON.parse(s); } catch (e) { return undefined; } }

function save_(what, v) {
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    if (what === 'bell') {
      if (v === 'reset' || v === null) { props_().deleteProperty('BELL'); props_().setProperty('UPDATED', String(Date.now())); return { ok: true, bell: DEFAULT_BELL, custom: false }; }
      var out = {}, bad = '';
      ['day1', 'day2', 'fri'].forEach(function (k) {
        out[k] = (v && Array.isArray(v[k]) ? v[k] : []).slice(0, 8).map(function (x) {
          var b = String(x && x[0] || '').toUpperCase(), s = String(x && x[1] || ''), t = String(x && x[2] || '');
          if (!/^[A-D]$/.test(b) || !/^\d{2}:\d{2}$/.test(s) || !/^\d{2}:\d{2}$/.test(t) || s >= t) bad = bad || (b + ' ' + s + '–' + t);
          return [b, s, t];
        });
        if (!out[k].length) bad = bad || ('no times for ' + k);
      });
      if (bad) return { ok: false, error: 'bad class time: ' + bad };
      write_('BELL', out); return { ok: true, bell: out, custom: true };
    }
    if (what === 'noschool') {
      var u = {}; (Array.isArray(v) ? v : []).forEach(function (d) { if (isDate_(d)) u[d] = 1; });
      var list = Object.keys(u).sort().slice(-400); write_('NOSCHOOL', list); return { ok: true, noSchool: list };
    }
    if (what === 'semesters') {
      if (!Array.isArray(v)) return { ok: false, error: 'bad semesters' };
      var sems = [], err = '';
      v.slice(0, 12).forEach(function (s, i) {
        if (!s || !isDate_(s.start) || !isDate_(s.end) || s.start > s.end) { err = err || 'Semester ' + (i + 1) + ' needs a start date before its end date.'; return; }
        var blocks = {};
        ['A', 'B', 'C', 'D'].forEach(function (b) {
          var x = s.blocks && s.blocks[b];
          blocks[b] = x && COURSE_IDS.test(String(x.c || '')) ? { c: String(x.c), cls: clean_(x.cls, 24).toLowerCase().replace(/[^a-z0-9\-_ ]/g, ''), label: clean_(x.label, 40) } : null;
        });
        sems.push({ id: clean_(s.id, 20) || ('s' + Date.now().toString(36) + i), name: clean_(s.name, 40) || 'Semester', start: s.start, end: s.end, blocks: blocks });
      });
      if (err) return { ok: false, error: err };
      sems.sort(function (a, b) { return a.start < b.start ? -1 : 1; });
      for (var i = 1; i < sems.length; i++) if (sems[i].start <= sems[i - 1].end) return { ok: false, error: sems[i - 1].name + ' and ' + sems[i].name + ' overlap.' };
      write_('SEMESTERS', sems); return { ok: true, semesters: sems };
    }
    if (what === 'sub') {
      var sb = v || {}, notes = {};
      Object.keys(sb.notes || {}).slice(0, 20).forEach(function (k) { if (COURSE_IDS.test(k)) notes[k] = text_(sb.notes[k], 1500); });
      var sub = { room: clean_(sb.room, 40), rules: text_(sb.rules, 2500), contact: text_(sb.contact, 300), notes: notes, teacher: clean_(sb.teacher, 60) };
      write_('SUB', sub); return { ok: true, sub: sub };
    }
    if (what === 'keys') {
      var have = read_('KEYS', {}), kv = v || {};
      Object.keys(kv).slice(0, 20).forEach(function (k) { if (!COURSE_IDS.test(k)) return; var s = String(kv[k] == null ? '' : kv[k]).trim().slice(0, 120); if (s) have[k] = s; else delete have[k]; });
      write_('KEYS', have); return { ok: true, keys: have };
    }
    return { ok: false, error: 'unknown setting' };
  } finally { lock.releaseLock(); }
}
