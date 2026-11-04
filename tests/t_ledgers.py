import asyncio, sys, json, urllib.request, urllib.parse
sys.path.insert(0, __import__('os').path.dirname(__file__))
from common import *
from playwright.async_api import async_playwright
SH = '/tmp/teach_led_'
sems = [{"id": "s1", "name": "Semester 1", "start": "2026-09-02", "end": "2027-01-29", "blocks": {"A": {"c": "robotics", "cls": "rl-a", "label": "Robotics - Block A"}, "B": {"c": "math15", "cls": "15-b", "label": "Math 15 - Block B"}, "C": None, "D": {"c": "math15", "cls": "15-d", "label": "Math 15 - Block D"}}},
        {"id": "s2", "name": "Semester 2", "start": "2027-02-01", "end": "2027-06-25", "blocks": {"A": {"c": "math10c", "cls": "10c-a", "label": "Math 10C - Block A"}, "B": None, "C": None, "D": None}}]
def tsave(what, v):
    return json.loads(urllib.request.urlopen('http://localhost:8770/?' + urllib.parse.urlencode({'action': 'save', 'key': 'teachkey', 'what': what, 'value': json.dumps(v)})).read())
async def main():
    print(tsave('semesters', sems)['ok'])
    get('math15', 'action=setroster&key=testkey&class=15-d&label=Math%2015%20-%20Block%20D&names=Dan%20Ng&mode=add')
    get('robotics', 'action=ping')
    urllib.request.urlopen(urllib.request.Request(MOCKS['robotics'], data=json.dumps({'kind': 'setroster', 'key': 'testkey', 'class': 'rl-a', 'label': 'Robotics - Block A', 'names': 'Ada Lovelace'}).encode(), headers={'Content-Type': 'text/plain'})).read()
    get('math15', 'action=setcal&key=testkey&class=15-d&cal=' + urllib.parse.quote(json.dumps({'v': 1, 'start': '2026-09-02', 'items': [['u4l1', 0], ['u4l2', 1]], 'skipped': []})))
    urllib.request.urlopen(urllib.request.Request(MOCKS['robotics'], data=json.dumps({'kind': 'setcal', 'key': 'testkey', 'class': 'rl-a', 'cal': {'v': 1, 'start': '2026-09-02', 'meet': [1,2,3,4,5], 'items': [{'k': 'm01', 'len': 3}], 'skipped': []}}).encode(), headers={'Content-Type': 'text/plain'})).read()
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1366, 'height': 900})
        await setup(ctx, keys=False)
        await ctx.add_init_script("localStorage.setItem('m15/hw:tkey','testkey'); localStorage.setItem('rl/tkey','testkey'); localStorage.setItem('hw:tkey','testkey'); localStorage.setItem('m15/hw:nodemo','1');")
        pg = await ctx.new_page(); errs_of(pg, errs, 'M15')
        await pg.goto(BASE + 'math15/teacher/?class=15-d&tab=settings'); await pg.wait_for_selector('.class-pick', timeout=20000); await pg.wait_for_timeout(1500)
        print('url after:', pg.url, '| class:', await pg.eval_on_selector('select.class-pick', 'e => e.value'))
        await pg.wait_for_timeout(1500)
        print('15-d block now:', [(c['code'], c['block']) for c in get('math15', 'action=classes&key=testkey')['classes']])
        txt = await pg.inner_text('.view'); print('bell panel gone:', 'Save class times' not in txt, '| class time text:', [l for l in txt.split('\n') if 'Block D' in l or 'days off' in l][:3])
        await pg.click('.brand-btn'); await pg.wait_for_selector('.tsw')
        print('menu:', (await pg.inner_text('.tsw')).replace('\n', ' | '))
        await pg.screenshot(path=SH + 'm15_menu.png')
        await pg.keyboard.press('Escape')
        await pg.click('.tab[data-tab="calendar"]'); await pg.wait_for_timeout(1500)
        print('cal days off link:', await pg.eval_on_selector_all('a.btn', "as => as.filter(a => /Days off|All classes/.test(a.textContent)).map(a => a.getAttribute('href'))"))
        # robotics ledger
        rp = await ctx.new_page(); errs_of(rp, errs, 'RL')
        await rp.goto(BASE + 'robotics/teacher/?class=rl-a&tab=calendar'); await rp.wait_for_selector('.course-btn', timeout=20000); await rp.wait_for_timeout(2500)
        await rp.click('.course-btn'); await rp.wait_for_selector('.tsw.dark')
        print('rl menu:', (await rp.inner_text('.tsw')).replace('\n', ' | '))
        await rp.screenshot(path=SH + 'rl_menu.png')
        await rp.keyboard.press('Escape')
        print('rl days off:', await rp.eval_on_selector_all('a.btn', "as => as.filter(a => /Days off/.test(a.textContent)).map(a => a.getAttribute('href'))"))
        # the universal bookmark
        gp = await ctx.new_page(); errs_of(gp, errs, 'GO')
        for at in ['2026-11-05T09:30', '2026-11-05T12:41', '2026-11-05T14:30', '2026-11-05T08:00', '2026-11-07T10:00', '2027-02-03T09:10', '2026-08-20T10:00']:
            await gp.goto(BASE + 'teaching/go/?show=1&at=' + at); await gp.wait_for_function("document.getElementById('msg').textContent.indexOf('Finding') < 0", timeout=10000)
            print(at, '→', (await gp.inner_text('#msg')).replace('\n', ' '))
        await gp.goto(BASE + 'teaching/go/?at=2026-11-05T13:00'); await gp.wait_for_url('**/math15/teacher/**', timeout=10000); await gp.wait_for_selector('.class-pick', timeout=15000); await gp.wait_for_timeout(800)
        print('redirect landed:', gp.url, await gp.eval_on_selector('select.class-pick', 'e => e.value'))
        print('errors:', [e for e in errs if '404' not in e and 'TUNNEL' not in e])
        await b.close()
asyncio.run(main())
