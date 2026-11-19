# Pagesmith

A web app for making documents that follow a template: cover, page backgrounds, text, and lots of
pictures (photos, PDF pages, Word documents). It works like Word: you type and arrange things right on
the page, with a ribbon at the top and the pages listed on the left. Nothing breaks when you add
pictures or switch a page between portrait and landscape.

No installation is needed. It runs in **Google Chrome** or **Microsoft Edge**:
**https://jimcan92.github.io/pagesmith/**

---

## Template (set up once, share with everyone)

**Template → Edit template**. A template has:

| Part | What it is |
|---|---|
| **Cover** | One full-page picture, used as page 1. One cover per document. |
| **Portrait** background | The default background for portrait pages. |
| **Landscape** background | The default background for landscape pages. |
| **Special backgrounds** | Extra designs, for example a section divider, a certificate frame, or a different header. You choose them per page. |
| **Margins (safe area)** | For each background: where text and pictures may go, so they never cover the banner or the logos. |

**Export** saves the template (cover, backgrounds, margins) in one `.template.json` file. Send it to your team.
They load it with **Template → Import**, or with **File → New → Load a template file**.
**Set default** makes new documents on this computer start with this template.

## Making a document

### Pages (Insert tab, or + Portrait / + Landscape under the page list)
- **Portrait** / **Landscape**: a new page with the default background.
- **Special**: a page with one of your special backgrounds.
- **Cover**: adds the cover as page 1 (only one).
- **Pictures**: adds pictures to the current page.
- **Photo pages**: pick many photos at once and choose how many go on each page; the pages are made for you.
- **PDF**: each PDF page becomes its own page. Landscape PDF pages stay landscape.
- **Word**: brings in a Word document (.docx). Everything stays editable: pages follow Word's pages and
  portrait/landscape sections, text keeps its formatting, tables keep column widths, merged cells and
  header rows, and pictures become pictures on the page. Word's backgrounds, headers and footers are
  left out, because your template provides them. Pages that are too full are split, and long tables
  continue on the next page.
- **Table**: inserts a table into the page text.

Right-click a page in the list for more (duplicate, delete, move overflow…). Drag pages in the list to reorder them.

### Text
Click the text on a page (or "Click to type…") and type. The **Home** tab has the paragraph style
(Normal, Heading 1–3), size, bold, italic, underline, strikethrough, color, alignment, bullets and numbering.
You can paste from Word or Google Docs; tables keep their column widths.
Press **Esc**, or click outside the text, when you are done.

Inside a table, the **Table** tab appears: add or delete rows and columns, merge or split cells,
header row, cell shading, **Equal widths**, and **Delete table**. Drag a column border to change its width.

### Pictures
- Drop photos or PDFs on a page, or paste a screenshot (**Ctrl+V**).
- Click a picture to select it; the **Picture** tab appears. Type its **title** and **caption** right on the
  page (**Ctrl+B / Ctrl+I / Ctrl+U** work there).
- **Arrange**: Auto, a fixed grid (1, 2, 3, 4, 6, 9 per page), or **Manual (drag & resize)**.
  In Manual, drag a picture to move it and drag a corner to resize it (hold **Shift** to change its shape,
  **Alt** to turn off snapping). The arrow keys nudge it (**Shift** for bigger steps).
- **Drag a picture to another page**, or onto a page in the list on the left, to move it there.
  In a grid, drop it on another picture to change their order.
- ◀ ▶ move a picture earlier or later, **Rotate** turns it 90°, **Own page** moves it to a new page,
  **Delete** (or the Delete key) removes it.
- **Titles & captions** sets where they go (above, below, or on the picture), their size, style, alignment
  and color for this page; **Use on all pages** copies them to every page.

### Layout tab
Orientation and background of the current page (**Use for following pages** applies the background to
the pages after it), where the text sits (**Top / Middle / Bottom**, **Center horizontally**, or
**Center on page** for chapter and divider pages), **Move overflow**, paper size (Long bond, A4, Letter)
and page numbers.

If a page has too much content it is outlined in red and marked **⚠**. **Move overflow** puts what
doesn't fit on a new page after it.

## Saving
- Your work is saved automatically in this browser on this computer.
- **Save** (Ctrl+S) saves a **Word file (.docx)**. It opens in Word with the same pages, backgrounds, text,
  tables and pictures. Pagesmith also keeps its own copy of the document inside the file, so
  **File → Open** brings it back exactly, on any computer.
- If someone changed the file in Word, Open asks which version you want: **Word's version** (with the
  changes made in Word) or **Pagesmith's version** (exactly as Pagesmith last saved it).
- **File → Open** also opens files from the previous Pagesmith (`.pagesmith.json`) and other Word files.

## Export PDF
**Export PDF**, then in the print window choose **Save as PDF**, set Margins to **None**, Scale to
**Default**, and turn on **Background graphics**. Portrait and landscape pages keep their orientation.

## Undo / redo
- **↶ / ↷** in the top bar, or **Ctrl+Z** and **Ctrl+Y** (or Ctrl+Shift+Z).
- Everything can be undone: pages, pictures, layouts, the template, imports, and even **New** or **Open**.
- While typing in a page's text, Ctrl+Z undoes your typing.
- The undo history is kept until you close or reload the page.

## Example: AACCUP
Load `AACCUP Area I – ….template.json` (one file per area) with **Template → Import**, then add the
portrait and landscape pages. Each file holds that area's cover plus the portrait and landscape backgrounds.

---

## For developers
SvelteKit + Svelte 5, daisyUI 5 / Tailwind 4, TipTap 3 for the page text, `docx` + JSZip for Word files,
pdf.js for PDFs. Static site: no server.

```
npm install
npm run dev        # http://localhost:5173
npm run check      # svelte-check (must be 0 errors)
npm test           # vitest
npm run build      # static site in build/
```

Pushing to `main` builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`, with
`BASE_PATH=/pagesmith`). The code is in `src/lib`: `model/` (document types and rules), `io/` (Word,
PDF, pictures, fitting text), `state/` (the open document, undo, files) and `components/` (ribbon, page,
dialogs).
