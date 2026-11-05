import json, urllib.request
BASE = 'http://localhost:8811/'
MOCKS = {'math10c': 'http://localhost:8765/', 'math15': 'http://localhost:8766/', 'robotics': 'http://localhost:8790/exec', 'teaching': 'http://localhost:8770/'}
CFG = {
  'math10c/js/config.js': "var HW_CONFIG = { siteName: 'Math 10C Practice', backend: '%s' };" % MOCKS['math10c'],
  'math15/js/config.js': "var HW_CONFIG = { siteName: 'Math 15 Practice', backend: '%s' };" % MOCKS['math15'],
  'robotics/js/config.js': "var RL_CONFIG = { siteName: 'Robotics', room: 'Room 2997', teacherEmail: 'x@y', backend: '%s' };" % MOCKS['robotics'],
}
def get(course, q):
    u = MOCKS[course] + ('&' if '?' in MOCKS[course] else '?') + q
    return json.loads(urllib.request.urlopen(u).read())
async def setup(ctx, keys=True, backend=True):
    def h(body):
        return lambda r: r.fulfill(status=200, content_type='application/javascript', body=body)
    for path, body in CFG.items():
        await ctx.route(BASE + path, h(body))
    init = ''
    init += "window.TEACH_BACKEND = '%s';" % (MOCKS['teaching'] if backend else '')   # '' = on-device mode (no backend)
    if keys: init += "try { localStorage.setItem('teach/key','teachkey'); } catch(e) {}"
    await ctx.add_init_script(init)
def errs_of(pg, errs, tag):
    pg.on('pageerror', lambda e: errs.append(tag + ' ' + str(e)))
    pg.on('console', lambda m: errs.append(tag + ' console: ' + m.text) if m.type == 'error' and 'favicon' not in m.text and 'icon.png' not in m.text else None)
