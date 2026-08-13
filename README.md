# Visual Library — web edition

A static, self-contained website for the Visual Library: 84 animated HTML
templates, browsable, searchable, and previewable in the browser.

It is a port of the **Visual Library** page from the Course Pipeline 2.0 Course
Studio app (`Tools/review-app/app/visual-library`) — same layout, same
neumorphic theme, same interactions — rebuilt as plain HTML/CSS/JS so it can be
pushed to GitHub and served by Netlify with no server and no build step.

**The original library is never modified.** Everything here lives inside
`Visual Library/webapp/`; the build reads `../INDEX.json` and the category
folders and only ever writes into this folder.

---

## What's in the box

| Path | What it is |
|---|---|
| `index.html` | The whole page. No framework, no bundler. |
| `assets/styles.css` | The studio's neo-tactile theme as CSS custom properties, light + dark. |
| `assets/app.js` | Filtering, category sections, the preview dialog, theme, deep links. |
| `data/library.json` | Static twin of the studio's `/api/visual-library` response. |
| `library/<category>/<id>/` | `template.html`, `preview.png`, and a generated `thumb.webp`. |
| `_build/build.py` | Regenerates `data/` and `library/` from the library above. |
| `netlify.toml` | Publish directory + cache headers. |

## Features

- **Category sections** — collapsible, first one open by default, with per-category counts.
- **Search** — matches ID, name, category, and tags. Press <kbd>/</kbd> to focus it.
- **Tag filter** — click any tag chip on a card; clear it from the chip under the title.
- **Preview dialog** — full-screen, in three modes:
  - *Animated* — plays the GSAP timeline.
  - *Final frame* — loads the template with `?snapshot=1` so it jumps to the end state.
  - *preview.png* — the rendered still.
- **Copy `#ID`** — puts `#INF-2P-001` on the clipboard for pipeline references.
- **Deep links** — `…/#INF-2P-001` opens that template directly, so the copied ID
  doubles as a shareable URL fragment. Back closes the dialog.
- **Light / dark** — toggle in the top bar, remembered in `localStorage`.
- **Responsive** — three-up on desktop, one-up on a phone.

Templates render onto a fixed `1920×1080` canvas and do not scale themselves, so
the preview iframe is laid out at the canvas size and `transform: scale()`d to
fit the stage. That keeps every template pixel-exact and needs no edits to the
template files.

---

## Rebuild after adding templates

Add the template to the library the normal way (so `INDEX.json` and the entry
folder are updated), then:

```bash
python webapp/_build/build.py
```

It copies `template.html` + `preview.png` for every entry in `INDEX.json`,
regenerates the 800px WebP thumbnails, rewrites `data/library.json`, and prunes
entries that are no longer in the index. Re-runs are incremental — unchanged
files are skipped. Requires Pillow (`pip install Pillow`).

Commit the changed files under `data/` and `library/` and push; Netlify redeploys.

---

## Preview it locally

```bash
python -m http.server 8123 --directory webapp
```

Then open <http://127.0.0.1:8123>. Serve it over HTTP rather than opening
`index.html` from disk — browsers block `fetch()` on `file://` URLs, so the
index would fail to load.

---

## Deploy: GitHub → Netlify

### 1. Push this folder to GitHub

The simplest setup is to make **this folder** the repository root, so the site
files sit at the top level and Netlify needs no base directory.

```bash
cd "webapp"
git init
git add .
git commit -m "Visual Library web edition"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

The repo is about 31 MB — comfortably inside GitHub's limits. `preview.png`
files are the bulk of it; the grid only ever loads the 1.7 MB of thumbnails.

> Prefer to commit the whole `Visual Library` folder instead? That works too —
> just set Netlify's **Base directory** to `webapp` in step 2.

### 2. Connect it to Netlify

1. Netlify → **Add new site** → **Import an existing project** → **GitHub**.
2. Authorise Netlify and pick the repository.
3. Build settings — `netlify.toml` already declares these, so the defaults
   should be correct. Confirm they read:
   - **Base directory** — empty (or `webapp` if you committed the parent folder)
   - **Build command** — empty
   - **Publish directory** — `.` (or `webapp`)
4. **Deploy site**.

The site goes live at `https://<name>.netlify.app`. Rename it under
**Site configuration → Site details**, or attach a custom domain under
**Domain management**. Every push to `main` redeploys automatically.

### Drag-and-drop alternative

No Git at all: open <https://app.netlify.com/drop> and drag the `webapp` folder
onto the page. Fine for a one-off, but you lose automatic redeploys — a later
`build.py` run means dragging the folder again.

### GitHub Pages

Also works, since the site is fully static and uses only relative paths. Push to
a repo, then **Settings → Pages → Deploy from a branch**. The included
`.nojekyll` stops Jekyll from swallowing the `_build` folder.

---

## Notes

- **Templates load GSAP and Google Fonts from a CDN.** They render fine offline
  from cache but need a network connection on first view.
- **Copying needs a secure context.** `navigator.clipboard` only works over
  HTTPS or from `localhost`; Netlify serves HTTPS, so this is only a constraint
  for local testing over a plain-HTTP LAN address, where the site falls back to
  the older selection-based copy.
- **The site is public once deployed.** Every template, preview, and ID in this
  folder is served to anyone with the URL. Netlify's password protection or
  access control is under **Site configuration → Access & security** if the
  library should not be world-readable.
