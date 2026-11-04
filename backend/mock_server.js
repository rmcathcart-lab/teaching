/* Runs backend/Code.gs locally for tests, with in-memory stand-ins for the Apps Script services.
 *   node backend/mock_server.js [port]      → http://localhost:<port>/  (GET ?action=… JSON or JSONP, POST text/plain JSON)
 * Teacher key: "teachkey". Data lives in memory. /__stats shows the script properties. */
var fs = require('fs'), http = require('http'), url = require('url'), vm = require('vm'), path = require('path'), crypto = require('crypto');
var PORT = Number(process.argv[2] || 8770);
var props = { TEACHER_KEY: 'teachkey' };
var ctx = {
  PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return k in props ? props[k] : null; }, setProperty: function (k, v) { props[k] = String(v); }, deleteProperty: function (k) { delete props[k]; } }; } },
  LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
  Logger: { log: function (m) { console.log('[log]', m); } },
  Utilities: { getUuid: function () { return crypto.randomUUID(); } },
  ContentService: { MimeType: { JSON: 'json', JAVASCRIPT: 'js' }, createTextOutput: function (t) { return { t: t, setMimeType: function (m) { this.m = m; return this; } }; } }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'), ctx);
http.createServer(function (req, res) {
  var u = url.parse(req.url, true);
  if (u.pathname === '/__stats') { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); return res.end(JSON.stringify(props)); }
  if (u.pathname === '/__reset') { Object.keys(props).forEach(function (k) { if (k !== 'TEACHER_KEY') delete props[k]; }); res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }); return res.end('ok'); }
  function send(out) { res.writeHead(200, { 'Content-Type': out.m === 'js' ? 'application/javascript' : 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(out.t); }
  if (req.method === 'POST') { var body = ''; req.on('data', function (c) { body += c; }); req.on('end', function () { send(ctx.doPost({ postData: { contents: body } })); }); return; }
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }
  send(ctx.doGet({ parameter: u.query }));
}).listen(PORT, function () { console.log('teaching mock on ' + PORT); });
