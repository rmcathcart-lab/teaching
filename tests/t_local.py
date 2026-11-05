import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__file__))
from common import *
from playwright.async_api import async_playwright
async def main():
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        await setup(ctx, keys=False, backend=False)
        await ctx.add_init_script("if (!sessionStorage.x) { sessionStorage.x = 1; localStorage.setItem('m15/hw:tkey','testkey'); localStorage.setItem('rl/tkey','testkey'); localStorage.setItem('hw:tkey','testkey'); }")
        pg = await ctx.new_page(); errs_of(pg, errs, 'L')
        await pg.goto(BASE + 'teaching/#/schedule'); await pg.wait_for_function("document.querySelectorAll('.bclass select').length >= 3", timeout=20000)
        print('local banner:', await pg.locator('.local-note').count())
        await pg.click('.sem-acts .btn-primary'); await pg.wait_for_selector('.save-log .flash', timeout=20000)
        print(await pg.inner_text('.save-log .flash'))
        loc = await pg.evaluate("JSON.parse(localStorage.getItem('teach/local'))")
        print('local keys:', sorted(loc.get('keys', {}).keys()), 'sems:', len(loc['semesters']))
        await pg.goto(BASE + 'teaching/#/settings'); await pg.wait_for_selector('#sec-daysoff')
        await pg.fill('.off-add input >> nth=0', '2026-12-21'); await pg.fill('.off-add input >> nth=1', '2027-01-01'); await pg.click('.off-add .btn-primary')
        await pg.wait_for_function("document.querySelector('#sec-daysoff .flash') || document.querySelector('.hub-body > .flash')", timeout=20000); await pg.wait_for_timeout(500)
        print('off:', await pg.evaluate("JSON.parse(localStorage.getItem('teach/local')).noSchool.length"), 'm10c:', len(get('math10c', 'action=classes&key=testkey')['noSchool']), 'rl:', len(get('robotics', 'action=classes&key=testkey')['noSchool']))
        print('flash:', await pg.evaluate("(document.querySelector('#sec-daysoff .flash')||{}).textContent"))
        m = await ctx.new_page(); errs_of(m, errs, 'M15')
        await m.goto(BASE + 'math15/teacher/?class=15-d&tab=settings'); await m.wait_for_selector('.class-pick', timeout=20000); await m.wait_for_timeout(2500)
        print('m15 settings block line:', [l for l in (await m.inner_text('.view')).split('\n') if l.startswith('Block ') or l.startswith('No block')][:2])
        print('errors:', [e for e in errs if '404' not in e and 'TUNNEL' not in e])
        await b.close()
asyncio.run(main())
