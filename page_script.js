// Läuft im Page-Context (nicht im Content-Script-Sandbox).
// Empfängt komprimierte Dateien via postMessage und hängt sie in Gmail ein.
(function () {
  window.addEventListener('message', async function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== 'GPM_ATTACH_FILES') return;

    // File-Objekte aus den übertragenen ArrayBuffern rekonstruieren
    const dt = new DataTransfer();
    for (const { buffer, name, type } of event.data.files) {
      const blob = new Blob([buffer], { type });
      dt.items.add(new File([blob], name, { type }));
    }

    // --- Methode 1: Gmail's file-input überschreiben ---
    // Gmail hält einen permanenten, versteckten <input type="file"> im DOM.
    // Da wir im Page-Context laufen, funktioniert Object.defineProperty hier.
    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    for (const input of inputs) {
      try {
        Object.defineProperty(input, 'files', {
          value: dt.files,
          configurable: true,
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      } catch (_) { /* weiter zu Methode 2 */ }
    }

    // --- Methode 2: Drop-Event auf dem Compose-Bereich ---
    // Da der DataTransfer hier im Page-Context erstellt wurde,
    // ist er für Gmails Event-Handler zugänglich.
    const dropTargets = [
      document.querySelector('.aDh'),                        // Compose-Body (Gmail-intern)
      document.querySelector('[contenteditable="true"]'),
      document.querySelector('[role="dialog"]'),
      document.body,
    ];
    const target = dropTargets.find(Boolean);
    if (target) {
      for (const evtType of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(
          new DragEvent(evtType, { bubbles: true, cancelable: true, dataTransfer: dt })
        );
      }
    }
  });
})();
