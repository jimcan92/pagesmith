# Pagesmith v2: where we are (handoff)

Last updated: 2026-11-19. The full plan is in `C:\Users\jimcan\.claude\plans\ato-nya-ni-gamitan-unified-spark.md`.

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
- [~] **Phase 3: Direct text editing.** The TipTap editor mounts when you click page text, and the Home tab enables. The Word table kept its column widths.
  - **Still to test:** typing and ribbon formatting (bold/underline/size/color/lists), the Table tab (add/delete rows, merge, equal widths, column drag-resize), Insert → Table dialog, and Move overflow.
- [ ] **Phase 4: Pictures on the canvas.** Code is written (`Pictures.svelte`) but not tested:
  - drag to another page or onto a thumbnail,
  - grid reorder,
  - manual handles and arrow-key nudge,
  - inline title/caption editing,
  - the Picture tab,
  - dropping files on a page, pasting a screenshot.
- [ ] **Phase 5: Layout, Template and Insert.** Code is written, not tested:
  - LayoutTab, TemplateTab, TemplateDialog,
  - Special pages, Cover, Photo pages, PDF,
  - undo/redo.
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
npm run dev -- --port 8765      # or the "pagesmith" entry in ../.claude/launch.json
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
- **Tables:** they use TipTap's `colwidth` (px) on cells plus a matching `<colgroup>`. `sanitize(html, widthPx)` converts Word % widths into that format.

## Key files
- `src/lib/state/doc.svelte.ts`: the document, selection, undo/redo and autosave.
- `src/lib/state/actions.ts`: adding files, PDF, photo pages, Word import, move overflow.
- `src/lib/state/files.ts`: open, save .docx, templates, export PDF.
- `src/lib/state/editor.svelte.ts`: TipTap setup and ribbon commands.
- `src/lib/components/page/*`: the Page (and its PageText and Pictures).
- `src/lib/io/*`: docx import/export, fit (overflow), legacy loaders, pdf, images.
