import asyncio, sys, json, zipfile
sys.path.insert(0, __import__('os').path.dirname(__file__))
from common import *
from playwright.async_api import async_playwright
SP = '/tmp/teach_'
SH = SP + 'flow_'
async def main():
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1366, 'height': 1000}, accept_downloads=True)
        await setup(ctx)
        await ctx.add_init_script("if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x','1'); localStorage.setItem('hw:tkey','testkey'); localStorage.setItem('m15/hw:tkey','testkey'); localStorage.setItem('rl/tkey','testkey'); }")
        pg = await ctx.new_page(); errs_of(pg, errs, 'H')
        await pg.goto(BASE + 'teaching/#/schedule'); await pg.wait_for_selector('.sem', timeout=15000)
        await pg.wait_for_function("document.querySelectorAll('.bclass select').length >= 3", timeout=20000)
        vals = await pg.eval_on_selector_all('.brow', "rs => rs.map(r => [r.querySelector('.blk').textContent, r.querySelector('select').value, (r.querySelector('.bclass select')||{}).value || '', (r.querySelector('.code')||{}).value || ''])")
        print('draft rows:', vals)
        await pg.screenshot(path=SH + 'schedule.png', full_page=True)
        await pg.click('.sem-acts .btn-primary')
        await pg.wait_for_selector('.sem-acts .flash', timeout=20000)
        print('flash:', await pg.inner_text('.sem-acts .flash'))
        st = json.loads(urllib.request.urlopen('http://localhost:8770/__stats').read())
        sems = json.loads(st['SEMESTERS']); print('saved sem blocks:', json.dumps(sems[0]['blocks']))
        print('keys saved:', st.get('KEYS'))
        await pg.wait_for_timeout(1500)
        print('m15 classes:', [(c['code'], c['block']) for c in get('math15', 'action=classes&key=testkey')['classes']])
        print('rl classes:', [c['code'] for c in get('robotics', 'action=classes&key=testkey')['classes']])
        # calendar: make calendars
        await pg.goto(BASE + 'teaching/#/calendar'); await pg.wait_for_selector('.ucal-weeks', timeout=15000)
        await pg.wait_for_function("!document.querySelector('.ucal-msg').textContent.startsWith('Reading')", timeout=20000)
        n = await pg.locator('.ucal-notes .notice .btn-primary').count(); print('make buttons', n)
        for i in range(n):
            await pg.locator('.ucal-notes .notice .btn-primary').first.click()
            await pg.wait_for_timeout(1500)
        await pg.wait_for_function("document.querySelectorAll('.ucal-notes .notice .btn-primary').length == 0", timeout=20000)
        await pg.wait_for_timeout(800)
        print('chips:', await pg.locator('.ud .uchip').count())
        await pg.evaluate("HUB.ucal.scrollTo('2026-09-07')"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=SH + 'cal_sep.png')
        # drag u4l2 in block B (math15) to the next day of u4l3? find a lesson chip in block B on a date
        dateOf = lambda k, blk: pg.evaluate("([k,b]) => { const c = document.querySelector('.ud .uchip[data-key=\"'+k+'\"][data-block=\"'+b+'\"]'); return c ? c.closest('.ud').dataset.date : null; }", [k, blk])
        cal0 = get('math15', 'action=cal&class=15-b')['cal']
        k1 = cal0['items'][3][0]; k2 = cal0['items'][4][0]
        await pg.evaluate("HUB.ucal.scrollTo('%s')" % cal0['start']); await pg.wait_for_timeout(300)
        d1, d2 = await dateOf(k1, 'B'), await dateOf(k2, 'B')
        print('before', k1, d1, k2, d2)
        src = pg.locator('.ud .uchip[data-key="%s"][data-block="B"]' % k2).first
        dst = pg.locator('.ud[data-date="%s"]' % d1).first
        a = await src.bounding_box(); bb = await dst.bounding_box()
        await pg.mouse.move(a['x'] + 10, a['y'] + 5); await pg.mouse.down(); await pg.mouse.move(a['x'] + 30, a['y'] + 25, steps=3)
        await pg.mouse.move(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] - 10, steps=8); await pg.mouse.up()
        await pg.wait_for_function("document.querySelector('.ucal-msg').textContent.includes('moved')", timeout=15000)
        print('msg:', await pg.inner_text('.ucal-msg'))
        cal1 = get('math15', 'action=cal&class=15-b')['cal']
        print('backend now:', [x for x in cal1['items'][:6]])
        assert dict(cal1['items'])[k2] == dict(cal1['items'])[k1], 'two lessons on one day now'
        # 15-d shares? (no sync) so unchanged
        # undo
        await pg.click('.ucal-tools .btn:has-text("Undo")'); await pg.wait_for_function("document.querySelector('.ucal-msg').textContent.includes('Undone')", timeout=15000)
        assert get('math15', 'action=cal&class=15-b')['cal']['items'][:6] == cal0['items'][:6], 'undo restored'
        # tap a robotics mission → one class longer
        rc = pg.locator('.ud .uchip[data-block="A"]').first
        await rc.scroll_into_view_if_needed(); await rc.click(); await pg.wait_for_selector('.upop')
        await pg.screenshot(path=SH + 'pop.png')
        rcal0 = get('robotics', 'action=cal&class=rl-a')['cal']
        await pg.click('.upop .btn:has-text("One class longer")')
        await pg.wait_for_function("document.querySelector('.ucal-msg').textContent.includes('longer')", timeout=15000)
        rcal1 = get('robotics', 'action=cal&class=rl-a')['cal']
        print('robotics len', rcal0['items'][0], '->', rcal1['items'][0])
        # days off mode: mark 2026-11-11 off
        await pg.goto(BASE + 'teaching/#/calendar/daysoff'); await pg.wait_for_selector('.ucal-weeks.offmode', timeout=15000)
        await pg.wait_for_function("!document.querySelector('.ucal-msg').textContent.startsWith('Reading')", timeout=20000)
        await pg.evaluate("HUB.ucal.scrollTo('2026-11-09')"); await pg.wait_for_timeout(300)
        await pg.click('.ud[data-date="2026-11-11"] .ud-h')
        await pg.wait_for_function("document.querySelector('.ucal-msg').textContent.includes('day off')", timeout=20000)
        print('msg:', await pg.inner_text('.ucal-msg'))
        print('noschool everywhere:', get('math10c', 'action=classes&key=testkey')['noSchool'], get('math15', 'action=classes&key=testkey')['noSchool'], get('robotics', 'action=classes&key=testkey')['noSchool'])
        await pg.screenshot(path=SH + 'cal_off.png')
        # today
        await pg.goto(BASE + 'teaching/#/today/2026-11-05'); await pg.wait_for_selector('.period'); await pg.wait_for_timeout(2500)
        await pg.screenshot(path=SH + 'today.png', full_page=True)
        # sub plans
        await pg.goto(BASE + 'teaching/#/subs/2026-11-05'); await pg.wait_for_selector('.sub-sec', timeout=20000); await pg.wait_for_timeout(500)
        await pg.screenshot(path=SH + 'subs.png', full_page=True)
        async with pg.expect_download() as dl:
            await pg.click('.sub-h .btn-primary')
        d = await dl.value; path = SP + 'subplan.docx'; await d.save_as(path)
        z = zipfile.ZipFile(path); xml = z.read('word/document.xml').decode()
        print('docx ok, words:', len(xml), 'has Block B:', 'Block B' in xml, 'hyperlink:', 'w:hyperlink' in xml)
        print('errors:', errs)
        await b.close()
asyncio.run(main())
