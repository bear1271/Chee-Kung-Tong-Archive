const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const site = path.resolve(__dirname, '../site/dist');
const browserPath = process.env.PLAYWRIGHT_EXECUTABLE;

function csvIds(text) {
    // Parse quoted fields, including doubled quotes and embedded newlines.
    const rows = [];
    let row = [], value = '', quoted = false;
    for (let i = 1; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            if (quoted && text[i + 1] === '"') { value += '"'; i++; }
            else quoted = !quoted;
        } else if (!quoted && (char === ',' || char === '\r')) {
            row.push(value);
            value = '';
            if (char === '\r') { rows.push(row); row = []; i++; }
        } else value += char;
    }
    rows.push([...row, value]);
    assert.equal(rows[0][0], '内部记录编号');
    assert.ok(rows.slice(1).every(r => r.length === rows[0].length));
    return rows.slice(1).map(r => r[0]);
}

async function main() {
    const state = path.resolve(__dirname, '../state');
    await fs.mkdir(state,{recursive:true});
    const temp = await fs.mkdtemp(path.join(state,'search-accept-'));
    let browser;
    try {
        browser = await chromium.launch({headless:true, downloadsPath:temp, executablePath:browserPath});
        const page = await browser.newPage({acceptDownloads:true, viewport:{width:1360,height:1000}});
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('requestfailed', r => { if (r.url().startsWith('file:')) errors.push(r.url()); });
        await page.goto(pathToFileURL(path.join(site,'index.html')).href);
        const at = selector => page.locator(selector);
        const ids = () => at('#results article').evaluateAll(rows => rows.map(row => row.dataset.recordId));
        const query = (text, scope='all') => at('#search-scope').selectOption(scope).then(()=>at('#query').fill(text));
        const reset = () => at('#reset').click();
        async function year(from, to) {
            if (!await at('#from').isVisible()) await at('#filter-options summary').click();
            await at('#from').fill(String(from));
            await at('#to').fill(String(to));
            await at('#to').blur();
            assert.equal(await at('#to').evaluate(e=>e.validity.valid), true);
        }
        async function downloadCSV() {
            const [download] = await Promise.all([page.waitForEvent('download'), at('#export').click()]);
            const dest = path.join(temp, 'selection.csv');
            await download.saveAs(dest);
            return fs.readFile(dest, 'utf8');
        }

        const exportIds=async()=>csvIds(await downloadCSV());

        await page.waitForFunction(() => document.querySelector('#result-count').textContent.includes('5,650'));
        const allIds = await exportIds();
        assert.equal(allIds.length,5650);
        assert.equal(new Set(allIds).size,5650);
        assert.deepEqual(await ids(),allIds.slice(0,40));
        console.log('PASS all 5,650 IDs, unique CSV rows and first page order');

        await query('A1-2-8','identifier');
        assert.deepEqual(await ids(),['CKT-R000033','CKT-R000035']);
        assert.deepEqual(await exportIds(),await ids());
        assert.match(await at('#results').innerText(),/工作簿目录 · 档号 · Sheet1/);
        await query('黄三德','catalogue');
        assert.match(await at('#results').innerText(),/黃三德/);
        console.log('PASS exact duplicate archive numbers and simplified input with original spelling');

        await reset();
        await at('#browse-controls summary').click();
        await at('#all-tab').click();
        assert.equal(await at('#directory-search').isVisible(),false);
        assert.match(await at('#directory-note').innerText(),/详情与导出保留类别原文/);
        assert.ok(await at('#directory-list button').filter({hasText:'通信'}).filter({hasText:'3,407'}).count());
        await at('#directory-list button').filter({hasText:'注册文件与章程'}).click();
        assert.match(await at('#active-filter-text').innerText(),/注册文件与章程/);
        await at('#results .record-title').first().click();
        assert.match(await at('#detail-body').innerText(),/O-Articles of incorporation/);
        await at('#close-detail').click();
        assert.match(await downloadCSV(),/O-Articles of incorporation/);
        await reset();
        await at('#browse-controls summary').click();
        await query('黄三德','catalogue');
        console.log('PASS public category labels, grouped spellings, and intact source category');


        const script=at('#interface-script');
        const originalIds=await ids(),originalCSV=await downloadCSV();
        const sourceText=await at('#results .record-title').first().textContent();
        assert.match(await at('#results').innerText(),/简繁字形匹配/);
        await script.selectOption('hant');
        assert.equal(await at('html').getAttribute('lang'),'zh-Hant');
        assert.match(await at('#catalogue-panel h2').first().innerText(),/檔案目錄/);
        assert.match(await at('#timeline-status').innerText(),/區間總覽/);
        assert.equal(await at('#query').inputValue(),'黄三德');
        assert.equal(await at('#results .record-title').first().textContent(),sourceText);
        assert.deepEqual(await ids(),originalIds);
        assert.equal(await downloadCSV(),originalCSV);
        await at('#results .record-title').first().click();
        assert.match(await at('#detail-body').innerText(),/人物原文[\s\S]*黃三德/);
        assert.match(await at('#detail-body').innerText(),/工作簿目錄/);
        await at('#close-detail').click();
        await query('黃三德','catalogue');
        assert.deepEqual(await ids(),originalIds);

        await reset();
        await at('#browse-controls summary').click();
        await at('#person-tab').click();
        await at('#directory-search').fill('黄三德');
        const simplifiedName=at('#directory-list button').filter({has:page.getByText('黄三德',{exact:true})});
        await simplifiedName.click();
        const exactIDs=await exportIds();
        const expected=await page.evaluate(()=>window.CKT_DATA.records.filter(r=>r.people_raw.includes('黄三德')).map(r=>r.id));
        assert.deepEqual(exactIDs,expected);
        await at('#directory-list button').filter({has:page.getByText('黃三德',{exact:true})}).click();
        assert.ok((await exportIds()).length>exactIDs.length);
        await page.reload();
        await page.waitForFunction(()=>document.querySelector('#result-count').textContent.includes('5,650'));
        assert.equal(await script.inputValue(),'hant');
        await script.selectOption('hans');
        assert.equal(await at('html').getAttribute('lang'),'zh-Hans');
        assert.match(await at('#catalogue-panel h2').first().innerText(),/档案目录/);
        await query('驻墨京','image');
        assert.deepEqual(await ids(),['CKT-R000155']);
        assert.match(await at('#results').innerText(),/駐墨京/);
        console.log('PASS localized UI, verbatim names and CSV, exact name selection, persisted script, and character-form search');

        await query('墨京','library');
        assert.ok(await at('[data-record-id="CKT-R000155"]').count());
        await at('[data-record-id="CKT-R000155"] .record-title').click();
        assert.match(await at('#detail-body').innerText(),/馆方著录/);
        assert.match(await at('#detail-body').innerText(),/287503 · MARC 245/);
        assert.match(await at('#detail-body').innerText(),/未市卡利/);
        await at('#close-detail').click();
        await query('駐墨京','image');
        assert.deepEqual(await ids(),['CKT-R000155']);
        assert.match(await at('#results').innerText(),/A2-3-1_001.jpg · 右侧竖行/);
        assert.deepEqual(await exportIds(),['CKT-R000155']);
        assert.ok(await at('#map g.city').count() > 1);
        console.log('PASS separate MARC and reviewed image sources, multi-place map and one CSV record');

        await reset();
        await query('A1-1-16','identifier');
        await year(1931,1931);
        await at('#undated').uncheck();
        assert.equal((await ids()).length,1);
        await at('#pending').uncheck();
        assert.deepEqual(await ids(),[]);
        await reset();
        await query('A6-2-12','identifier');
        await year(1927,1927);
        await at('#undated').uncheck();
        assert.deepEqual(await ids(),[]);
        await year(1928,1928);
        await at('#sort').selectOption('date');
        assert.match(await at('#results h3').innerText(),/1928/);
        assert.deepEqual(await ids(),['CKT-R000643']);
        await reset();
        await query('CKT-R005378','identifier');
        assert.deepEqual(await ids(),['CKT-R005378']);
        assert.match(await at('#results').innerText(),/尚未落点/);
        assert.match(await at('#results h3').innerText(),/未能定位到年份/);
        assert.equal(await at('#map g.city').count(),0);
        assert.deepEqual(await exportIds(),['CKT-R005378']);
        console.log('PASS uncertain date, discrete years, chronological grouping and undated record without map or library match');

        await reset();
        await at('#historical-open').click();
        await at('#historical-query').fill('1915');
        assert.equal(await at('#historical-select option').count(),1);
        assert.match(await at('#historical-title').innerText(),/旧金山/);
        assert.match(await at('#historical-metadata').innerText(),/1892—1913/);
        assert.ok(await at('#historical-image image').count());
        await at('#historical-query').fill('no-match');
        assert.match(await at('#historical-alignment').innerText(),/没有符合/);
        await at('#historical-query').fill('湾区');
        await at('#historical-year').click();
        assert.equal(await at('#from').inputValue(),'1915');
        assert.equal(await at('#to').inputValue(),'1915');
        console.log('PASS historical map search, unchanged image layer and catalogue year action');

        await reset();
        await query('A6-2-12','identifier');
        await year(1926,1928);
        const slider=at('#timeline-slider'), frame=at('#timeline-year'), play=at('#timeline-play');
        const status=at('#timeline-status'), mode=at('#timeline-mode'), doubt=at('#timeline-doubt');
        const dots=at('#map g.city');
        assert.match(await status.innerText(),/^区间总览/);
        await slider.press('ArrowRight');
        assert.equal(await frame.inputValue(),'1927');
        assert.deepEqual(await ids(),[]);
        assert.equal(await dots.count(),0);
        await slider.press('ArrowRight');
        assert.match(await status.innerText(),/^1928 年/);
        assert.deepEqual(await ids(),['CKT-R000643']);
        await slider.press('ArrowLeft');
        await mode.selectOption('cumulative');
        assert.match(await status.innerText(),/^1926–1927 年累计/);
        assert.deepEqual(await ids(),['CKT-R000643']);
        assert.ok(await dots.count()>1);
        const counts=await dots.locator('title').allTextContents();
        await slider.press('End');
        assert.deepEqual(await dots.locator('title').allTextContents(),counts);
        assert.deepEqual(await exportIds(),['CKT-R000643']);
        await at('#timeline-overview').click();
        assert.match(await status.innerText(),/^区间总览/);
        assert.equal(await at('#undated').isEnabled(),true);
        console.log('PASS slider, yearly vs cumulative, map and CSV deduplication, overview');

        await slider.press('ArrowRight');
        assert.match(await status.innerText(),/^1926–1927 年累计/);
        const origin=at('#timeline-origin'),anchor=at('#timeline-anchor');
        await origin.selectOption('custom');
        assert.equal(await anchor.inputValue(),'1927');
        assert.match(await status.innerText(),/^1927–1927 年累计/);
        assert.deepEqual(await ids(),[]);
        await slider.press('ArrowRight');
        assert.deepEqual(await ids(),['CKT-R000643']);
        await anchor.fill('1926');
        await anchor.blur();
        assert.match(await status.innerText(),/^1926–1928 年累计/);
        await at('#timeline-overview').click();
        await anchor.fill('1927');
        await anchor.blur();
        await play.click();
        assert.equal(await frame.inputValue(),'1927');
        await play.click();
        await origin.selectOption('range');
        assert.match(await status.innerText(),/^1926–1927 年累计/);
        assert.deepEqual(await ids(),['CKT-R000643']);
        console.log('PASS custom cumulative start, default start, and playback begins at custom anchor');

        await reset();
        await year(1930,1932);
        await query('A1-1-16','identifier');
        if (!await frame.isVisible()) await at('#playback-settings summary').click();
        await frame.fill('1931');
        await frame.blur();
        assert.deepEqual(await ids(),[]);
        await doubt.check();
        assert.deepEqual(await ids(),['CKT-R000017']);
        assert.equal(await dots.locator('circle').getAttribute('fill'),'#faf9f5');
        await query('A3-3-10','identifier');
        assert.deepEqual(await ids(),[]);
        await query('CKT-R005378','identifier');
        assert.deepEqual(await ids(),[]);
        await at('#timeline-overview').click();
        assert.deepEqual(await ids(),['CKT-R005378']);
        console.log('PASS optional doubt, hollow map symbol, no undated or century-only results');

        await reset();
        await query('A6-2-12','identifier');
        await year(1926,1928);
        if (!await frame.isVisible()) await at('#playback-settings summary').click();
        await page.clock.install();
        await play.click();
        assert.equal(await frame.inputValue(),'1926');
        assert.deepEqual(await ids(),['CKT-R000643']);
        await page.clock.runFor(850);
        assert.equal(await frame.inputValue(),'1927');
        assert.deepEqual(await ids(),[]);
        await play.click();
        await page.clock.runFor(1700);
        assert.equal(await frame.inputValue(),'1927');
        await play.click();
        await page.clock.runFor(850);
        assert.equal(await frame.inputValue(),'1928');
        assert.equal(await play.textContent(),'播放');
        assert.deepEqual(await ids(),['CKT-R000643']);
        await page.clock.runFor(1700);
        assert.equal(await frame.inputValue(),'1928');
        console.log('PASS playback advances, pauses, resumes and stops at the selected end year');
        const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
        const mobileErrors=[];
        mobile.on('pageerror', error=>mobileErrors.push(error.message));
        await mobile.goto(pathToFileURL(path.join(site,'index.html')).href);
        await mobile.waitForFunction(()=>document.querySelector('#result-count').textContent.includes('5,650'));
        assert.equal(await mobile.locator('#map-panel').isVisible(),false);
        const first=mobile.locator('#results .record-title').first();
        assert.ok((await first.boundingBox()).y<844);
        assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),390);
        await mobile.locator('#interface-script').selectOption('hant');
        assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),390);
        await mobile.locator('#interface-script').selectOption('hans');
        await first.focus();
        await mobile.keyboard.press('Enter');
        assert.equal(await mobile.locator('#detail').isVisible(),true);
        assert.ok(await mobile.getByRole('heading',{name:'工作簿目录',exact:true}).isVisible());
        await mobile.keyboard.press('Escape');
        assert.equal(await first.evaluate(element=>element===document.activeElement),true);
        await mobile.locator('#query').fill('A2-3-1');
        const filter=await mobile.locator('#active-filter-text').textContent();
        await mobile.locator('#show-map').click();
        assert.equal(await mobile.locator('#map-panel').isVisible(),true);
        assert.equal(await mobile.locator('#catalogue-panel').isVisible(),false);
        await mobile.locator('#show-records').click();
        assert.equal(await mobile.locator('#active-filter-text').textContent(),filter);
        assert.deepEqual(mobileErrors,[]);
        await mobile.close();
        assert.deepEqual(errors,[]);
        console.log('PASS mobile first result, keyboard detail focus, and shared filters between views');
    } finally {
        if (browser) await browser.close();
        await fs.rm(temp, {recursive:true, force:true});
    }
}

main().catch(error => {console.error(error);process.exitCode=1;});
