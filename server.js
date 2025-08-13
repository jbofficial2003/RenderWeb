const express = require('express');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));
app.use('/models', express.static('models'));
// Thumbnails disabled; only serve models and public assets

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'models/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Upload endpoint
app.post('/upload', upload.single('model'), (req, res) => {
  return res.redirect('/');
});

// List all models (simple filenames)
app.get('/models-list', (req, res) => {
  fs.readdir('models', (err, files) => {
    if (err) return res.json([]);
    res.json(files.filter(f => f.endsWith('.glb')));
  });
});

// Get models with metadata
app.get('/models-metadata', async (req, res) => {
  try {
    const files = await fs.promises.readdir('models');
    const glbFiles = files.filter(f => f.endsWith('.glb'));

    const models = [];
    for (const filename of glbFiles) {
      const displayName = filename.replace(/^\d+-/, '').replace('.glb', '');
      const category = getCategoryFromName(displayName);
      const description = getDescriptionFromName(displayName);

      models.push({
        id: filename,
        name: displayName.charAt(0).toUpperCase() + displayName.slice(1),
        filename,
        description,
        category,
        thumbnailUrl: null
      });
    }

    res.json({ success: true, models, message: null });
  } catch (_err) {
    res.json({ success: false, models: [], message: 'Error reading models directory' });
  }
});

// Generate thumbnail on the fly if missing (simple approach using model-viewer snapshot)
// Note: For production, consider headless GL rendering or pre-processing.
app.get('/generate-thumb/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const displayName = filename.replace(/^\d+-/, '').replace('.glb', '');
    const thumbDir = path.join('public', 'thumbs');
    if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
    const outPath = path.join(thumbDir, `${displayName}.png`);
    if (fs.existsSync(outPath)) return res.json({ ok: true, url: `/thumbs/${displayName}.png` });

    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
    const modelUrl = `${req.protocol}://${req.get('host')}/models/${filename}`;
    const html = `<!DOCTYPE html><html><head>
      <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
      <style>html,body{margin:0;padding:0}</style>
      </head><body>
      <model-viewer id="mv" src="${modelUrl}" camera-controls shadow-intensity="1" exposure="1.0" style="width:512px;height:512px"></model-viewer>
      </body></html>`;
    await page.setContent(html, { waitUntil: 'networkidle0' });
    // wait a bit for model to render
    await page.waitForTimeout(1200);
    const buf = await page.screenshot({ type: 'png' });
    await browser.close();
    fs.writeFileSync(outPath, buf);
    return res.json({ ok: true, url: `/thumbs/${displayName}.png` });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// Remove a model
app.delete('/remove/:filename', (req, res) => {
  const filename = req.params.filename;
  fs.unlink(path.join('models', filename), () => res.sendStatus(200));
});




// Ensure models directory exists
if (!fs.existsSync('models')) fs.mkdirSync('models');

// Bind to all network interfaces (0.0.0.0) instead of just localhost
app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${port}`);
});

