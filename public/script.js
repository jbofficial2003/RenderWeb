function loadModels() {
  fetch('/models-list')
    .then(r => r.json())
    .then(models => {
      const container = document.getElementById('models');
      container.innerHTML = '';
      if (!models.length) {
        container.innerHTML = '<div style="opacity:0.6;font-size:1.15em;margin-top:50px;">No models uploaded.</div>';
      }
      models.forEach(filename => {
        const displayName = filename.replace(/^\d+-/, '');
        const block = document.createElement('div');
        block.className = 'model-block';
        block.innerHTML = `
          <div class="model-name" title="${displayName}">${displayName}</div>
          <model-viewer src="/models/${filename}" camera-controls auto-rotate ar shadow-intensity="1"></model-viewer>
          <button class="remove-btn" onclick="removeModel('${filename}')">Remove Model</button>
        `;
        container.appendChild(block);
      });
    });
}
function removeModel(filename) {
  fetch('/remove/' + filename, { method: 'DELETE' })
    .then(() => loadModels());
}
loadModels();