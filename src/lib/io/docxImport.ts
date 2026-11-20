// @ts-nocheck -- ported from the previous version (old/js/docx-import.js); DOM/XML heavy, typed at the boundary.
/*
 * Word (.docx) → Pagesmith pages.
 *   - orientation comes from each Word section,
 *   - pages break where Word breaks them (page breaks, section breaks, Word's own rendered page
 *     breaks) and, where Word saved none, where the text would run past the bottom (estimated),
 *   - text keeps bold / italic / underline / color / size / alignment / headings / lists,
 *   - tables keep column widths (AutoFit tables: from their content), merged cells, shading, header rows,
 *   - pictures become attachments; full-width backgrounds, logo strips and tiny icons are skipped.
 * Headers and footers are ignored (the Pagesmith template provides them).
 */
import JSZip from 'jszip';

export interface DocxPicture { path: string; type: string; wIn: number; hIn: number; flow: boolean; link?: string }
export interface DocxPage { index: number; landscape: boolean; html: string; pics: DocxPicture[]; zeroMargins: boolean }
export interface DocxResult {
  pages: DocxPage[];
  pictures: number;
  skippedBackgrounds: number;
  skippedUnsupported: number;
  loadImage: (img: DocxPicture) => Promise<Blob>;
}

const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  v: 'urn:schemas-microsoft-com:vml',
  wps: 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape'
};
const EMU = 914400, TWIP = 1440;
const IMG_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isW = (el, name) => el && el.nodeType === 1 && el.namespaceURI === NS.w && el.localName === name;
const kids = (el, name) => (el ? Array.from(el.children).filter((c) => isW(c, name)) : []);
const kid = (el, name) => kids(el, name)[0] || null;
const wAttr = (el, name) => (el ? el.getAttributeNS(NS.w, name) ?? el.getAttribute('w:' + name) : null);
const val = (el) => wAttr(el, 'val');
const on = (el) => !!el && !['0', 'false', 'off', 'none'].includes(String(val(el)).toLowerCase());
const all = (el, ns, name) => Array.from(el.getElementsByTagNameNS(ns, name));

export async function parseDocx(arrayBuffer: ArrayBuffer, onProgress: (p: number) => void = () => {}): Promise<DocxResult> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const read = async (p) => (zip.file(p) ? zip.file(p).async('string') : null);
  const xml = (s) => (s ? new DOMParser().parseFromString(s, 'application/xml') : null);

  const docXml = xml(await read('word/document.xml'));
  if (!docXml) throw new Error('This file has no Word document inside.');
  const rels = {};
  const relDoc = xml(await read('word/_rels/document.xml.rels'));
  if (relDoc) for (const r of Array.from(relDoc.getElementsByTagName('Relationship'))) rels[r.getAttribute('Id')] = r.getAttribute('Target');
  /** The web address of a hyperlink relationship (only real links: http(s), mailto, tel). */
  const linkOf = (rid) => {
    const t = rid && rels[rid];
    return t && /^(https?:|mailto:|tel:)/i.test(t.trim()) ? t.trim() : '';
  };
  /** The address of a HYPERLINK field instruction (links to places inside the document are skipped). */
  const fieldLink = (instr) => {
    const m = String(instr || '').match(/^\s*HYPERLINK\s+"([^"]+)"/i);
    return m && /^(https?:|mailto:|tel:)/i.test(m[1]) ? m[1] : '';
  };
  const styles = xml(await read('word/styles.xml'));
  const numbering = xml(await read('word/numbering.xml'));

  // Only keep the modern version of alternate content (drop the old VML fallbacks).
  all(docXml, NS.mc, 'Fallback').forEach((f) => f.remove());

  /* ---- styles: default font size, paragraph style names */
  let defaultSz = 22;
  let defaultFont = '';
  const styleInfo = {};
  if (styles) {
    const d = styles.getElementsByTagNameNS(NS.w, 'rPrDefault')[0];
    const sz = d && d.getElementsByTagNameNS(NS.w, 'sz')[0];
    if (sz) defaultSz = +val(sz) || 22;
    const df = d && d.getElementsByTagNameNS(NS.w, 'rFonts')[0];
    if (df) defaultFont = wAttr(df, 'ascii') || wAttr(df, 'hAnsi') || '';
    for (const s of all(styles, NS.w, 'style')) {
      const id = wAttr(s, 'styleId');
      const name = (val(kid(s, 'name')) || id || '').toLowerCase();
      const ssz = kid(kid(s, 'rPr'), 'sz');
      styleInfo[id] = { name, sz: ssz ? +val(ssz) : null };
    }
  }
  const headingLevel = (styleId) => {
    const n = (styleInfo[styleId]?.name || String(styleId || '')).toLowerCase().replace(/\s+/g, '');
    if (n === 'title' || n === 'heading1') return 1;
    if (n === 'subtitle' || n === 'heading2') return 2;
    if (/^heading[3-6]$/.test(n)) return 3;
    return 0;
  };

  /* ---- numbering: is a list numbered or bulleted? */
  const numFmt = {};
  if (numbering) {
    const abs = {};
    for (const a of all(numbering, NS.w, 'abstractNum')) {
      const lv = kids(a, 'lvl').reduce((m, l) => { m[wAttr(l, 'ilvl')] = val(kid(l, 'numFmt')); return m; }, {});
      abs[wAttr(a, 'abstractNumId')] = lv;
    }
    for (const n of all(numbering, NS.w, 'num')) numFmt[wAttr(n, 'numId')] = abs[val(kid(n, 'abstractNumId'))] || {};
  }

  /* ---- sections (orientation & page size) */
  const body = docXml.getElementsByTagNameNS(NS.w, 'body')[0];
  let hasHdr = false, hasFtr = false;  // headers/footers carry over to later sections
  const sectionOf = (sectPr) => {
    const sz = kid(sectPr, 'pgSz'), mar = kid(sectPr, 'pgMar');
    const w = +wAttr(sz, 'w') || 12240, h = +wAttr(sz, 'h') || 15840;
    const orient = wAttr(sz, 'orient');
    const m = (k, d) => { const v = wAttr(mar, k); return Math.max(0, v == null || v === '' || isNaN(+v) ? d : +v) / TWIP; };
    const landscape = orient === 'landscape' || w > h;
    if (kids(sectPr, 'headerReference').length) hasHdr = true;
    if (kids(sectPr, 'footerReference').length) hasFtr = true;
    // a header/footer pushes the text further in than the margin when it is taller than the gap
    const top = Math.max(m('top', 1440), hasHdr ? m('header', 720) + 0.3 : 0);
    const bottom = Math.max(m('bottom', 1440), hasFtr ? m('footer', 720) + 0.3 : 0);
    const left = m('left', 1440), right = m('right', 1440);
    return {
      landscape, type: val(kid(sectPr, 'type')) || 'nextPage',
      textW: Math.max(2, w / TWIP - left - right), textH: Math.max(2, h / TWIP - top - bottom),
      zeroMargins: m('top', 1440) + m('bottom', 1440) + left + right < 0.2, pageW: w / TWIP, pageH: h / TWIP
    };
  };
  const blocksTop = Array.from(body.children);
  const sections = [];
  for (const el of blocksTop) {
    const sp = isW(el, 'p') ? kid(kid(el, 'pPr'), 'sectPr') : isW(el, 'sectPr') ? el : null;
    if (sp) sections.push(sectionOf(sp));
  }
  if (!sections.length) sections.push(sectionOf(null));

  /* ---- pictures */
  const images = [];  // { key, rel, path, w, h, skipped? }
  let skippedBg = 0, skippedUnsupported = 0;
  function pictureFromDrawing(container, sec, inLink = '') {
    // one <wp:inline>/<wp:anchor> may hold several pictures (a group)
    const out = [];
    const holders = [...all(container, NS.wp, 'inline'), ...all(container, NS.wp, 'anchor')];
    for (const h of holders) {
      const ext = h.getElementsByTagNameNS(NS.wp, 'extent')[0];
      const wIn = (+(ext?.getAttribute('cx')) || 0) / EMU, hIn = (+(ext?.getAttribute('cy')) || 0) / EMU;
      const anchor = h.localName === 'anchor';
      const wrap = anchor ? ['wrapTopAndBottom', 'wrapSquare', 'wrapTight', 'wrapThrough'].find((n) => h.getElementsByTagNameNS(NS.wp, n).length) : 'inline';
      const blips = all(h, NS.a, 'blip');
      // a link on the picture itself (Insert > Link on a picture in Word), else the hyperlink around it
      const click = all(h, NS.a, 'hlinkClick')[0];
      const link = linkOf(click && click.getAttributeNS(NS.r, 'id')) || inLink;
      // Template parts, not evidence: full-width backgrounds / headers, long thin logo strips, tiny icons.
      const fullWidth = wIn >= sec.pageW * 0.9;
      const strip = wIn >= sec.pageW * 0.6 && wIn / Math.max(0.01, hIn) > 6;
      const tiny = wIn < 0.45 && hIn < 0.45;
      if (fullWidth || strip || tiny) { skippedBg += blips.length; continue; }
      for (const b of blips) {
        const rid = b.getAttributeNS(NS.r, 'embed') || b.getAttributeNS(NS.r, 'link');
        out.push({ rid, link, wIn: wIn / Math.max(1, blips.length > 1 ? Math.sqrt(blips.length) : 1), hIn, flow: wrap === 'inline' || wrap === 'wrapTopAndBottom' || wrap === 'wrapSquare' });
      }
    }
    // old VML pictures
    for (const im of all(container, NS.v, 'imagedata')) {
      const rid = im.getAttributeNS(NS.r, 'id');
      if (rid) out.push({ rid, link: inLink, wIn: 3, hIn: 3, flow: true });
    }
    const res = [];
    for (const p of out) {
      const target = rels[p.rid];
      if (!target) continue;
      const path = target.startsWith('/') ? target.slice(1) : 'word/' + target.replace(/^\.\//, '');
      const extName = (path.split('.').pop() || '').toLowerCase();
      if (!IMG_TYPES[extName]) { skippedUnsupported++; continue; }
      const img = { path, type: IMG_TYPES[extName], wIn: p.wIn, hIn: p.hIn, flow: p.flow, ...(p.link ? { link: p.link } : {}) };
      images.push(img);
      res.push(img);
    }
    return res;
  }

  /* ---- text */
  function runStyle(rPr, pStyleSz) {
    const st = [];
    if (!rPr) return { open: '', close: '', szPt: (pStyleSz || defaultSz) / 2 };
    const b = on(kid(rPr, 'b')), i = on(kid(rPr, 'i'));
    const uEl = kid(rPr, 'u'), u = !!uEl && val(uEl) !== 'none';
    const color = val(kid(rPr, 'color'));
    const szEl = kid(rPr, 'sz');
    const sz = szEl ? +val(szEl) : pStyleSz || defaultSz;
    if (color && color !== 'auto' && /^[0-9a-f]{6}$/i.test(color) && color.toLowerCase() !== '000000') st.push(`color:#${color}`);
    if (sz && Math.abs(sz - defaultSz) >= 2) st.push(`font-size:${sz / 2}pt`);
    const fEl = kid(rPr, 'rFonts');
    const font = fEl ? (wAttr(fEl, 'ascii') || wAttr(fEl, 'hAnsi') || '').replace(/["';<>{}]/g, '') : '';
    if (font && font !== defaultFont) st.push(`font-family:${/\s/.test(font) ? `'${font}'` : font}`);
    let open = '', close = '';
    if (st.length) { open += `<span style="${st.join(';')}">`; close = '</span>' + close; }
    if (b) { open += '<b>'; close = '</b>' + close; }
    if (i) { open += '<i>'; close = '</i>' + close; }
    if (u) { open += '<u>'; close = '</u>' + close; }
    return { open, close, szPt: sz / 2 };
  }

  /** One paragraph → { html, text, pics[], breakBefore, breakAfter, list, height } */
  function paragraph(p, sec, widthIn) {
    const pPr = kid(p, 'pPr');
    const styleId = val(kid(pPr, 'pStyle'));
    const level = headingLevel(styleId);
    const jc = val(kid(pPr, 'jc'));
    const align = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[jc] || '';
    const numPr = kid(pPr, 'numPr');
    const pStyleSz = styleInfo[styleId]?.sz || null;
    // the paragraph mark's own size decides how tall an empty line is
    const markSz = +val(kid(kid(pPr, 'rPr'), 'sz')) || 0;
    let html = '', text = '', maxPt = (markSz || pStyleSz || defaultSz) / 2, brs = 0;
    let breakBefore = on(kid(pPr, 'pageBreakBefore')), breakAfter = false, seenText = false;
    const pics = [];
    const extraBlocks = [];  // text boxes

    let curLink = '';  // the address of the w:hyperlink being walked
    const walkRuns = (el) => {
      for (const c of Array.from(el.children)) {
        if (isW(c, 'r')) run(c);
        else if (isW(c, 'hyperlink')) {
          const before = curLink, startHtml = html.length;
          curLink = linkOf(c.getAttributeNS(NS.r, 'id')) || curLink;
          walkRuns(c);
          // the link's text (its runs keep their own formatting inside)
          if (curLink && curLink !== before && html.length > startHtml) html = html.slice(0, startHtml) + `<a href="${esc(curLink)}">` + html.slice(startHtml) + '</a>';
          curLink = before;
        }
        else if (isW(c, 'fldSimple')) {
          const url = fieldLink(wAttr(c, 'instr'));
          const before = curLink, startHtml = html.length;
          if (url) curLink = url;
          walkRuns(c);
          if (url && html.length > startHtml) html = html.slice(0, startHtml) + `<a href="${esc(url)}">` + html.slice(startHtml) + '</a>';
          curLink = before;
        }
        else if (isW(c, 'ins') || isW(c, 'smartTag') || isW(c, 'customXml')) walkRuns(c);
        else if (isW(c, 'sdt')) walkRuns(kid(c, 'sdtContent') || c);
        else if (c.namespaceURI === NS.mc && c.localName === 'AlternateContent') walkRuns(c.getElementsByTagNameNS(NS.mc, 'Choice')[0] || c);
      }
    };
    // Word's field links: { HYPERLINK "url" } — the text between "separate" and "end" is the link
    const fields = [];  // open fields: { instr, link?, start?, before }
    const run = (r) => {
      const s = runStyle(kid(r, 'rPr'), pStyleSz);
      maxPt = Math.max(maxPt, s.szPt);
      let chunk = '';
      const flush = () => { if (chunk) { html += s.open + chunk + s.close; chunk = ''; } };
      for (const c of Array.from(r.children)) {
        if (isW(c, 'fldChar')) {
          flush();
          const type = wAttr(c, 'fldCharType');
          if (type === 'begin') fields.push({ instr: '', before: curLink });
          else if (type === 'separate' && fields.length) {
            const f = fields[fields.length - 1];
            f.link = fieldLink(f.instr);
            if (f.link) { f.start = html.length; curLink = f.link; }
          } else if (type === 'end' && fields.length) {
            const f = fields.pop();
            if (f.link && html.length > f.start) html = html.slice(0, f.start) + `<a href="${esc(f.link)}">` + html.slice(f.start) + '</a>';
            curLink = f.before;
          }
          continue;
        }
        if (isW(c, 'instrText')) { if (fields.length) fields[fields.length - 1].instr += c.textContent; continue; }
        if (isW(c, 't')) { chunk += esc(c.textContent); text += c.textContent; if (c.textContent.trim()) seenText = true; }
        else if (isW(c, 'tab')) { chunk += '&emsp;'; text += ' '; }
        else if (isW(c, 'br')) {
          // a page break after a picture or text in the same paragraph ends this page
          if (wAttr(c, 'type') === 'page') { if (seenText || html || chunk || pics.length) breakAfter = true; else breakBefore = true; }
          else { chunk += '<br>'; brs++; }
        } else if (isW(c, 'lastRenderedPageBreak')) {
          if (!seenText && !html && !chunk && !pics.length) breakBefore = true;
        } else if (isW(c, 'drawing') || isW(c, 'pict') || (c.namespaceURI === NS.mc && c.localName === 'AlternateContent')) {
          pics.push(...pictureFromDrawing(c, sec, curLink));
          // text boxes inside shapes
          for (const tb of all(c, NS.w, 'txbxContent')) for (const tp of kids(tb, 'p')) extraBlocks.push(paragraph(tp, sec, widthIn));
        }
      }
      if (chunk) html += s.open + chunk + s.close;
    };
    walkRuns(p);

    // height estimate (inches) for pagination
    const sp = kid(pPr, 'spacing');
    const before = (+wAttr(sp, 'before') || 0) / TWIP, after = (+wAttr(sp, 'after') || 0) / TWIP;
    const lineRule = wAttr(sp, 'lineRule'), line = +wAttr(sp, 'line') || 240;
    const lineMul = !lineRule || lineRule === 'auto' ? line / 240 : 1;
    const lineH = lineRule && lineRule !== 'auto' ? line / TWIP : (maxPt * 1.22 / 72) * lineMul;
    const charsPerLine = Math.max(10, (widthIn * 72) / (maxPt * 0.5));
    const lines = Math.max(1, Math.ceil(text.length / charsPerLine)) + brs;
    let height = before + after + lines * lineH;
    for (const im of pics) if (im.flow) height += im.hIn;

    const tag = level ? 'h' + level : 'p';
    const st = align ? ` style="text-align:${align}"` : '';
    const isEmpty = !text.trim() && !/<br>/.test(html);
    let list = null;
    if (numPr) {
      const numId = val(kid(numPr, 'numId')), ilvl = val(kid(numPr, 'ilvl')) || '0';
      if (numId && numId !== '0') {
        const fmt = (numFmt[numId] || {})[ilvl] || 'bullet';
        list = { ordered: fmt !== 'bullet' && fmt !== 'none', level: +ilvl };
      }
    }
    return {
      kind: 'p', html: isEmpty ? '' : `<${tag}${st}>${html}</${tag}>`, inner: html, align, text, pics, isEmpty, list,
      breakBefore, breakAfter, height, extraBlocks
    };
  }

  function table(tbl, sec, widthIn) {
    let grid = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => +wAttr(g, 'w') || 0);
    const fixedLayout = wAttr(kid(kid(tbl, 'tblPr'), 'tblLayout'), 'type') === 'fixed';
    if (!fixedLayout && grid.length > 1) grid = autofitGrid(tbl, grid);
    const gridTotal = grid.reduce((a, b) => a + b, 0) || 1;
    const pics = [];
    const rows = [];
    const vOpen = {};  // grid col → cell object that started a vertical merge
    for (const tr of kids(tbl, 'tr')) {
      const header = !!kid(kid(tr, 'trPr'), 'tblHeader');
      const cells = [];
      let col = 0, rowH = 0;
      for (const tc of kids(tr, 'tc')) {
        const tcPr = kid(tc, 'tcPr');
        const span = +val(kid(tcPr, 'gridSpan')) || 1;
        const vm = kid(tcPr, 'vMerge');
        const vmVal = vm ? (val(vm) || 'continue') : null;
        const cellW = (grid.slice(col, col + span).reduce((a, b) => a + b, 0) / gridTotal) * widthIn;
        if (vmVal === 'continue' && vOpen[col]) { vOpen[col].rowspan++; col += span; continue; }
        const inner = blocks(Array.from(tc.children), sec, Math.max(0.5, cellW - 0.15), true);
        inner.pics.forEach((x) => pics.push(x));
        const fill = wAttr(kid(tcPr, 'shd'), 'fill');
        const cell = { span, rowspan: 1, html: inner.html || '<br>', fill: fill && /^[0-9a-f]{6}$/i.test(fill) && fill.toLowerCase() !== 'ffffff' ? '#' + fill : '' };
        if (vmVal === 'restart') vOpen[col] = cell; else delete vOpen[col];
        rowH = Math.max(rowH, inner.height + 0.08);
        cells.push(cell);
        col += span;
      }
      rows.push({ header, cells, height: Math.max(0.25, rowH) });
    }
    const colgroup = grid.length ? '<colgroup>' + grid.map((g) => `<col style="width:${((g / gridTotal) * 100).toFixed(2)}%">`).join('') + '</colgroup>' : '';
    const rowHtml = (r) => '<tr>' + r.cells.map((c) => {
      const tag = r.header ? 'th' : 'td';
      const attrs = (c.span > 1 ? ` colspan="${c.span}"` : '') + (c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : '') + (c.fill ? ` style="background-color:${c.fill}"` : '');
      return `<${tag}${attrs}>${c.html}</${tag}>`;
    }).join('') + '</tr>';
    const head = rows.filter((r) => r.header), bodyRows = rows.filter((r) => !r.header);
    const html = `<table style="table-layout:fixed;width:100%">${colgroup}` +
      (head.length ? `<thead>${head.map(rowHtml).join('')}</thead>` : '') + `<tbody>${bodyRows.map(rowHtml).join('')}</tbody></table>`;
    return { kind: 'tbl', html, pics, height: rows.reduce((a, r) => a + r.height, 0) + 0.1, breakBefore: false, breakAfter: false, isEmpty: false };
  }

  /**
   * Word "AutoFit" tables size their columns from the content, not from the saved grid.
   * Do the same roughly: columns with more text get more room (blended with the saved grid).
   */
  function autofitGrid(tbl, grid) {
    const n = grid.length;
    const total = Array(n).fill(0), longest = Array(n).fill(0);
    for (const tr of kids(tbl, 'tr')) {
      let col = +val(kid(kid(tr, 'trPr'), 'gridBefore')) || 0;
      for (const tc of kids(tr, 'tc')) {
        const span = +val(kid(kid(tc, 'tcPr'), 'gridSpan')) || 1;
        if (span === 1 && col < n) {
          const text = all(tc, NS.w, 't').map((t) => t.textContent).join(' ');
          total[col] += text.length;
          longest[col] = Math.max(longest[col], ...text.split(/\s+/).map((w) => w.length), 0);
        }
        col += span;
      }
    }
    const score = total.map((t, j) => Math.max(longest[j] * 0.6, Math.sqrt(Math.min(t, 600)) * 1.6, 2.5));
    const sTot = score.reduce((a, b) => a + b, 0), gTot = grid.reduce((a, b) => a + b, 0) || 1;
    return grid.map((g, j) => 0.35 * (g / gTot) + 0.65 * (score[j] / sTot)).map((x) => Math.round(x * 10000));
  }

  /** A run of block elements → html (lists grouped) + pictures + height. */
  function blocks(els, sec, widthIn, inCell = false) {
    const items = [];
    for (const el of els) {
      if (isW(el, 'p')) { const p = paragraph(el, sec, widthIn); items.push(p, ...p.extraBlocks); }
      else if (isW(el, 'tbl')) items.push(table(el, sec, widthIn));
      else if (isW(el, 'sdt')) { const r = blocks(Array.from((kid(el, 'sdtContent') || el).children), sec, widthIn, inCell); items.push({ kind: 'raw', ...r, isEmpty: !r.html }); }
    }
    return { html: joinHtml(items, inCell), pics: items.flatMap((i) => i.pics || []), height: items.reduce((a, i) => a + (i.height || 0), 0) };
  }

  /** Join blocks: group list items, collapse empty lines. */
  function joinHtml(items, inCell) {
    let out = '', listOpen = null, empties = 0;
    const closeList = () => { if (listOpen) { out += listOpen.ordered ? '</ol>' : '</ul>'; listOpen = null; } };
    for (const it of items) {
      if (it.kind === 'p' && it.list && !it.isEmpty) {
        if (!listOpen || listOpen.ordered !== it.list.ordered) { closeList(); listOpen = it.list; out += it.list.ordered ? '<ol>' : '<ul>'; }
        out += `<li${it.align ? ` style="text-align:${it.align}"` : ''}>${it.inner}</li>`;
        empties = 0; continue;
      }
      closeList();
      if (it.isEmpty) { empties++; if (!inCell && empties === 2 && out) out += '<p><br></p>'; continue; }
      empties = 0;
      out += it.html;
    }
    closeList();
    return out.replace(/(<p><br><\/p>)+$/, '');
  }

  /* ---- walk the body, cut into pages */
  const pages = [];
  let secIdx = 0;
  let cur = null;
  const newPage = () => {
    const sec = sections[Math.min(secIdx, sections.length - 1)];
    cur = { landscape: sec.landscape, items: [], used: 0, sec, secIdx };
    pages.push(cur);
  };
  newPage();
  const total = blocksTop.length;
  blocksTop.forEach((el, n) => {
    if (n % 200 === 0) onProgress(n / total);
    const sec = sections[Math.min(secIdx, sections.length - 1)];
    if (cur.secIdx !== secIdx) {
      // a new Word section starts on a new page unless it is "continuous" with the same orientation
      if (cur.items.length && !(sec.type === 'continuous' && sec.landscape === cur.landscape)) newPage();
      else { cur.landscape = sec.landscape; cur.sec = sec; cur.secIdx = secIdx; }
    }
    let item = null;
    if (isW(el, 'p')) item = paragraph(el, sec, sec.textW);
    else if (isW(el, 'tbl')) item = table(el, sec, sec.textW);
    else if (isW(el, 'sdt')) { const r = blocks(Array.from((kid(el, 'sdtContent') || el).children), sec, sec.textW); item = { kind: 'raw', ...r, isEmpty: !r.html && !r.pics.length }; }
    if (item) {
      const picsOnly = item.isEmpty && (item.pics || []).length > 0;
      const hasContent = item.kind === 'tbl' || item.kind === 'raw' || !item.isEmpty;
      const curPics = cur.items.reduce((a, it) => a + ((it.pics || []).length), 0);
      const overflow = cur.items.length && cur.used + item.height > sec.textH * 1.02;
      if (item.breakBefore && cur.items.length) newPage();
      // Ran off the page (estimated). Empty lines never start a page, and the first pictures
      // after a title stay with that title — pictures shrink to fit in Pagesmith anyway.
      else if (overflow && item.kind !== 'tbl' && ((hasContent && !picsOnly) || (picsOnly && curPics > 0))) {
        // empty lines that ran past the bottom continue at the top of the next page
        const spill = Math.max(0, cur.used - sec.textH) % sec.textH;
        newPage();
        cur.used = spill;
      }
      cur.items.push(item, ...(item.extraBlocks || []));
      cur.used += item.height;
      if (item.breakAfter) newPage();
    }
    const ends = isW(el, 'p') && kid(kid(el, 'pPr'), 'sectPr');
    if (ends) secIdx++;
  });

  const result = pages.map((pg, i) => {
    const html = joinHtml(pg.items, false).replace(/^(<p><br><\/p>)+/, '');
    const pics = pg.items.flatMap((it) => it.pics || []);
    return { index: i, landscape: pg.landscape, html, pics, zeroMargins: pg.sec.zeroMargins };
  }).filter((p) => p.html.replace(/<[^>]+>|&nbsp;|&emsp;|\s/g, '') || /<table/.test(p.html) || p.pics.length);

  onProgress(1);
  return {
    pages: result,
    pictures: images.length, skippedBackgrounds: skippedBg, skippedUnsupported,
    /** Load one picture's bytes. */
    loadImage: async (img) => new Blob([await zip.file(img.path).async('arraybuffer')], { type: img.type })
  };
}

