# Changelog: Spotify Lyric Card Generator upgrades

## Files
- `spotifylyric.html` (updated, complete)
- `manifest.json`, `sw.js`
- `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`

Keep all of them together in one folder, with the icons in `icons/`. The service worker only works over https:// or http://localhost, not file://.

## 1. Lyrics source (LRCLIB fallback)
- `fetchLyrics(artist, title, duration, stale)` now resolves `{ blocks, source }`. Order: lyrics.ovh, then LRCLIB `/get` (up to 4 artist/title variants, with `duration` when iTunes supplied it), then LRCLIB `/search` (`track_name`+`artist_name`, then `q=`). `NOT_FOUND` stays the last resort.
- Variants come from `cleanTitle()` plus `stripFeat()` (with and without "feat." text; artist falls back to the first credited artist).
- `plainLyrics` preferred. `syncedLyrics` has `[mm:ss.xx]`, `<mm:ss.xx>` and `[ar:..]` tags stripped (`stripLrc`).
- "Source: lyrics.ovh / LRCLIB" note under the picker subtitle (`#lmSrc`).
- `lm.token` protection and `MAX_LINES` untouched; the fetch chain also stops early (`stale()`) if the modal was closed.
- `fetchJson(url, timeout)` takes an optional timeout (lyrics calls use 6 s).
- New: iTunes results carry `duration`; `state.songMeta` remembers it for the manual "Select Lyrics" button.

## 2. Auto colour from cover
- `extractCoverColors()`: 32x32 sample, 3-bit-per-channel buckets, skips near-white, near-black and desaturated pixels, picks up to 5 distinct colours and normalises them to a vivid saturation/lightness.
- Applied through `setColor()` on every cover load (iTunes, Spotify link, cover URL). Tainted canvas or no vivid colour: nothing changes, silently.
- `#autoColor` checkbox in Appearance (default ON). Picking a swatch, the custom colour input or a cover swatch switches it off. Persisted (`autoColor`), and saved in looks and share links (`ac`).
- A cover loaded from a `#look=` link does not recolour the card, so the shared colour wins.
- `#coverPalette`: the extracted colours as extra swatches.
- The lyric picker re-themes itself if auto colour lands while it is open.

## 3. Share + PWA
- `#shareBtn` in the export dialog: `navigator.share({files})` when `canShare` allows, otherwise a normal download. Hidden where file sharing is unsupported. If the share sheet fails to open (for example Safari losing the click permission after rendering), it downloads instead. Cancelling is silent.
- `manifest.json` (192, 512, maskable 512), `sw.js`, real PNG icons, `<link rel="manifest">`, apple-touch-icon.
- `sw.js`: app shell is cache-first with a background refresh; Google Fonts CSS and files are cache-first. Nothing else is intercepted, so iTunes, Spotify, lyrics.ovh, LRCLIB, cover images and Spotify Codes are network-only.
- Registration is relative (`sw.js`), only on http(s), and every failure is swallowed.
- "Install app" button in the header (`.install`), shown only when `beforeinstallprompt` fires and the app is not already standalone. iOS has no such event: use Share > Add to Home Screen.
- Offline hints: search, Spotify link and lyrics show an offline-specific message; `offline`/`online` events toast.

## 4. Presets and batch zip
- New `tall` layout (720 x 1558, same format as the others) plus a fifth Style button and keyboard shortcut `5`. This is the only way to hit 1170 x 2532 exactly.
- `EXPORT_PRESETS` in the export dialog (`#presetGrid`): IG Post (portrait), Story/Reel/TikTok (story), Square, X/Twitter (wide), Wallpaper phone (tall), Wallpaper desktop (wide). A preset switches the layout and sets the exact pixel size (fractional scale). The 1x/2x picker or a layout change clears it.
- `renderFlatCanvas(layout, dims, fmt)` paints any layout offscreen; the layout globals are swapped only for the synchronous paint, then restored, so the preview and the user's layout never change.
- `#zipBtn` "Download all layouts (.zip)": store-only `makeZip()` with CRC-32, progress in the button and in `#exportStatus` (aria-live). Uses the 1x/2x size, or each layout's own social size when a preset is active.
- Filenames: existing slug style plus layout, e.g. `song_artist_story.png`, `song_artist_all-layouts.zip`. Note: separators are underscores as before, not hyphens. 3D keeps `_3d`.
- The export dialog stays open during the zip (`data-keep-open`) and closes when it finishes.

## 5. WebP
- Third format button `data-fmt="webp"` (labels now PNG · alpha / JPG · solid / WebP · alpha). Quality 0.92, alpha supported (Transparent Background toggle applies as for PNG).
- `encodeCanvas()` detects a silent PNG fallback via `blob.type`, saves/zips PNG instead and toasts. Works for flat, zip and share. Clipboard stays PNG ("Copied to clipboard (as PNG)" for non-PNG formats). 3D stays PNG.
- `fmt` persisted (`png | jpg | webp`).

## New state keys / IDs
- `state.autoColor`, `state.preset`, `state.songMeta`; localStorage `autoColor`; look/share key `ac`.
- IDs: `autoColor`, `coverPalette`, `shareBtn`, `zipBtn`, `presetGrid`, `presetHint`, `exportStatus`, `lmSrc`. Layout key `tall`. Format key `webp`.

## Caveats / needs your testing
- Tested headless in Chromium: zip validity and sizes, WebP alpha, LRCLIB fallback, auto colour, persistence, service worker registration. Not tested on real devices.
- Share with files: Chrome/Edge on Android and Windows, Safari on iOS/macOS. Firefox desktop has no file share (button hidden). Safari may reject the share after the async render; the code then downloads instead.
- WebP encoding: Chromium and Firefox yes; older Safari returns PNG (handled with a toast).
- Cover images from hosts without CORS can't load at all (existing behaviour), so auto colour cannot run for them.
- Service worker: after the first load the shell updates on the next visit. Bump `VERSION` in `sw.js` when you ship changes.
- lyrics.ovh is slow and often down, so the lyric picker can wait up to about 6 s before LRCLIB is tried.
- LRCLIB `/search` takes the closest-duration hit without verifying the artist, so rare mismatches are possible.

## Manual test checklist
1. Search a popular song, pick a result: the card colour matches the cover, the "From the cover" swatches appear, and the lyric picker shows "Source: …".
2. Pick a swatch: Auto colour unticks. Tick it again: the cover colour returns.
3. Load a song lyrics.ovh lacks: the picker shows "Source: LRCLIB" with lines. Try one nobody has: you get the not-found message.
4. Export > Format > WebP, Transparent on: the downloaded `.webp` has transparent corners. In a browser without WebP: a PNG is saved and a toast explains.
5. Export > each preset: layout switches and the file is exactly the preset size. Use the 1x/2x picker afterwards: the preset deselects.
6. Download all layouts (.zip): progress shows, 5 files with layout names open correctly, your layout is unchanged afterwards.
7. Copy to Clipboard with WebP selected: pastes as PNG. Download 3D: PNG.
8. Share (mobile): the share sheet opens with the image; cancelling does nothing.
9. Serve over https or localhost: the Install button appears, installs, and the app opens offline. Search then says you're offline while editing and export still work.
10. Open the file from file:// : no errors, no service worker, everything else works.
11. Regression: undo/redo, saved looks, "Copy link" and opening the link (colour kept), autosave after reload, keyboard shortcuts 1-5.
