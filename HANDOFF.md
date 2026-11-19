# Pagesmith v2: where we are (handoff)

Last updated: 2026-11-19 (Phases 3–5 done). The full plan is in `C:\Users\jimcan\.claude\plans\ato-nya-ni-gamitan-unified-spark.md`.

## Goal
Rewrite Pagesmith in **SvelteKit 3 + daisyUI 5 + TipTap 3**, as a Word-like editor:
- the page itself is the editor, with a ribbon at the top and a thumbnail rail on the left,
- saves to **.docx**, with the Pagesmith data embedded in the file,
- old `.pagesmith.json` and `.template.json` files still open.

Decisions already made with the user:
- Pages are independent (no text flowing between pages). Overflow shows ⚠ and offers "Move overflow to next page".
- Static hosting only, no SSR (it works on GitHub Pages and on Vercel).
- Same repo and same URL.

## ⚠ Important
- **Do NOT push yet.** The live site (jimcan92.github.io/pagesmith) still serves the OLD version from `main` (root `index.html`). The old files were moved to `old/` (not committed yet). Pushing now would break the live site. Deploy only at Phase 7, with GitHub Actions.
- The v2 work is committed and pushed to the **`v2` branch** (github.com/jimcan92/pagesmith/tree/v2). `main` = the old, live version. Keep working on `v2`. At Phase 7, merge to `main` and switch Pages to Actions.

## Status by phase
- [x] **Phase 1: Foundations.** Scaffold, model, storage, io modules, and 14 unit tests (`npm test` passes; this includes importing the real Area IV docx).
- [x] **Phase 2: Shell.** TitleBar, Ribbon with tabs, ThumbRail, Canvas, StatusBar, Dialogs and Toasts.
  - It runs in the browser.
  - It loaded the user's existing document from IndexedDB (same DB name `pagesmith`).
- [x] **Phase 3: Direct text editing.** Tested in the browser (2026-11-19): typing, Home tab (style, size, color, B/I/U/S, align, lists), Insert → Table, the Table tab (add/delete rows and columns, merge, shading, equal widths, column drag-resize), Esc / clicking off the page to stop editing, and Move overflow. Fixed along the way:
  - `state_unsafe_mutation` when the editor closed (TipTap's blur fired mid-render) → editor events now update state in a microtask,
  - Move overflow lost the moved text (`structuredClone` on a `$state` proxy threw after the page was already trimmed),
  - table widths were wrong for cells under a rowspan (`cellColumns()` in sanitize.ts, with a test),
  - empty paragraphs had no height on the page (but did in the editor), so text jumped on click and blank lines vanished in print,
  - clicking text now puts the cursor where you clicked; Esc and the grey area around pages stop editing; the Home tab no longer jumps when editing starts.
- [x] **Phase 4: Pictures on the canvas.** Tested in the browser (2026-11-19): dropping files on a page, pasting a screenshot (onto the page, and while typing in its text), grid reorder by drag, drag to another page on the canvas or onto a thumbnail (grid and manual), manual move / corner resize / arrow nudge (Shift = bigger), title & caption typed on the page (Ctrl+B/I/U, Ctrl+Z stays inside), and the Picture tab (layout, fit, earlier/later, rotate, own page, delete, caption styles, Show captions, Use on all pages). Not tested: Insert → Pictures (it opens a file picker, then uses the same code as dropping). Fixed along the way:
  - "Own page" deleted the picture (the `$derived` page went undefined once the selection was cleared),
  - after picking a layout in the ribbon, the arrow keys kept changing the dropdown instead of nudging the picture (pointerdown is preventDefault-ed, so focus never left it),
  - the page jumped under the pointer when the ribbon changed height (now: all tabs fit in 96px at 1024px wide, and the canvas scrolls by any height change),
  - ribbon help text now only takes leftover space and hides when there's too little (`.ribbon-tip`).
- [x] **Phase 5: Layout, Template and Insert.** Tested in the browser (2026-11-19): File → New (all template choices), the Template dialog (cover, portrait/landscape/special backgrounds, margins, Apply adds the cover page), Template tab Export → Import round trip and Set default (survives a reload), the Layout tab (orientation, background, use for following pages, text top/middle/bottom, center on page, paper size, page numbers), Insert → Special / Cover / Photo pages / PDF, and undo/redo. Fixed along the way:
  - Undo (button) while a page's text was open did nothing: the editor wrote its text back over the restored document; undo/redo now close the editor first (`flushSync`), so the typing is its own step,
  - text fields, radios and checkboxes had no border: the daisyUI theme was missing `--border` (and the size/depth variables),
  - landscape pages were labelled "Landscape · Landscape".
- [ ] **Phase 6: Files.** Code is written (`io/docxExport.ts`, `state/files.ts`), NOT tested:
  - Save .docx: each page becomes a Word section, with the template background in the header and text through `docx/html` `htmlToContent`; data is embedded in `customXml` with picture SHA-256 matching,
  - Open .docx: a Pagesmith-made file restores exactly; if Word changed it, the user chooses Word's or Pagesmith's version,
  - Word import dialog, opening legacy .json, Export PDF (print CSS).
  - **Verify with MS Word through COM:** PowerShell `Word.Application` → `Documents.Open` → `ExportAsFixedFormat`, then check page sizes with PyMuPDF.
- [ ] **Phase 7: Polish and release.**
  - README, delete `old/`,
  - `.github/workflows/deploy.yml` (build with `BASE_PATH=/pagesmith`, deploy Pages),
  - switch Pages to Actions: `gh api -X PUT repos/jimcan92/pagesmith/pages -f build_type=workflow`,
  - commit and push.

## How to run
```
cd pagesmith
npm install
npm run dev -- --port 8765      # or the "pagesmith" entry in .claude/launch.json
npm run check                    # svelte-check: must be 0 errors
npm test                         # vitest
npm run build                    # static build → build/
```

## Gotchas found so far
- **SvelteKit 3:**
  - Config lives in `vite.config.ts` (`sveltekit({...})`); there is no `svelte.config.js`.
  - `$lib` was removed. Use `#lib/...` (package.json `"imports": {"#lib/*": "./src/lib/*"}`) **with file extensions** in imports: `#lib/state/doc.svelte.ts`, `#lib/components/X.svelte`.
- **Svelte:** variable names cannot start with `$` (for example ProseMirror's `$from`; use `const at = selection.$from`).
- **daisyUI class names clash with ours:** `.status`, `.label`, `.tab`, `.menu`, `.card` and others. Use unique names (we hit `.status` → renamed `.statusbar`, and `.label` → renamed `.glabel`).
- **TypeScript:** use `typescript@^6` (svelte-check does not support 7 yet).
- **pdf.js 6:** destroy through the loading task (`task.destroy()`), not `pdf.destroy()`.
- **TipTap events → Svelte state:** never write `$state` directly in TipTap callbacks (onTransaction/onFocus can fire during a render); defer with `queueMicrotask`.
- **`$derived` from the selection:** in ribbon handlers, copy `pg` etc. into a local before changing `doc.selectedAtt`; they go `undefined` right after.
- **Ribbon groups:** a `<br>` does nothing inside the flex groups; use explicit `flex-col` rows. Keep every tab ≤ 2 rows at 1024px.
- **daisyUI theme:** a custom `@plugin 'daisyui/theme'` must set `--border`, `--size-field`, `--size-selector`, `--depth`, `--noise`, or fields render without borders.
- **Testing file pickers in the browser pane:** override `HTMLInputElement.prototype.click` for `type=file` to set `files` from a `DataTransfer` and fire `onchange`; override `HTMLAnchorElement.prototype.click` to capture downloads. Real files can be made with a canvas (images) or a hand-written PDF string.
- **Cloning state:** `structuredClone` throws on `$state` proxies. Use `$state.snapshot()` in .svelte/.svelte.ts files, or a JSON copy in plain .ts.
- **Tables:** they use TipTap's `colwidth` (px) on cells plus a matching `<colgroup>`. `sanitize(html, widthPx)` converts Word % widths into that format.

## Key files
- `src/lib/state/doc.svelte.ts`: the document, selection, undo/redo and autosave.
- `src/lib/state/actions.ts`: adding files, PDF, photo pages, Word import, move overflow.
- `src/lib/state/files.ts`: open, save .docx, templates, export PDF.
- `src/lib/state/editor.svelte.ts`: TipTap setup and ribbon commands.
- `src/lib/components/page/*`: the Page (and its PageText and Pictures).
- `src/lib/io/*`: docx import/export, fit (overflow), legacy loaders, pdf, images.
