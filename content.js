(() => {
  'use strict';

  // --- Einstellungen (gecacht, werden async aus chrome.storage geladen) ---
  let cachedSettings = { quality: 0.8, maxDimension: 1920, format: 'image/jpeg' };
  chrome.storage.local.get(['gpm_quality', 'gpm_maxDimension', 'gpm_format'], (data) => {
    cachedSettings = {
      quality: data.gpm_quality ?? 0.8,
      maxDimension: data.gpm_maxDimension ?? 1920,
      format: data.gpm_format ?? 'image/jpeg',
    };
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.gpm_quality)      cachedSettings.quality      = changes.gpm_quality.newValue;
    if (changes.gpm_maxDimension) cachedSettings.maxDimension = changes.gpm_maxDimension.newValue;
    if (changes.gpm_format)       cachedSettings.format       = changes.gpm_format.newValue;
  });

  function getSettings() { return { ...cachedSettings }; }

  // --- Bildkomprimierung via Canvas ---
  async function compressImage(file, settings) {
    return new Promise((resolve, reject) => {
      const { quality, maxDimension, format } = settings;
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);

        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('Canvas toBlob fehlgeschlagen')); return; }
            const ext = format === 'image/png' ? '.png' : '.jpg';
            const baseName = file.name.replace(/\.[^.]+$/, '');
            const newName = baseName + ext;
            resolve(new File([blob], newName, { type: format }));
          },
          format,
          quality
        );
      };

      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht geladen werden')); };
      img.src = url;
    });
  }

  // --- Dateigröße lesbar formatieren ---
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  // --- Komprimierungs-Dialog ---
  function showCompressionDialog(files, onConfirm) {
    const settings = getSettings();
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) { onConfirm(files); return; }

    const overlay = document.createElement('div');
    overlay.id = 'gpm-overlay';
    overlay.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,.55);
      display:flex; align-items:center; justify-content:center; z-index:99999;
      font-family: 'Google Sans', Roboto, sans-serif;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background:#fff; border-radius:12px; padding:28px 32px;
      box-shadow:0 8px 32px rgba(0,0,0,.25); width:460px; max-width:95vw;
    `;

    const listHTML = imageFiles.map((f, i) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px;color:#444">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${f.name}">${f.name}</span>
        <span style="color:#888;white-space:nowrap">${formatSize(f.size)}</span>
        <span id="gpm-arrow-${i}" style="color:#aaa">→</span>
        <span id="gpm-size-${i}" style="color:#1a73e8;white-space:nowrap;min-width:60px;text-align:right">…</span>
      </div>
    `).join('');

    dialog.innerHTML = `
      <h2 style="margin:0 0 16px;font-size:18px;font-weight:500;color:#202124;display:flex;align-items:baseline;gap:8px">
        📷 Bilder komprimieren
        <span style="font-size:11px;font-weight:400;color:#aaa">v1.0.4</span>
      </h2>
      <div style="margin-bottom:18px">${listHTML}</div>

      <div style="background:#f8f9fa;border-radius:8px;padding:14px 16px;margin-bottom:20px">
        <label style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;font-size:13px;color:#444">
          <span>Qualität: <strong id="gpm-q-label">${Math.round(settings.quality * 100)}%</strong></span>
          <input id="gpm-quality" type="range" min="10" max="100"
            value="${Math.round(settings.quality * 100)}"
            style="width:180px;accent-color:#1a73e8">
        </label>
        <label style="display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#444">
          <span>Max. Auflösung: <strong id="gpm-dim-label">${settings.maxDimension}px</strong></span>
          <input id="gpm-maxdim" type="range" min="480" max="4096" step="160"
            value="${settings.maxDimension}"
            style="width:180px;accent-color:#1a73e8">
        </label>
      </div>

      <div id="gpm-preview-note" style="font-size:12px;color:#888;margin-bottom:16px;min-height:16px"></div>

      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button id="gpm-cancel" style="
          padding:9px 20px;border:1px solid #dadce0;border-radius:6px;
          background:#fff;color:#444;font-size:14px;cursor:pointer">
          Abbrechen
        </button>
        <button id="gpm-original" style="
          padding:9px 20px;border:1px solid #dadce0;border-radius:6px;
          background:#fff;color:#1a73e8;font-size:14px;cursor:pointer">
          Original anhängen
        </button>
        <button id="gpm-confirm" style="
          padding:9px 20px;border:none;border-radius:6px;
          background:#1a73e8;color:#fff;font-size:14px;cursor:pointer;font-weight:500">
          Komprimiert anhängen
        </button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    let compressedFiles = null;
    let previewRunning = false;

    const qualityInput = dialog.querySelector('#gpm-quality');
    const dimInput = dialog.querySelector('#gpm-maxdim');
    const qLabel = dialog.querySelector('#gpm-q-label');
    const dimLabel = dialog.querySelector('#gpm-dim-label');
    const note = dialog.querySelector('#gpm-preview-note');

    async function updatePreview() {
      if (previewRunning) return;
      previewRunning = true;
      note.textContent = 'Berechne Vorschau…';
      compressedFiles = null;

      const s = {
        quality: parseInt(qualityInput.value, 10) / 100,
        maxDimension: parseInt(dimInput.value, 10),
        format: settings.format,
      };

      try {
        const results = await Promise.all(imageFiles.map(f => compressImage(f, s)));
        compressedFiles = results;
        let saved = 0;
        results.forEach((r, i) => {
          const orig = imageFiles[i].size;
          const comp = r.size;
          saved += orig - comp;
          dialog.querySelector(`#gpm-size-${i}`).textContent = formatSize(comp);
          dialog.querySelector(`#gpm-arrow-${i}`).style.color = comp < orig ? '#34a853' : '#ea4335';
        });
        const totalOrig = imageFiles.reduce((a, f) => a + f.size, 0);
        const pct = Math.round((saved / totalOrig) * 100);
        note.textContent = saved > 0
          ? `Einsparung: ${formatSize(saved)} (${pct}% kleiner)`
          : 'Keine weitere Komprimierung möglich.';
      } catch (e) {
        note.textContent = 'Vorschau fehlgeschlagen: ' + e.message;
      }
      previewRunning = false;
    }

    let debounceTimer;
    function debounced() {
      qLabel.textContent = qualityInput.value + '%';
      dimLabel.textContent = dimInput.value + 'px';
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updatePreview, 400);
    }

    qualityInput.addEventListener('input', debounced);
    dimInput.addEventListener('input', debounced);

    dialog.querySelector('#gpm-cancel').addEventListener('click', () => overlay.remove());

    dialog.querySelector('#gpm-original').addEventListener('click', () => {
      overlay.remove();
      onConfirm(files);
    });

    dialog.querySelector('#gpm-confirm').addEventListener('click', () => {
      if (!compressedFiles) { note.textContent = 'Bitte warte auf die Vorschau…'; return; }
      // Einstellungen speichern
      chrome.storage.local.set({
        gpm_quality: parseInt(qualityInput.value, 10) / 100,
        gpm_maxDimension: parseInt(dimInput.value, 10),
      });
      overlay.remove();
      onConfirm(compressedFiles);
    });

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    // Initiale Vorschau starten
    updatePreview();
  }

  // --- Datei zu Base64 konvertieren ---
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // --- Dateien via Background-Worker in Gmail injizieren ---
  // Background nutzt chrome.scripting.executeScript (world: MAIN) → umgeht CSP vollständig.
  async function attachFilesToGmail(_composeEl, files) {
    const fileData = await Promise.all(
      files.map(async (f) => ({
        base64: await fileToBase64(f),
        name: f.name,
        type: f.type,
      }))
    );

    chrome.runtime.sendMessage({ action: 'attachFiles', files: fileData }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[GPM] sendMessage Fehler:', chrome.runtime.lastError.message);
      } else if (!response?.ok) {
        console.error('[GPM] Anhängen fehlgeschlagen:', response?.error);
      } else {
        console.log('[GPM] Anhängen erfolgreich');
      }
    });
  }

  // --- Button in Compose-Toolbar injizieren ---
  function injectButton(composeEl) {
    if (composeEl.dataset.gpmInjected) return;
    composeEl.dataset.gpmInjected = '1';

    // Gmail-Toolbar finden (Anhang-Bereich unten im Compose-Fenster)
    const toolbar = composeEl.querySelector('[data-tooltip="Dateien anhängen"]')?.closest('[role="toolbar"]')
      || composeEl.querySelector('.btC')   // Gmail-interne Klasse
      || composeEl.querySelector('[gh="mtb"]');

    if (!toolbar) return;

    const btn = document.createElement('div');
    btn.title = 'Bild komprimiert anhängen (Gmail Pic Minimizer)';
    btn.style.cssText = `
      display:inline-flex; align-items:center; gap:5px;
      margin-left:4px; padding:4px 10px; border-radius:4px;
      cursor:pointer; font-size:12px; color:#444;
      background:#f1f3f4; border:1px solid #dadce0;
      transition:background .15s;
      vertical-align:middle;
    `;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      <span>Bild minimieren</span>
      <span style="font-size:10px;color:#999;margin-left:2px">v1.0.4</span>
    `;

    btn.addEventListener('mouseenter', () => btn.style.background = '#e8eaed');
    btn.addEventListener('mouseleave', () => btn.style.background = '#f1f3f4');

    btn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;

      input.addEventListener('change', () => {
        const files = Array.from(input.files);
        if (!files.length) return;

        showCompressionDialog(files, (result) => {
          attachFilesToGmail(composeEl, result);
        });
      });

      input.click();
    });

    toolbar.appendChild(btn);
  }

  // --- MutationObserver: neue Compose-Fenster erkennen ---
  const observer = new MutationObserver(() => {
    document.querySelectorAll('[role="dialog"], .nH.Hd').forEach(el => {
      // Compose-Fenster erkennen: muss einen content-editable Bereich haben
      if (el.querySelector('[contenteditable="true"]')) {
        injectButton(el);
      }
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
