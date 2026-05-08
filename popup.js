const qualityInput = document.getElementById('quality');
const dimInput = document.getElementById('maxDimension');
const formatSelect = document.getElementById('format');
const qLabel = document.getElementById('q-label');
const dimLabel = document.getElementById('dim-label');
const saveBtn = document.getElementById('save');
const savedNote = document.getElementById('saved-note');

// Einstellungen laden (aus localStorage der Gmail-Seite via chrome.scripting)
// Da Popup keinen Zugriff auf localStorage der Content-Page hat,
// nutzen wir chrome.storage.local als gemeinsamen Speicher.
chrome.storage.local.get(['gpm_quality', 'gpm_maxDimension', 'gpm_format'], (data) => {
  const q = data.gpm_quality ?? 0.8;
  const d = data.gpm_maxDimension ?? 1920;
  const f = data.gpm_format ?? 'image/jpeg';

  qualityInput.value = Math.round(q * 100);
  dimInput.value = d;
  formatSelect.value = f;
  qLabel.textContent = Math.round(q * 100) + '%';
  dimLabel.textContent = d + ' px';
});

qualityInput.addEventListener('input', () => {
  qLabel.textContent = qualityInput.value + '%';
});

dimInput.addEventListener('input', () => {
  dimLabel.textContent = dimInput.value + ' px';
});

saveBtn.addEventListener('click', () => {
  chrome.storage.local.set({
    gpm_quality: parseInt(qualityInput.value, 10) / 100,
    gpm_maxDimension: parseInt(dimInput.value, 10),
    gpm_format: formatSelect.value,
  }, () => {
    savedNote.textContent = 'Gespeichert ✓';
    setTimeout(() => { savedNote.textContent = ''; }, 2000);
  });
});
