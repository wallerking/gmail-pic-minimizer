# Gmail Pic Minimizer – Entwicklungsnotizen

## Was ist das?

Chrome Extension (Manifest V3) die einen **"Bild minimieren"-Button** in Gmails Compose-Toolbar einfügt.  
Bilder werden direkt im Browser komprimiert (Canvas API) bevor sie als Anhang hochgeladen werden.

## Installation (Entwicklermodus)

1. `chrome://extensions/` öffnen
2. **Entwicklermodus** einschalten (oben rechts)
3. **"Entpackte Erweiterung laden"** → diesen Ordner wählen
4. Gmail öffnen und neues Mail verfassen

## Auf anderen PCs nutzen

- **Einfachste Methode:** Ordner in Google Drive / OneDrive legen, auf jedem PC als entpackte Extension laden
- **Komfortabel:** Im Chrome Web Store veröffentlichen (einmalig 5$ Entwickler-Gebühr, kann unlisted bleiben)

## Architektur

```
manifest.json      – MV3, Permissions: storage + scripting
content.js         – MutationObserver erkennt Compose-Fenster, injiziert Button,
                     Komprimierung via Canvas API, Dateien als Base64 an Background senden
background.js      – Service Worker: empfängt Base64-Dateien, injiziert per
                     chrome.scripting.executeScript(world:'MAIN') in Gmail-Page-Context
page_script.js     – (Fallback, aktuell nicht aktiv genutzt)
popup.html/js      – Einstellungen: Qualität, Max-Auflösung, Format (chrome.storage.local)
icons/             – Extension-Icons (16, 48, 128px)
```

## Wichtige technische Erkenntnisse

### Problem 1: Content Script Sandbox
Content Scripts laufen in einer isolierten Sandbox. `DataTransfer`-Objekte die dort erstellt werden sind für Gmails JavaScript unsichtbar. Gmails CSP blockiert zusätzlich `<script src="chrome-extension://...">` Tags.

**Lösung:** `chrome.scripting.executeScript({ world: 'MAIN' })` vom Background Service Worker – läuft direkt im Page-Context, umgeht sowohl Sandbox als auch CSP.

### Problem 2: Mehrere Dateien
Gmail verarbeitet eine große FileList in einem einzelnen `change`-Event nicht vollständig (z.B. von 4 Dateien kommen nur 3 an).

**Lösung:** Jede Datei einzeln mit **300ms Delay** per separatem `change`-Event anhängen.

### Datenfluss
```
Nutzer wählt Bilder (unser file-input)
  → Canvas-Komprimierung (content.js)
  → Base64-Konvertierung (content.js)
  → chrome.runtime.sendMessage → background.js
  → chrome.scripting.executeScript(world:'MAIN')
  → Base64 → File-Objekt → DataTransfer
  → input.files überschreiben + change-Event (einzeln, 300ms Delay)
  → Gmail hängt Dateien an
```

## Einstellungen

| Setting | Default | Bereich |
|---|---|---|
| Qualität | 80% | 10–100% |
| Max. Auflösung | 1920px | 480–4096px |
| Format | JPEG | JPEG / PNG / WebP |

Einstellungen werden in `chrome.storage.local` gespeichert und sind auch im Extension-Popup konfigurierbar.

## Firefox-Port

Zwei Änderungen in `manifest.json` gegenüber Chrome:

```json
// 1. background.service_worker → background.scripts (Firefox unterstützt service_worker noch nicht)
"background": { "scripts": ["background.js"] }

// 2. Gecko-ID hinzufügen
"browser_specific_settings": { "gecko": { "id": "gmail-pic-minimizer@local" } }
```

Installation in Firefox: `about:debugging` → "Temporäres Add-on laden" → `manifest.json` wählen.

Der restliche Code (content.js, background.js, popup) ist 100% kompatibel.

## Version

Aktuelle Version: **1.0.4**  
Versionsnummer ist im Button (`v1.0.4`) und im Komprimierungs-Dialog sichtbar.
