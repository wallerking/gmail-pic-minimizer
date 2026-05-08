chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'attachFiles') return false;

  chrome.scripting.executeScript({
    target: { tabId: sender.tab.id },
    world: 'MAIN',
    args: [message.files],
    func: async (files) => {
      // Base64 → File-Objekte rekonstruieren
      function decodeFile({ base64, name, type }) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new File([bytes], name, { type });
      }

      const fileObjects = files.map(decodeFile);
      console.log('[GPM] Dateien zum Anhängen:', fileObjects.map(f => f.name));

      // Gmail's file-input finden
      const input = document.querySelector('input[type="file"]');

      if (input) {
        // Jede Datei einzeln mit kurzem Delay anhängen –
        // Gmail's Upload-Handler verarbeitet sonst nur einen Teil einer großen FileList.
        for (const file of fileObjects) {
          const dt = new DataTransfer();
          dt.items.add(file);
          Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
          input.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('[GPM] Angehängt:', file.name);
          await new Promise(r => setTimeout(r, 300));
        }
        return;
      }

      // Fallback: alle auf einmal per Drop-Event
      console.warn('[GPM] Kein file-input gefunden, versuche Drop-Event');
      const dt = new DataTransfer();
      fileObjects.forEach(f => dt.items.add(f));
      const target =
        document.querySelector('.aDh') ||
        document.querySelector('[contenteditable="true"]') ||
        document.querySelector('[role="dialog"]') ||
        document.body;

      for (const evtType of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(evtType, {
          bubbles: true, cancelable: true, dataTransfer: dt,
        }));
      }
    },
  })
  .then(() => sendResponse({ ok: true }))
  .catch((err) => {
    console.error('[GPM background] executeScript Fehler:', err.message);
    sendResponse({ ok: false, error: err.message });
  });

  return true;
});
