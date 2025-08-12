const express = require('express');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3000;

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

// Helper function to categorize models
function getCategoryFromName(name) {
  const lowerName = name.toLowerCase();
  
  if (['cube', 'sphere', 'cylinder', 'square'].includes(lowerName)) {
    return 'Geometric';
  } else if (['alphabet'].includes(lowerName)) {
    return 'Educational';
  } else if (['cat', 'dog', 'elephant', 'fox', 'goat', 'hen', 'lion', 'monkey', 'owl', 'parrot', 'quail', 'rat', 'zebra'].includes(lowerName)) {
    return 'Animals';
  } else if (['apple', 'ball', 'icecream', 'jug', 'kite', 'nest', 'ship', 'telephone', 'umbrella', 'van', 'watch', 'xylophone', 'yacht'].includes(lowerName)) {
    return 'Objects';
  } else if (['damaged_helmet'].includes(lowerName)) {
    return 'Equipment';
  } else {
    return 'General';
  }
}

// Helper function to get descriptions
function getDescriptionFromName(name) {
  const lowerName = name.toLowerCase();
  
  const descriptions = {
    'cube': 'A three-dimensional solid object bounded by six square faces, facets or sides, with three meeting at each vertex.',
    'cylinder': 'A three-dimensional solid that holds two parallel bases joined by a curved surface, at a fixed distance.',
    'sphere': 'A perfectly round three-dimensional object where every point on the surface is equidistant from the center.',
    'square': 'A two-dimensional shape with four equal sides and four right angles.',
    'alphabet': 'Educational model for learning the alphabet.',
    'apple': 'A round fruit with red, yellow, or green skin and white flesh.',
    'ball': 'A spherical object used in various sports and games.',
    'cat': 'A small domesticated carnivorous mammal with soft fur.',
    'dog': 'A domesticated carnivorous mammal, typically kept as a pet.',
    'elephant': 'A large gray mammal with a long trunk and tusks.',
    'fox': 'A small wild canine with a bushy tail and pointed ears.',
    'goat': 'A domesticated ruminant mammal with backward-curving horns.',
    'hen': 'A female chicken, especially one kept for egg production.',
    'icecream': 'A sweet frozen food made from dairy products.',
    'jug': 'A container for holding liquids, typically with a handle and spout.',
    'kite': 'A light frame covered with paper or cloth, flown in the wind.',
    'lion': 'A large wild cat with a tawny coat and a flowing mane.',
    'monkey': 'A small to medium-sized primate with a long tail.',
    'nest': 'A structure built by birds to hold their eggs and young.',
    'owl': 'A nocturnal bird of prey with large eyes and a hooked beak.',
    'parrot': 'A colorful tropical bird with a curved beak and the ability to mimic speech.',
    'quail': 'A small ground-dwelling bird with a plump body.',
    'rat': 'A rodent with a long tail and pointed snout.',
    'ship': 'A large vessel for transporting passengers or cargo by sea.',
    'telephone': 'A device for transmitting sound over long distances.',
    'umbrella': 'A device used for protection against rain or sun.',
    'van': 'A motor vehicle used for transporting goods or people.',
    'watch': 'A small timepiece worn on the wrist.',
    'xylophone': 'A musical instrument with wooden bars struck by mallets.',
    'yacht': 'A medium-sized sailing vessel used for recreation.',
    'zebra': 'A wild horse with black and white stripes.',
    'damaged_helmet': 'A protective headgear that has been damaged or worn.'
  };
  
  return descriptions[lowerName] || 'A 3D model for AR viewing and interaction.';
}

// Ensure models directory exists
if (!fs.existsSync('models')) fs.mkdirSync('models');

// Bind to all network interfaces (0.0.0.0) instead of just localhost
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Server also accessible at http://172.16.134.226:${port}`);
});
