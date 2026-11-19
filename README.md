# Pagesmith

A small web app for making documents that follow a template: cover, page backgrounds,
text, and lots of attachments (photos, PDFs). You add pages as portrait or landscape,
and the preview on the right is exactly what will print. Nothing breaks when you add pictures
or switch orientation.

No installation is needed. It runs in **Google Chrome** or **Microsoft Edge**.

---

## Template (set up once, share with everyone)

Click **Template**. A template has:

| Part | What it is |
|---|---|
| **Cover** | One full-page picture, used as page 1. One cover per document. |
| **Portrait** background | The default background for portrait pages. |
| **Landscape** background | The default background for landscape pages. |
| **Special backgrounds** | Extra designs, for example a section divider, a certificate frame, or a different header. You choose them per page. |
| **Margins (safe area)** | For each background: where text and pictures may go, so they never cover the banner or the logos. |
| Paper size, page numbers | Long bond / A4 / Letter; page numbers on or off. |

**Export template…** saves everything (cover, backgrounds, margins) in one `.template.json` file.
Send it to your team. They load it with **Template → Import template…**, or with **New → Load a template file**.

## Making a document

1. **Pages** buttons:
   - **Portrait** / **Landscape**: a new page with the default background.
   - **Special…**: a page with one of your special backgrounds.
   - **Cover**: adds the cover as page 1 (only one).
   - **Photos…**: pick many photos at once and choose how many go on each page. The pages are created for you.
   - **PDF…**: each PDF page becomes its own page. Landscape PDF pages stay landscape.
2. Click a page to edit it on the left:
   - **Portrait / Landscape** and **Background**. You can change the background of any page, even in the
     middle of the document. **Use for following pages** applies it to all the pages after this one.
   - **Text**: like Word (bold, headings, lists, alignment, tables). You can paste from Word.
   - **Attachments**: drop photos or PDFs, click to browse, or paste a screenshot (Ctrl+V).
     Pictures fit inside their boxes. ⟳ rotates a photo, ⇲ moves it to its own page.
   - **Layout**: Auto, a fixed grid (1, 2, 3, 4, 6, 9 per page), or **Manual (drag & resize)**.
     In Manual you drag pictures in the preview, and drag a corner handle to resize.
     The shape is kept unless you hold **Shift**. Hold **Alt** to turn off snapping.
     Arrow keys nudge the selected picture. ◀ ▶ send a picture back or bring it to the front.
     **Reset arrangement** puts the pictures back in a neat grid.
   - **Title and caption** for each picture, with **Ctrl+B / Ctrl+I / Ctrl+U** for bold, italic and underline.
     Under **Titles & captions** you choose where each one goes (above the picture, below it, or on top of it
     at the top or bottom), plus the size, bold, italic, alignment and color.
     **Use these settings on all pages** copies them to every page.
3. If a page has too much content, it is marked **⚠** in the list and in red in the preview.
4. **Export PDF**: choose **Save as PDF**, set Margins to **None**, and turn on **Background graphics**.

## Saving
- Your work is saved automatically in this browser on this computer.
- **Save file** downloads a `.pagesmith.json` file with the pictures inside.
  Use **Open** to continue on another computer or to pass the document to a teammate.

## Example: AACCUP
Load `AACCUP Area I – ….template.json` (one file per area), then add the portrait and landscape pages.
Each file holds that area's cover plus the portrait and landscape backgrounds.

---

## Notes
- PDF import uses pdf.js from cdnjs, so it **needs internet**. Everything else works offline.
- Photos are resized to at most 2400 px on the long side, which is enough for printing and keeps files small.
- Files: `index.html`, `css/app.css`, `js/app.js` (all logic), `js/defaults.js` (blank template, paper sizes).
