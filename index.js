const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const archiver = require('archiver');
const puppeteer = require('puppeteer');

async function getNaukriCookiesAndHeaders() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox']
    });

    const page = await browser.newPage();

    await page.goto('https://www.naukri.com', {
        waitUntil: 'networkidle2',
    });

    // ✅ Compatible with older Puppeteer versions
    const cookies = await page.browserContext().cookies();

    await browser.close();

    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'accept': 'application/json',
        'accept-language': 'en-US,en;q=0.9',
        'appid': 109,
        'content-type': 'application/json',
        'gid': 'LOCATION,INDUSTRY,EDUCATION,FAREA_ROLE',
        'priority': 'u=1, i',
        'systemid': 109,
        'Cookie': cookieHeader
    };

    return headers;
}

const app = express();
const PORT = process.env.PORT || 3000;

// Serve scraped JSON files statically
app.use(express.static(path.join(__dirname, 'scraped')));

// Ensure scraped directory exists
const scrapedDir = path.join(__dirname, 'scraped');
if (!fs.existsSync(scrapedDir)) fs.mkdirSync(scrapedDir);

// 🔁 List of groupIds to scrape
const groupIds = [4632583, 5947482]; // Add more groupIds here

// 🔍 Scrape endpoint
app.get('/scrape', async (req, res) => {
    const totalGroups = groupIds.length;
    let doneCount = 0;
    const startTime = Date.now();

    console.log(`🚀 Starting scraping for total groups: ${totalGroups}`);

    for (const groupId of groupIds) {
        try {
            const elapsed = (Date.now() - startTime) / 1000; // seconds
            const avgTimePerGroup = doneCount > 0 ? elapsed / doneCount : 0;
            const pendingCount = totalGroups - doneCount;

            const estRemaining = avgTimePerGroup * pendingCount;

            console.log(`🔍 Scraping groupId: ${groupId} | Done: ${doneCount}/${totalGroups} | Pending: ${pendingCount} | Elapsed: ${elapsed.toFixed(1)}s` +
                (doneCount > 0
                    ? ` | Avg/group: ${avgTimePerGroup.toFixed(2)}s | Est. remaining: ${estRemaining.toFixed(1)}s`
                    : '')
            );

            const noOfResults = 100; // Naukri allows this max result
            // Request to fetch all results
            const fullUrl = `https://www.naukri.com/jobapi/v3/search?noOfResults=${noOfResults}&groupId=${groupId}&pageNo=1&searchType=groupidsearch`;
            const fullResp = await axios.get(fullUrl, { headers: await getNaukriCookiesAndHeaders() });

            // Save to file
            const filePath = path.join(scrapedDir, `${groupId}.json`);
            fs.writeFileSync(filePath, JSON.stringify(fullResp.data, null, 2));
            console.log(`✅ Saved ${filePath}`);

            doneCount++;
        } catch (err) {
            console.error(`❌ Error scraping ${groupId}:`, err.message);
        }
    }

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`\n🎉 Scraping complete for all ${totalGroups} groups in ${totalTime.toFixed(1)} seconds.`);

    res.send(`
    ✅ Scraping complete.<br>
    <a href="/">⬅️ Go back</a><br>
    <a href="/download-all">📦 Download All JSON Files</a>
  `);
});

// 📦 Zip download endpoint
app.get('/download-all', (req, res) => {
    const archive = archiver('zip', { zlib: { level: 9 } });

    res.setHeader('Content-Disposition', 'attachment; filename="naukri-jsons.zip"');
    res.setHeader('Content-Type', 'application/zip');

    archive.pipe(res);
    archive.directory(scrapedDir, false);
    archive.finalize();
});

// 🏠 Home page
app.get('/', (req, res) => {
    res.send(`
    <h2>🧠 Naukri Scraper</h2>
    <p><a href="/scrape">▶️ Run Scraper</a></p>
    <p><a href="/download-all">📥 Download All JSONs (ZIP)</a></p>
    <p>Once scraped, you can also access individual files like: <code>/4632583.json</code></p>
  `);
});

// 🚀 Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
