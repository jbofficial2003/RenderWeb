const express = require('express');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Azure Windows App Service: when WEBSITE_RUN_FROM_PACKAGE=1, wwwroot is read-only.
// Use HOME\data as a writable root for user content (models, thumbs).
const isRunFromPackage = process.env.WEBSITE_RUN_FROM_PACKAGE === '1' || process.env.WEBSITE_RUN_FROM_PACKAGE === 'https://';
const homeDir = process.env.HOME || process.env.HOMEDRIVE && process.env.HOMEPATH ? path.join(process.env.HOMEDRIVE, process.env.HOMEPATH) : __dirname;
const writableRoot = isRunFromPackage ? path.join(homeDir, 'data') : __dirname;
const modelsDir = path.join(writableRoot, 'models');
const thumbsDir = path.join(writableRoot, 'thumbs');

app.use(cors());
app.use(express.static('public'));
app.use('/models', express.static(modelsDir));
app.use('/thumbs', express.static(thumbsDir));
// Thumbnails disabled; only serve models and public assets

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, modelsDir + path.sep),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Upload endpoint
app.post('/upload', upload.single('model'), (req, res) => {
  return res.redirect('/');
});

// List all models (simple filenames)
app.get('/models-list', (req, res) => {
  fs.readdir(modelsDir, (err, files) => {
    if (err) return res.json([]);
    res.json(files.filter(f => f.endsWith('.glb')));
  });
});

// Get models with metadata
app.get('/models-metadata', async (req, res) => {
  try {
    const files = await fs.promises.readdir(modelsDir);
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
    if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });
    const outPath = path.join(thumbsDir, `${displayName}.png`);
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
  fs.unlink(path.join(modelsDir, filename), () => res.sendStatus(200));
});




// Ensure writable directories exist
if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });
if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });

// Bind to all network interfaces (0.0.0.0) instead of just localhost
app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${port}`);
});

