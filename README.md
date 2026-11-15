# OWON Booth

An online photobooth: pick a format, choose a filter, take photos with a countdown,
choose your favourites, then decorate with frame colours, theme frames, stickers,
doodle pens and a message. Download the image or save it to "My Roll" (stored in
the visitor's own browser using IndexedDB, nothing is uploaded anywhere).

## Put it online with GitHub Pages
1. Create a new repository on GitHub (e.g. `owon-booth`).
2. Upload everything in this folder (index.html, style.css, app.js, config.js, assets/) to the repository root.
3. Go to **Settings → Pages**, set **Source: Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After a minute your booth is live at `https://YOUR-USERNAME.github.io/owon-booth/`.

The camera needs HTTPS, which GitHub Pages gives you automatically.
To test on your own computer, run `python3 -m http.server` in this folder and open http://localhost:8000
(opening index.html by double-clicking won't allow the camera).

## Adding your own artwork (only edit config.js)
| What | Size | Where | Add it in config.js under |
|---|---|---|---|
| Theme frame, Strip | 1200 x 3600 PNG | assets/frames/THEME/strip4.png | `themePacks` |
| Theme frame, Grid | 2250 x 2000 PNG | assets/frames/THEME/grid4.png | `themePacks` |
| Theme frame, Duo | 1800 x 2900 PNG | assets/frames/THEME/duo2.png | `themePacks` |
| Theme frame, Single | 2200 x 1950 PNG | assets/frames/THEME/single1.png | `themePacks` |
| Sticker | 600 x 600 PNG | assets/stickers/PACK/name.png | `stickerPacks` |
| Stamp brush | 128 x 128 white PNG | assets/brushes/name.png | `pens.brushes` |

Theme frames are overlays: photos show through the transparent parts. Photo boxes and
the message area are marked on the design templates. Export PNG-24, sRGB, transparent.

Frame colours, pen colours/sizes, filters, countdown length and the message font
are all in config.js too. The placeholder artwork in assets/ is just there to show
how it works; replace or delete it.
