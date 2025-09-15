const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const archiver = require('archiver');
const pLimit = require('p-limit');

const app = express();
const PORT = process.env.PORT || 3000;

const groupIds = [4590793, 4590835]; // Add more group IDs here
const gifDir = path.join(__dirname, 'gifs');
if (!fs.existsSync(gifDir)) fs.mkdirSync(gifDir);

// Custom headers (can rotate if needed)
const HEADERS = {
    'accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'dnt': '1',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'cache-control': 'no-cache',
};

// Download single .gif by groupId
async function downloadGif(groupId, attempt = 1) {
    const url = `https://img.naukimg.com/logo_images/groups/v1/${groupId}.gif`;
    const filepath = path.join(gifDir, `${groupId}.gif`);

    if (fs.existsSync(filepath)) {
        console.log(`✅ Already exists: ${groupId}.gif`);
        return { groupId, success: true, skipped: true };
    }

    try {
        const response = await axios.get(url, {
            responseType: 'stream',
            headers: HEADERS,
            timeout: 10000
        });

        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        console.log(`✅ Downloaded: ${groupId}.gif`);
        return { groupId, success: true };
    } catch (err) {
        if (attempt < 3) {
            console.warn(`🔁 Retry ${attempt} for ${groupId}`);
            return downloadGif(groupId, attempt + 1);
        }
        console.error(`❌ Failed: ${groupId} (${err.message})`);
        return { groupId, success: false, error: err.message };
    }
}

function chunkArray(arr, size) {
    const result = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}

// Endpoint to start GIF scraping
app.get('/scrape-gifs', async (req, res) => {
    const limit = pLimit(5); // limit concurrent downloads
    const majorGroups = chunkArray(groupIds, 500);

    for (let i = 0; i < majorGroups.length; i++) {
        const group = majorGroups[i];
        console.log(`\n➡️ Processing batch ${i + 1}/${majorGroups.length}`);

        const promises = group.map(id => limit(() => downloadGif(id)));
        const results = await Promise.all(promises);

        const successCount = results.filter(r => r.success).length;
        const failCount = results.length - successCount;
        console.log(`📊 Batch ${i + 1}: ✅ ${successCount}, ❌ ${failCount}`);
    }

    res.send(`🎉 All GIF scraping done! <a href="/">⬅️ Go Home</a>`);
});

// Endpoint to download all gifs as ZIP
app.get('/download-gifs', (req, res) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    res.setHeader('Content-Disposition', 'attachment; filename="naukri-gifs.zip"');
    res.setHeader('Content-Type', 'application/zip');
    archive.pipe(res);
    archive.directory(gifDir, false);
    archive.finalize();
});

// Home
app.get('/', (req, res) => {
    res.send(`
    <h2>🖼️ Naukri GIF Scraper</h2>
    <p><a href="/scrape-gifs">▶️ Scrape GIF Logos</a></p>
    <p><a href="/download-gifs">📥 Download All GIFs (ZIP)</a></p>
  `);
});

app.listen(PORT, () => {
    console.log(`🚀 GIF Server running at http://localhost:${PORT}`);
});
