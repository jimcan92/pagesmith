/* Pagesmith — plain JavaScript, no build step. Open index.html in Chrome or Edge. */
(function () {
  'use strict';

  const D = window.PAGESMITH_DEFAULTS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PX_PER_IN = 96;
  const MAX_IMG_SIDE = 2400;  // imported photos are resized to this (plenty for print, keeps files small)
  const FMT_DOC = 'pagesmith';
  const FMT_TPL = 'pagesmith-template';

  /* ------------------------------------------------------------------ storage */
  const DB = {
    db: null,
    open() {
      return new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('IndexedDB not available'));
        const r = indexedDB.open('pagesmith', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('images'); };
        r.onsuccess = () => { DB.db = r.result; resolve(); };
        r.onerror = () => reject(r.error);
      });
    },
    run(store, mode, fn) {
      if (!DB.db) return Promise.resolve(undefined);
      return new Promise((resolve, reject) => {
        const t = DB.db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      });
    },
    get: (s, k) => DB.run(s, 'readonly', (o) => o.get(k)),
    put: (s, k, v) => DB.run(s, 'readwrite', (o) => o.put(v, k)),
    del: (s, k) => DB.run(s, 'readwrite', (o) => o.delete(k)),
    keys: (s) => DB.run(s, 'readonly', (o) => o.getAllKeys())
  };

  /* images live outside the document JSON: id -> { blob, url } */
  const images = new Map();
  async function storeImage(blob, id = uid('img')) {
    images.set(id, { blob, url: URL.createObjectURL(blob) });
    try { await DB.put('images', id, blob); } catch (e) { console.warn(e); }
    return id;
  }
  const isImgId = (ref) => typeof ref === 'string' && /^img_\w+$/.test(ref);
  const srcOf = (ref) => (isImgId(ref) ? (images.get(ref)?.url || '') : '');

  /* ------------------------------------------------------------------ state */
  let project = null;
  let currentId = null;
  let defaultTemplate = clone(D.template);

  function makePage(type, orientation = 'portrait', bg = 'default') {
    if (type === 'cover') return { id: uid('pg'), type: 'cover' };
    return { id: uid('pg'), type: 'content', orientation, bg, html: '', layout: 'auto', fit: 'contain', showCaptions: true, attachments: [] };
  }

  function newProject(name = 'Untitled document', template = defaultTemplate) {
    project = {
      format: FMT_DOC, version: 2, name,
      paper: 'long',
      pageNumbers: { enabled: false, align: 'right', bottom: 0.3, side: 0.6, skipCovers: true, start: 1 },
      template: clone(template),
      pages: []
    };
    if (project.template.cover) project.pages.push(makePage('cover'));
    project.pages.push(makePage('content', 'portrait'));
    currentId = project.pages[0].id;
    return project;
  }

  const pageById = (id) => project.pages.find((p) => p.id === id);
  const pageIndex = (id) => project.pages.findIndex((p) => p.id === id);
  const current = () => pageById(currentId);
  const hasCover = () => project.pages.some((p) => p.type === 'cover');

  /* backgrounds ------------------------------------------------------ */
  const bgList = () => project.template.backgrounds;
  const bgById = (id) => bgList().find((b) => b.id === id);
  const specialBgs = () => bgList().filter((b) => b.id !== 'portrait' && b.id !== 'landscape');
  /** The background actually used by a content page. */
  function resolveBg(pg) {
    const base = bgById(pg.orientation) || D.template.backgrounds.find((b) => b.id === pg.orientation);
    if (pg.bg === 'none') return { ...base, src: '' };
    const b = bgById(pg.bg);
    if (b && b.orientation === pg.orientation) return b;
    return base;
  }
  function bgLabel(pg) {
    if (pg.bg === 'none') return 'No background';
    const b = bgById(pg.bg);
    return b && b.orientation === pg.orientation ? b.name : (bgById(pg.orientation)?.name || pg.orientation);
  }
  const templateIsEmpty = () => !project.template.cover && !bgList().some((b) => b.src);

  /* ------------------------------------------------------------------ autosave */
  let saveTimer = null;
  function touch() {
    $('#saveStatus').textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await DB.put('kv', 'project', project);
        await DB.put('kv', 'currentId', currentId);
        $('#saveStatus').textContent = DB.db ? 'All changes saved' : 'Not saved (storage blocked)';
      } catch (e) {
        console.error(e);
        $('#saveStatus').textContent = 'Save failed — use “Save file”';
      }
    }, 500);
  }

  function templateImageIds(t) {
    return [t.cover, ...t.backgrounds.map((b) => b.src)].filter(isImgId);
  }
  function referencedImageIds(includeDefault = false) {
    const ids = new Set(templateImageIds(project.template));
    if (includeDefault) templateImageIds(defaultTemplate).forEach((i) => ids.add(i));
    for (const pg of project.pages) (pg.attachments || []).forEach((a) => ids.add(a.src));
    return ids;
  }
  async function cleanupImages() {
    const used = referencedImageIds(true);
    const keys = (await DB.keys('images')) || [];
    for (const k of keys) {
      if (used.has(k)) continue;
      await DB.del('images', k);
      const im = images.get(k);
      if (im) { URL.revokeObjectURL(im.url); images.delete(k); }
    }
  }

  /* ------------------------------------------------------------------ sanitizer (pasted / imported text) */
  const ALLOWED = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SPAN', 'DIV', 'H1', 'H2', 'H3', 'H4',
    'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'COLGROUP', 'COL', 'BLOCKQUOTE', 'SUB', 'SUP', 'FONT', 'HR']);

  /** Read a width like "283.5pt", "2in", "120" (px) or "25%" → { px } or { pct }. */
  function parseWidth(v) {
    const m = String(v || '').trim().match(/^([\d.]+)\s*(px|pt|in|cm|mm|%)?$/i);
    if (!m || !(+m[1] > 0)) return null;
    const n = +m[1], u = (m[2] || 'px').toLowerCase();
    if (u === '%') return { pct: n };
    return { px: n * ({ px: 1, pt: 96 / 72, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 }[u]) };
  }

  /**
   * Keep a table's column widths (from Word / Google Docs / our own <col> tags) as percentages
   * in a <colgroup>, with a fixed table layout, so one long cell can't push the other columns aside.
   */
  function fixTableColumns(table) {
    const rows = Array.from(table.rows || []);
    const nCols = Math.max(0, ...rows.map((r) => Array.from(r.cells).reduce((s, c) => s + (+c.getAttribute('colspan') || 1), 0)));
    if (!nCols) return;
    let widths = null;
    const cols = Array.from(table.querySelectorAll('col'));
    if (cols.length) {
      const ws = [];
      cols.forEach((c) => { for (let k = 0; k < (+c.getAttribute('span') || 1); k++) ws.push(parseWidth(c.dataset.w)); });
      if (ws.length === nCols && ws.every(Boolean)) widths = ws;
    }
    if (!widths) {
      for (const r of rows) {  // first row whose cells all say how wide they are
        const ws = [];
        let ok = true;
        for (const c of Array.from(r.cells)) {
          const span = +c.getAttribute('colspan') || 1, w = parseWidth(c.dataset.w);
          if (!w) { ok = false; break; }
          for (let k = 0; k < span; k++) ws.push(w.pct != null ? { pct: w.pct / span } : { px: w.px / span });
        }
        if (ok && ws.length === nCols) { widths = ws; break; }
      }
    }
    table.querySelectorAll('colgroup, col').forEach((c) => c.remove());
    table.querySelectorAll('[data-w]').forEach((c) => c.removeAttribute('data-w'));
    if (!widths) return;
    const vals = widths.map((w) => (w.pct != null ? w.pct : w.px));
    const total = vals.reduce((a, b) => a + b, 0);
    const cg = table.ownerDocument.createElement('colgroup');
    vals.forEach((v) => { const c = table.ownerDocument.createElement('col'); c.setAttribute('style', `width:${(v / total * 100).toFixed(2)}%`); cg.appendChild(c); });
    table.insertBefore(cg, table.firstChild);
    table.setAttribute('style', 'table-layout:fixed;width:100%');
  }
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'SVG', 'VIDEO', 'AUDIO', 'META', 'LINK', 'TITLE', 'HEAD', 'NOSCRIPT', 'TEMPLATE', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'FORM', 'CANVAS']);
  const STYLES = ['text-align', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'color', 'background-color', 'font-size', 'margin-left', 'padding-left'];

  function sanitize(html) {
    const doc = new DOMParser().parseFromString('<div id="r">' + (html || '') + '</div>', 'text/html');
    const root = doc.getElementById('r');
    (function walk(node) {
      for (const ch of Array.from(node.childNodes)) {
        if (ch.nodeType === 8) { ch.remove(); continue; }
        if (ch.nodeType !== 1) continue;
        const tag = ch.tagName.toUpperCase();  // Word's <o:p> etc. are not allowed → unwrapped
        if (DROP.has(tag)) { ch.remove(); continue; }
        walk(ch);
        if (!ALLOWED.has(tag)) { ch.replaceWith(...Array.from(ch.childNodes)); continue; }
        const keep = {};
        for (const prop of STYLES) {
          const v = ch.style.getPropertyValue(prop);
          if (v && !/url\(|expression/i.test(v)) keep[prop] = v;
        }
        const extra = {};
        if (tag === 'TD' || tag === 'TH') ['colspan', 'rowspan'].forEach((a) => ch.hasAttribute(a) && (extra[a] = ch.getAttribute(a)));
        if (tag === 'TD' || tag === 'TH' || tag === 'COL') {  // remembered for fixTableColumns
          const w = ch.style.width || ch.getAttribute('width');
          if (w) extra['data-w'] = w;
          if (tag === 'COL' && ch.getAttribute('span')) extra.span = ch.getAttribute('span');
        }
        if (tag === 'FONT') ['color', 'size'].forEach((a) => ch.hasAttribute(a) && (extra[a] = ch.getAttribute(a)));
        if (ch.getAttribute('align')) keep['text-align'] = ch.getAttribute('align');
        for (const a of Array.from(ch.attributes)) ch.removeAttribute(a.name);
        Object.entries(extra).forEach(([k, v]) => ch.setAttribute(k, v));
        const st = Object.entries(keep).map(([k, v]) => `${k}:${v}`).join(';');
        if (st) ch.setAttribute('style', st);
      }
    })(root);
    root.querySelectorAll('table').forEach(fixTableColumns);
    return root.innerHTML;
  }

  /** Titles & captions only keep bold / italic / underline / line breaks. */
  function sanitizeInline(html) {
    const doc = new DOMParser().parseFromString('<div id="r">' + (html || '') + '</div>', 'text/html');
    const root = doc.getElementById('r');
    const OK = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR']);
    (function walk(node) {
      for (const ch of Array.from(node.childNodes)) {
        if (ch.nodeType === 8) { ch.remove(); continue; }
        if (ch.nodeType !== 1) continue;
        if (DROP.has(ch.tagName.toUpperCase())) { ch.remove(); continue; }
        walk(ch);
        const tag = ch.tagName.toUpperCase();
        if (!OK.has(tag)) {
          const block = /^(DIV|P|LI)$/.test(tag) && ch.previousSibling;
          ch.replaceWith(...(block ? [doc.createElement('br')] : []), ...Array.from(ch.childNodes));
          continue;
        }
        for (const a of Array.from(ch.attributes)) ch.removeAttribute(a.name);
      }
    })(root);
    return root.innerHTML.replace(/(<br>\s*)+$/i, '');
  }
  const plainText = (html) => String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();

  /* ------------------------------------------------------------------ titles & captions style */
  const LABEL_POS = [['above', 'Above picture'], ['below', 'Below picture'], ['top', 'On picture – top'], ['bottom', 'On picture – bottom']];
  const LABEL_DEFAULTS = {
    title:   { pos: 'above', size: 11,  align: 'center', bold: true,  italic: false, color: '#111111' },
    caption: { pos: 'below', size: 9.5, align: 'center', bold: false, italic: true,  color: '#222222' }
  };
  const labelStyle = (pg) => ({
    title: { ...LABEL_DEFAULTS.title, ...(pg.labels?.title || {}) },
    caption: { ...LABEL_DEFAULTS.caption, ...(pg.labels?.caption || {}) }
  });
  function cleanLabels(l) {
    const out = {};
    for (const k of ['title', 'caption']) {
      const s = { ...LABEL_DEFAULTS[k], ...((l && l[k]) || {}) };
      out[k] = {
        pos: LABEL_POS.some(([v]) => v === s.pos) ? s.pos : LABEL_DEFAULTS[k].pos,
        size: Math.min(40, Math.max(6, +s.size || LABEL_DEFAULTS[k].size)),
        align: ['left', 'center', 'right'].includes(s.align) ? s.align : 'center',
        bold: !!s.bold, italic: !!s.italic,
        color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : LABEL_DEFAULTS[k].color
      };
    }
    return out;
  }

  /* ------------------------------------------------------------------ image helpers */
  async function decodeImage(file) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (_) {
      const url = URL.createObjectURL(file);
      try { const img = new Image(); img.src = url; await img.decode(); return img; }
      finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    }
  }
  const canvasToJpeg = (canvas, q = 0.88) => new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', q));

  /** Resize to a sane size and re-encode as JPEG (white behind transparency). */
  async function normalizeImage(file, rotate = 0, maxSide = MAX_IMG_SIDE) {
    const src = await decodeImage(file);
    const k = Math.min(1, maxSide / Math.max(src.width, src.height));
    const w = Math.round(src.width * k), h = Math.round(src.height * k);
    const quarter = rotate % 180 !== 0;
    const c = document.createElement('canvas');
    c.width = quarter ? h : w; c.height = quarter ? w : h;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.translate(c.width / 2, c.height / 2); g.rotate((rotate * Math.PI) / 180);
    g.drawImage(src, -w / 2, -h / 2, w, h);
    if (src.close) src.close();
    return { blob: await canvasToJpeg(c), w: c.width, h: c.height };
  }
  async function importImageFile(file, maxSide) {
    const { blob, w, h } = await normalizeImage(file, 0, maxSide);
    return { id: await storeImage(blob), w, h };
  }

  /** Render every page of a PDF to an image. Calls onPage({id,w,h,page,total}). */
  async function importPdf(file, onPage) {
    if (!window.pdfjsLib) throw new Error('PDF reader did not load (needs internet).');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(4, 2200 / Math.max(base.width, base.height)) });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      const id = await storeImage(await canvasToJpeg(c, 0.9));
      onPage({ id, w: c.width, h: c.height, page: i, total: pdf.numPages });
      page.cleanup();
    }
    pdf.destroy();
  }

  const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  const baseName = (f) => f.name.replace(/\.[^.]+$/, '');

  /* ------------------------------------------------------------------ layout maths */
  const LAYOUTS = [
    ['auto', 'Auto (based on count)'], ['free', 'Manual (drag & resize)'], ['1', '1 per page'], ['2h', '2 side by side'], ['2v', '2 stacked'],
    ['3h', '3 in a row'], ['3v', '3 stacked'], ['4', '4 (2 × 2)'], ['6', '6'], ['9', '9 (3 × 3)']
  ];
  function gridFor(pg) {
    const n = pg.attachments.length;
    const land = pg.orientation === 'landscape';
    let c, r;
    switch (pg.layout) {
      case '1': c = 1; r = 1; break;
      case '2h': c = 2; r = 1; break;
      case '2v': c = 1; r = 2; break;
      case '3h': c = 3; r = 1; break;
      case '3v': c = 1; r = 3; break;
      case '4': c = 2; r = 2; break;
      case '6': c = land ? 3 : 2; r = land ? 2 : 3; break;
      case '9': c = 3; r = 3; break;
      default:
        if (n <= 1) { c = 1; r = 1; }
        else if (n === 2) { c = land ? 2 : 1; r = land ? 1 : 2; }
        else if (n === 3) { c = land ? 3 : 2; r = land ? 1 : 2; }
        else if (n === 4) { c = 2; r = 2; }
        else if (n <= 6) { c = land ? 3 : 2; r = land ? 2 : 3; }
        else if (n <= 9) { c = 3; r = 3; }
        else { c = land ? 4 : 3; r = Math.ceil(n / c); }
    }
    if (n > c * r) r = Math.ceil(n / c);
    return { c, r };
  }

  function dims(pg) {
    const paper = D.paperSizes[project.paper] || D.paperSizes.long;
    const land = pg.type === 'content' && pg.orientation === 'landscape';
    return land ? { w: paper.h, h: paper.w, land } : { w: paper.w, h: paper.h, land };
  }

  function pageNumbers() {
    const pn = project.pageNumbers; const out = {};
    let n = pn.start || 1;
    for (const pg of project.pages) {
      if (pg.type === 'cover' && pn.skipCovers) continue;
      out[pg.id] = n++;
    }
    return out;
  }

  /* ------------------------------------------------------------------ page rendering (preview == print) */
  function buildPage(pg, pnum) {
    const { w, h } = dims(pg);
    const el = document.createElement('div');
    el.className = 'page';
    el.style.width = w + 'in';
    el.style.height = h + 'in';

    if (pg.type === 'cover') {
      const src = srcOf(project.template.cover);
      el.insertAdjacentHTML('beforeend', src
        ? `<img class="cover-img" alt="" src="${esc(src)}">`
        : '<div class="empty-cover">No cover image yet.<br>Add one in <b>Template</b>.</div>');
    } else {
      const b = resolveBg(pg);
      if (b.src) el.insertAdjacentHTML('beforeend', `<img class="bg" alt="" src="${esc(srcOf(b.src))}">`);
      const m = b.margins;
      const safe = document.createElement('div');
      safe.className = 'safe';
      Object.assign(safe.style, { top: m.top + 'in', right: m.right + 'in', bottom: m.bottom + 'in', left: m.left + 'in' });
      if ((pg.html || '').replace(/<[^>]*>|&nbsp;|\s/g, '') !== '' || /<table|<hr/i.test(pg.html || '')) {
        const rt = document.createElement('div');
        rt.className = 'rt';
        rt.innerHTML = pg.html;
        safe.appendChild(rt);
      }
      if (pg.attachments.length) {
        const free = pg.layout === 'free';
        const grid = document.createElement('div');
        if (free) {
          grid.className = 'grid free';
        } else {
          const { c, r } = gridFor(pg);
          grid.className = 'grid';
          grid.style.gridTemplateColumns = `repeat(${c}, minmax(0, 1fr))`;
          grid.style.gridTemplateRows = `repeat(${r}, minmax(0, 1fr))`;
        }
        const L = labelStyle(pg);
        const lbl = (k, html, cls = '') => {
          const s = L[k];
          return `<div class="lbl ${k} ${cls}" style="font-size:${s.size}pt;text-align:${s.align};font-weight:${s.bold ? 700 : 400};font-style:${s.italic ? 'italic' : 'normal'};color:${s.color}">${html}</div>`;
        };
        pg.attachments.forEach((a, i) => {
          const fig = document.createElement('figure');
          fig.dataset.i = i;
          // above / on-top: title first; below / on-bottom: caption first, title last
          const parts = { above: '', below: '', top: '', bottom: '' };
          const t = plainText(a.title) ? lbl('title', a.title) : '';
          const c = pg.showCaptions && plainText(a.caption) ? lbl('caption', a.caption) : '';
          for (const pos of Object.keys(parts)) {
            const tt = L.title.pos === pos ? t : '', cc = L.caption.pos === pos ? c : '';
            parts[pos] = pos === 'above' || pos === 'top' ? tt + cc : cc + tt;
          }
          fig.innerHTML = parts.above +
            `<div class="imgbox"><img alt="" draggable="false" style="object-fit:${pg.fit === 'cover' ? 'cover' : 'contain'}" src="${esc(srcOf(a.src))}">` +
            (parts.top ? `<div class="overlay top">${parts.top}</div>` : '') +
            (parts.bottom ? `<div class="overlay bottom">${parts.bottom}</div>` : '') + '</div>' +
            parts.below;
          if (free) {
            const b = a.box || cascadeBox(i);
            fig.className = 'free-item';
            Object.assign(fig.style, { left: b.x * 100 + '%', top: b.y * 100 + '%', width: b.w * 100 + '%', height: b.h * 100 + '%' });
          }
          grid.appendChild(fig);
        });
        safe.appendChild(grid);
      }
      el.appendChild(safe);
    }
    const pn = project.pageNumbers;
    if (pn.enabled && pnum != null) {
      const n = document.createElement('div');
      n.className = 'pnum';
      n.textContent = pnum;
      n.style.bottom = pn.bottom + 'in';
      if (pn.align === 'center') { n.style.left = '0'; n.style.right = '0'; n.style.textAlign = 'center'; }
      else if (pn.align === 'left') n.style.left = pn.side + 'in';
      else n.style.right = pn.side + 'in';
      el.appendChild(n);
    }
    return el;
  }

  let scale = 0.5;
  function computeScale() {
    const z = $('#zoom').value;
    if (z !== 'fit') return parseFloat(z);
    const paper = D.paperSizes[project.paper] || D.paperSizes.long;
    const avail = $('#previewPages').clientWidth - 56;
    const widest = project.pages.some((p) => p.type === 'content' && p.orientation === 'landscape') ? paper.h : paper.w;
    return Math.max(0.15, Math.min(1, avail / (widest * PX_PER_IN)));
  }

  function makeSlot(pg, idx, nums) {
    const { w, h, land } = dims(pg);
    const slot = document.createElement('div');
    slot.className = 'slot ' + (land ? 'landscape' : 'portrait') + (pg.id === currentId ? ' selected' : '');
    slot.dataset.id = pg.id;
    slot.style.width = w * PX_PER_IN * scale + 'px';
    slot.style.height = h * PX_PER_IN * scale + 'px';
    const page = buildPage(pg, nums[pg.id]);
    page.style.transform = `scale(${scale})`;
    page.style.setProperty('--s', scale);
    slot.appendChild(page);
    const what = pg.type === 'cover' ? 'Cover' : bgLabel(pg);
    slot.insertAdjacentHTML('beforeend', `<span class="badge">Page ${idx + 1} · ${esc(what)}</span>`);
    if (pg.type === 'content' && pg.layout === 'free') enableFree(slot, pg);
    return slot;
  }

  /* ------------------------------------------------------------------ manual layout (drag & resize) */
  // Boxes are fractions (0–1) of the attachment area, so they always stay inside the page.
  const MIN_FRAC = 0.04;
  const SNAP = 0.012;
  let activeFree = null;  // { pageId, i } — the picture last clicked in a manual layout

  const cascadeBox = (i) => ({ x: 0.05 + 0.05 * (i % 6), y: 0.05 + 0.05 * (i % 6), w: 0.4, h: 0.4 });

  /** width / height of a page's attachment area (in real units). */
  function areaAspect(pg) {
    const g = $(`#previewPages .slot[data-id="${pg.id}"] .grid`);
    if (g && g.clientWidth && g.clientHeight) return g.clientWidth / g.clientHeight;
    const { w, h } = dims(pg);
    const m = resolveBg(pg).margins;
    return (w - m.left - m.right) / Math.max(0.5, h - m.top - m.bottom);
  }

  /** A box of width `w` that keeps the picture's shape, clamped inside the area. */
  function boxForAspect(pg, a, w, cx = 0.5, cy = 0.5) {
    const A = areaAspect(pg), ar = a.ar || 4 / 3;
    let h = (w * A) / ar;
    if (h > 1) { w = w / h; h = 1; }
    if (w > 1) { h = h / w; w = 1; }
    const x = Math.min(Math.max(0, cx - w / 2), 1 - w), y = Math.min(Math.max(0, cy - h / 2), 1 - h);
    return { x, y, w, h };
  }

  /** Place a newly added picture on a manual page (cascading so they don't stack exactly). */
  function placeNew(pg, a) {
    const k = pg.attachments.length % 6;
    const b = boxForAspect(pg, a, 0.42, 0.3 + 0.08 * k, 0.3 + 0.08 * k);
    a.box = b;
  }

  /** Switching to Manual: start from where the pictures are right now in the automatic layout. */
  function boxesFromCurrentLayout(pg) {
    const slot = $(`#previewPages .slot[data-id="${pg.id}"]`);
    const grid = slot?.querySelector('.grid');
    if (!grid) { pg.attachments.forEach((a, i) => (a.box = a.box || cascadeBox(i))); return; }
    const gr = grid.getBoundingClientRect();
    $$('figure', grid).forEach((fig) => {
      const a = pg.attachments[+fig.dataset.i]; if (!a) return;
      const img = $('img', fig);
      if (!a.ar && img.naturalWidth) a.ar = img.naturalWidth / img.naturalHeight;
      const r = $('.imgbox', fig).getBoundingClientRect();
      // shrink the cell to the picture's own shape (what "Whole picture" shows)
      let w = r.width, h = r.height;
      if (a.ar && pg.fit !== 'cover') { if (w / h > a.ar) w = h * a.ar; else h = w / a.ar; }
      const capH = fig.getBoundingClientRect().height - r.height;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      a.box = {
        x: (cx - w / 2 - gr.left) / gr.width, y: (cy - h / 2 - gr.top) / gr.height,
        w: w / gr.width, h: (h + (pg.showCaptions && a.caption ? capH : 0)) / gr.height
      };
      clampBox(a.box);
    });
  }

  function clampBox(b) {
    b.w = Math.min(1, Math.max(MIN_FRAC, b.w)); b.h = Math.min(1, Math.max(MIN_FRAC, b.h));
    b.x = Math.min(1 - b.w, Math.max(0, b.x)); b.y = Math.min(1 - b.h, Math.max(0, b.y));
    return b;
  }

  function snapMove(b) {
    const xs = [[b.x, 0], [b.x + b.w / 2, 0.5], [b.x + b.w, 1]];
    for (const [v, t] of xs) if (Math.abs(v - t) < SNAP) { b.x += t - v; break; }
    const ys = [[b.y, 0], [b.y + b.h / 2, 0.5], [b.y + b.h, 1]];
    for (const [v, t] of ys) if (Math.abs(v - t) < SNAP) { b.y += t - v; break; }
    return b;
  }

  function enableFree(slot, pg) {
    const area = $('.grid.free', slot); if (!area) return;
    $$('.free-item', area).forEach((fig) => {
      const i = +fig.dataset.i;
      if (activeFree && activeFree.pageId === pg.id && activeFree.i === i) fig.classList.add('active');
      fig.insertAdjacentHTML('beforeend', '<span class="h nw"></span><span class="h ne"></span><span class="h sw"></span><span class="h se"></span>');
      fig.addEventListener('pointerdown', (e) => startFreeDrag(e, fig, area, pg, i));
    });
  }

  function startFreeDrag(e, fig, area, pg, i) {
    if (e.button !== 0) return;
    e.preventDefault();
    const a = pg.attachments[i];
    const start = { ...(a.box || cascadeBox(i)) };
    const mode = e.target.classList.contains('h') ? [...e.target.classList].find((c) => c !== 'h') : 'move';
    const rect = area.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const k = start.h / start.w;  // keep the picture's shape while resizing from a corner
    let box = start, moved = false;
    activeFree = { pageId: pg.id, i };
    $$('.free-item.active').forEach((x) => x.classList.remove('active'));
    fig.classList.add('active');
    fig.setPointerCapture(e.pointerId);

    const onMove = (ev) => {
      const dx = (ev.clientX - sx) / rect.width, dy = (ev.clientY - sy) / rect.height;
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 3) return;
      moved = true;
      let b = { ...start };
      if (mode === 'move') {
        b.x = start.x + dx; b.y = start.y + dy;
        if (!ev.altKey) snapMove(b);
      } else {
        const right = mode.includes('e'), bottom = mode.includes('s');
        let w = start.w + (right ? dx : -dx);
        let h = ev.shiftKey ? start.h + (bottom ? dy : -dy) : w * k;
        // keep inside the area: shrink to the room that is left on the dragged side
        const roomW = right ? 1 - start.x : start.x + start.w;
        const roomH = bottom ? 1 - start.y : start.y + start.h;
        if (!ev.shiftKey) { const s = Math.min(1, roomW / w, roomH / h); if (s < 1) { w *= s; h *= s; } }
        w = Math.min(Math.max(MIN_FRAC, w), roomW); h = Math.min(Math.max(MIN_FRAC, h), roomH);
        b.w = w; b.h = h;
        b.x = right ? start.x : start.x + start.w - w;
        b.y = bottom ? start.y : start.y + start.h - h;
      }
      box = clampBox(b);
      Object.assign(fig.style, { left: box.x * 100 + '%', top: box.y * 100 + '%', width: box.w * 100 + '%', height: box.h * 100 + '%' });
    };
    const onUp = () => {
      fig.removeEventListener('pointermove', onMove);
      fig.removeEventListener('pointerup', onUp);
      fig.removeEventListener('pointercancel', onUp);
      if (moved) { a.box = box; touch(); }
    };
    fig.addEventListener('pointermove', onMove);
    fig.addEventListener('pointerup', onUp);
    fig.addEventListener('pointercancel', onUp);
  }

  /** Arrow keys nudge the selected picture (Shift = bigger steps). */
  function nudgeFree(e) {
    if (!activeFree || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const pg = pageById(activeFree.pageId);
    const a = pg?.layout === 'free' && pg.attachments[activeFree.i];
    if (!a) return;
    const step = e.shiftKey ? 0.02 : 0.004;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    a.box = clampBox({ ...(a.box || cascadeBox(activeFree.i)), x: (a.box?.x ?? 0) + d[0], y: (a.box?.y ?? 0) + d[1] });
    renderOne(pg.id); touch();
  }

  const warnings = new Map();
  function checkOverflow(slot, pg) {
    let msg = '';
    if (pg.type === 'content') {
      const safe = slot.querySelector('.safe');
      const rt = slot.querySelector('.rt');
      const grid = slot.querySelector('.grid');
      if (safe && safe.scrollHeight > safe.clientHeight + 2) msg = 'Too much content — move some to a new page';
      else if (rt && rt.offsetHeight > safe.clientHeight + 2) msg = 'Text is too long for this page';
      else if (grid && pg.layout !== 'free' && pg.attachments.length && grid.clientHeight / gridFor(pg).r < 0.9 * PX_PER_IN) msg = 'Pictures are very small — shorten the text or use another page';
    }
    slot.classList.toggle('overflow', !!msg);
    if (msg) slot.dataset.warn = '⚠ ' + msg; else delete slot.dataset.warn;
    const had = warnings.get(pg.id) || '';
    if (msg) warnings.set(pg.id, msg); else warnings.delete(pg.id);
    return had !== msg;
  }

  function renderPreview() {
    scale = computeScale();
    const box = $('#previewPages');
    const nums = pageNumbers();
    box.textContent = '';
    project.pages.forEach((pg, i) => box.appendChild(makeSlot(pg, i, nums)));
    requestAnimationFrame(() => {
      project.pages.forEach((pg) => { const s = box.querySelector(`.slot[data-id="${pg.id}"]`); if (s) checkOverflow(s, pg); });
      renderPageList();
      refreshEditorWarning();
    });
    updatePageSizeCss();
  }

  /** Re-render one page only (fast path while typing). */
  function renderOne(id) {
    const pg = pageById(id); if (!pg) return;
    const old = $(`#previewPages .slot[data-id="${id}"]`);
    if (!old) return renderPreview();
    const slot = makeSlot(pg, pageIndex(id), pageNumbers());
    old.replaceWith(slot);
    requestAnimationFrame(() => { if (checkOverflow(slot, pg)) renderPageList(); refreshEditorWarning(); });
  }

  function updatePageSizeCss() {
    const p = D.paperSizes[project.paper] || D.paperSizes.long;
    $('#pageSizeStyle').textContent =
      `@page { size: ${p.w}in ${p.h}in; margin: 0; }
       @page dt-portrait { size: ${p.w}in ${p.h}in; margin: 0; }
       @page dt-landscape { size: ${p.h}in ${p.w}in; margin: 0; }
       @media print { .slot.portrait { page: dt-portrait; } .slot.landscape { page: dt-landscape; } }`;
  }

  /* ------------------------------------------------------------------ page list */
  function pageLabel(pg) {
    if (pg.type === 'cover') return 'Cover';
    const text = (pg.html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const n = pg.attachments.length;
    const parts = [];
    if (text) parts.push(text.slice(0, 60));
    else if (n && plainText(pg.attachments[0].title || pg.attachments[0].caption)) parts.push(plainText(pg.attachments[0].title || pg.attachments[0].caption));
    if (n) parts.push(`${n} attachment${n > 1 ? 's' : ''}`);
    return parts.join(' · ') || '(empty page)';
  }

  function renderPageList() {
    const ol = $('#pageList');
    ol.textContent = '';
    $('#pageCount').textContent = `(${project.pages.length})`;
    project.pages.forEach((pg, i) => {
      const li = document.createElement('li');
      li.className = 'page-item' + (pg.id === currentId ? ' selected' : '');
      li.dataset.id = pg.id;
      li.draggable = pg.type !== 'cover';
      const shape = pg.type === 'cover' ? '★' : pg.orientation === 'landscape' ? '<span class="ico-l"></span>' : '<span class="ico-p"></span>';
      const special = pg.type === 'content' && pg.bg !== 'default' && pg.bg !== pg.orientation ? `<span class="tag">${esc(bgLabel(pg))}</span>` : '';
      li.innerHTML = `<span class="num">${i + 1}</span><span class="shape">${shape}</span>
        <span class="label">${special}${esc(pageLabel(pg))}</span>
        ${warnings.has(pg.id) ? `<span class="warn" title="${esc(warnings.get(pg.id))}">⚠</span>` : ''}
        <span class="actions">
          ${pg.type === 'cover' ? '' : `<button class="icon-btn" data-act="up" title="Move up">↑</button>
          <button class="icon-btn" data-act="down" title="Move down">↓</button>
          <button class="icon-btn" data-act="dup" title="Duplicate">⧉</button>`}
          <button class="icon-btn danger" data-act="del" title="Delete page">✕</button>
        </span>`;
      ol.appendChild(li);
    });
    ol.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }

  function select(id, scrollPreview = true) {
    if (!pageById(id)) return;
    currentId = id;
    $$('.slot').forEach((s) => s.classList.toggle('selected', s.dataset.id === id));
    $$('.page-item').forEach((s) => s.classList.toggle('selected', s.dataset.id === id));
    renderEditor();
    if (scrollPreview) $(`.slot[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    touch();
  }

  /** Keep the (single) cover first. */
  function normalizeOrder() {
    const i = project.pages.findIndex((p) => p.type === 'cover');
    if (i > 0) project.pages.unshift(project.pages.splice(i, 1)[0]);
  }

  function insertPages(pages, afterId = currentId) {
    const i = pageIndex(afterId);
    project.pages.splice(i < 0 ? project.pages.length : i + 1, 0, ...pages);
    normalizeOrder();
    currentId = pages[pages.length - 1].id;
    renderPreview(); renderEditor(); touch();
    setTimeout(() => $(`.slot[data-id="${pages[0].id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
  }

  function movePage(id, delta) {
    const i = pageIndex(id), j = i + delta;
    if (i < 0 || j < 0 || j >= project.pages.length || project.pages[j].type === 'cover') return;
    const [pg] = project.pages.splice(i, 1);
    project.pages.splice(j, 0, pg);
    renderPreview(); touch();
  }

  function deletePage(id) {
    if (project.pages.length === 1) { toast('A document needs at least one page.'); return; }
    const pg = pageById(id);
    const hasStuff = pg.type === 'content' && (pg.attachments.length || (pg.html || '').replace(/<[^>]+>/g, '').trim());
    if (hasStuff) {
      askConfirm(`Delete page ${pageIndex(id) + 1}? Its text and attachments will be removed.`, 'Delete page').then((ok) => ok && removePage(id));
      return;
    }
    removePage(id);
  }

  function removePage(id) {
    const i = pageIndex(id);
    if (i < 0) return;
    project.pages.splice(i, 1);
    if (currentId === id) currentId = project.pages[Math.min(i, project.pages.length - 1)].id;
    renderPreview(); renderEditor(); touch();
  }

  function duplicatePage(id) {
    const copy = clone(pageById(id));
    copy.id = uid('pg');
    (copy.attachments || []).forEach((a) => (a.id = uid('att')));
    insertPages([copy], id);
  }

  /* ------------------------------------------------------------------ editor panel */
  function bgOptions(pg) {
    const opts = bgList().filter((b) => b.orientation === pg.orientation);
    const cur = pg.bg === 'none' ? 'none' : (bgById(pg.bg)?.orientation === pg.orientation ? pg.bg : pg.orientation);
    return opts.map((b) => `<option value="${esc(b.id)}" ${b.id === cur ? 'selected' : ''}>${esc(b.name)}${b.src ? '' : ' (no image yet)'}</option>`).join('') +
      `<option value="none" ${cur === 'none' ? 'selected' : ''}>None (plain white)</option>`;
  }

  function setupBanner() {
    return templateIsEmpty()
      ? `<div class="setup-banner"><b>Start here:</b> set up your template — cover, portrait and landscape backgrounds.
         <button class="btn sm primary" id="openTplFromBanner">Set up template</button>
         <span class="muted">or import a ready-made <code>.template.json</code> from your coordinator.</span></div>`
      : '';
  }

  function renderEditor() {
    const pg = current();
    const ed = $('#editor');
    if (!pg) { ed.textContent = ''; return; }
    const n = pageIndex(pg.id) + 1;
    if (pg.type === 'cover') return renderCoverEditor(ed, n);

    ed.innerHTML = `
      ${setupBanner()}
      <h3>Page ${n}</h3>
      <div class="row">
        <div class="seg" id="orient">
          <button data-o="portrait" class="${pg.orientation === 'portrait' ? 'on' : ''}"><span class="ico-p"></span>Portrait</button>
          <button data-o="landscape" class="${pg.orientation === 'landscape' ? 'on' : ''}"><span class="ico-l"></span>Landscape</button>
        </div>
      </div>
      <div class="row">
        <span class="field-label">Background</span>
        <select id="bgSel">${bgOptions(pg)}</select>
        <button class="btn sm" id="bgApply" title="Give the same background to every following ${pg.orientation} page">Use for following pages</button>
      </div>
      <p class="hint warn" id="edWarn"></p>

      <h3>Text</h3>
      <div class="rt-toolbar" id="rtBar">
        <select data-cmd="formatBlock" title="Paragraph style">
          <option value="P">Normal</option><option value="H1">Heading 1</option><option value="H2">Heading 2</option><option value="H3">Heading 3</option>
        </select>
        <select data-cmd="fontSize" title="Font size">
          <option value="">Size</option><option value="1">8</option><option value="2">10</option><option value="3">12</option>
          <option value="4">14</option><option value="5">18</option><option value="6">24</option><option value="7">36</option>
        </select>
        <span class="sep"></span>
        <button data-cmd="bold" title="Bold (Ctrl+B)"><b>B</b></button>
        <button data-cmd="italic" title="Italic (Ctrl+I)"><i>I</i></button>
        <button data-cmd="underline" title="Underline (Ctrl+U)"><u>U</u></button>
        <input type="color" data-cmd="foreColor" value="#000000" title="Text color">
        <span class="sep"></span>
        <button data-cmd="justifyLeft" title="Align left">⯇</button>
        <button data-cmd="justifyCenter" title="Center">≡</button>
        <button data-cmd="justifyRight" title="Align right">⯈</button>
        <button data-cmd="justifyFull" title="Justify">☰</button>
        <span class="sep"></span>
        <button data-cmd="insertUnorderedList" title="Bullets">• List</button>
        <button data-cmd="insertOrderedList" title="Numbering">1. List</button>
        <button data-cmd="outdent" title="Decrease indent">⇤</button>
        <button data-cmd="indent" title="Increase indent">⇥</button>
        <span class="sep"></span>
        <button data-cmd="table" title="Insert table">Table</button>
        <button data-cmd="removeFormat" title="Clear formatting">⌫ Format</button>
        <div class="tbl-bar" id="tblBar" hidden>
          <span class="tbl-label">Table:</span>
          <button data-t="rowAbove" title="Insert row above">+ Row ↑</button>
          <button data-t="rowBelow" title="Insert row below">+ Row ↓</button>
          <button data-t="colLeft" title="Insert column left">+ Col ←</button>
          <button data-t="colRight" title="Insert column right">+ Col →</button>
          <span class="sep"></span>
          <button data-t="delRow" title="Delete this row">− Row</button>
          <button data-t="delCol" title="Delete this column">− Col</button>
          <button data-t="equal" title="Make all columns the same width">Equal widths</button>
          <button data-t="delTable" class="danger" title="Delete the whole table">Delete table</button>
        </div>
      </div>
      <div class="rt-editor" id="rtEditor" contenteditable="true" spellcheck="true"
           data-placeholder="Type the title, description, notes… (you can also paste from Word)"></div>
      <p class="hint">Text goes on top; attachments fill the rest of the page automatically.</p>

      <h3 id="attHead">Attachments (${pg.attachments.length})</h3>
      <div class="dropzone" id="dropzone">Drop photos or PDF here, <u>click to browse</u>, or paste a screenshot (Ctrl+V)</div>
      <div class="row" style="margin-top:10px">
        <span class="field-label">Layout</span>
        <select id="layoutSel">${LAYOUTS.map(([v, l]) => `<option value="${v}" ${pg.layout === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="field-label">Fit</span>
        <select id="fitSel">
          <option value="contain" ${pg.fit !== 'cover' ? 'selected' : ''}>Whole picture</option>
          <option value="cover" ${pg.fit === 'cover' ? 'selected' : ''}>Fill box (crop)</option>
        </select>
      </div>
      ${pg.layout === 'free' ? `<div class="free-hint">
          <b>Manual layout:</b> drag pictures in the preview to move them; drag a corner to resize.
          Hold <b>Shift</b> to stretch, <b>Alt</b> to turn off snapping. Arrow keys nudge the selected picture.
          ◀ ▶ below send a picture back / bring it to the front.
          <div style="margin-top:6px"><button class="btn sm" id="freeReset">Reset arrangement</button></div>
        </div>` : ''}
      <div class="att-list" id="attList"></div>
      ${pg.attachments.length > 1 && pg.layout !== 'free' ? '<p class="hint">Drag thumbnails to reorder. ⟳ rotates a sideways photo. ⇲ moves it to its own page.</p>' : ''}
      <p class="hint">Titles and captions: <b>Ctrl+B</b> bold, <b>Ctrl+I</b> italic, <b>Ctrl+U</b> underline, Enter = new line.</p>

      <h3>Titles &amp; captions — this page</h3>
      <div class="lbl-set">${['title', 'caption'].map((k) => labelControls(pg, k)).join('')}</div>
      <div class="row" style="margin-top:8px">
        <label class="field-label"><input type="checkbox" id="capChk" ${pg.showCaptions ? 'checked' : ''}> Show captions</label>
        <button class="btn sm" id="lblAll">Use these settings on all pages</button>
      </div>
    `;
    $('#openTplFromBanner', ed)?.addEventListener('click', openTemplateDialog);

    // orientation & background
    $$('#orient button', ed).forEach((b) => b.addEventListener('click', () => {
      if (pg.orientation === b.dataset.o) return;
      pg.orientation = b.dataset.o;
      if (pg.bg !== 'none' && bgById(pg.bg)?.orientation !== pg.orientation) pg.bg = 'default';
      renderPreview(); renderEditor(); touch();
    }));
    $('#bgSel', ed).addEventListener('change', (e) => {
      const v = e.target.value;
      pg.bg = v === pg.orientation ? 'default' : v;
      renderOne(pg.id); renderPageList(); touch();
    });
    $('#bgApply', ed).addEventListener('click', () => {
      let count = 0;
      for (const p of project.pages.slice(pageIndex(pg.id) + 1)) {
        if (p.type === 'content' && p.orientation === pg.orientation) { p.bg = pg.bg; count++; }
      }
      renderPreview(); touch();
      toast(count ? `Applied to ${count} following ${pg.orientation} page(s)` : `No ${pg.orientation} pages after this one`);
    });

    // rich text
    const rte = $('#rtEditor', ed);
    rte.innerHTML = pg.html || '';
    let typingTimer = null;
    rte.addEventListener('input', () => {
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => { pg.html = sanitize(rte.innerHTML); renderOne(pg.id); touch(); }, 180);
    });
    rte.addEventListener('blur', () => { pg.html = sanitize(rte.innerHTML); renderOne(pg.id); renderPageList(); touch(); });
    rte.addEventListener('paste', async (e) => {
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); await addAttachments(pg, files); toast('Picture added to attachments'); return; }
      const html = e.clipboardData?.getData('text/html');
      if (html) { e.preventDefault(); document.execCommand('insertHTML', false, sanitize(html)); }
    });
    try { document.execCommand('styleWithCSS', false, false); } catch (_) { /* old browsers */ }
    const bar = $('#rtBar', ed);
    bar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    wireTableTools(rte, $('#tblBar', ed));
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-cmd]'); if (!b) return;
      rte.focus();
      if (b.dataset.cmd === 'table') return insertTable();
      document.execCommand(b.dataset.cmd, false, null);
      rte.dispatchEvent(new Event('input'));
    });
    $$('select, input[type=color]', bar).forEach((s) => s.addEventListener('change', () => {
      if (!s.value) return;
      rte.focus();
      document.execCommand(s.dataset.cmd, false, s.dataset.cmd === 'formatBlock' ? `<${s.value}>` : s.value);
      if (s.dataset.cmd === 'fontSize') s.value = '';
      rte.dispatchEvent(new Event('input'));
    }));
    function insertTable() {
      // remember where the cursor was, the dialog takes the focus away
      const sel = window.getSelection();
      const range = sel.rangeCount && rte.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
      const m = modal('Insert table', `
        <div class="row"><span class="field-label">Rows</span><input type="number" id="tRows" min="1" max="40" value="3">
          <span class="field-label">Columns</span><input type="number" id="tCols" min="1" max="12" value="3"></div>
        <div class="row"><label class="field-label"><input type="checkbox" id="tHead" checked> First row is a header</label></div>`,
        [['Cancel'], ['Insert', 'primary', (back) => {
          const rows = Math.min(40, Math.max(1, +$('#tRows', back).value || 1));
          const cols = Math.min(12, Math.max(1, +$('#tCols', back).value || 1));
          const head = $('#tHead', back).checked;
          let t = '<table style="table-layout:fixed;width:100%"><colgroup>' +
            `<col style="width:${(100 / cols).toFixed(2)}%">`.repeat(cols) + '</colgroup><tbody>';
          for (let r = 0; r < rows; r++) { t += '<tr>'; for (let c = 0; c < cols; c++) t += r === 0 && head ? '<th><br></th>' : '<td><br></td>'; t += '</tr>'; }
          t += '</tbody></table><p><br></p>';
          rte.focus();
          const s = window.getSelection();
          if (range) { s.removeAllRanges(); s.addRange(range); }
          document.execCommand('insertHTML', false, t);
          rte.dispatchEvent(new Event('input'));
        }]]);
      $('#tRows', m).select();
    }

    // attachments
    const dz = $('#dropzone', ed);
    dz.addEventListener('click', () => pickFiles('#fileAttach', (files) => addAttachments(pg, files)));
    wireDrop(dz, (files) => addAttachments(pg, files));
    $('#layoutSel', ed).addEventListener('change', (e) => {
      const v = e.target.value;
      if (v === 'free' && pg.layout !== 'free') boxesFromCurrentLayout(pg);  // start from the current arrangement
      pg.layout = v;
      renderOne(pg.id); renderEditor(); touch();
    });
    $('#freeReset', ed)?.addEventListener('click', () => {
      pg.layout = 'auto'; renderOne(pg.id);
      pg.attachments.forEach((a) => delete a.box);
      boxesFromCurrentLayout(pg);
      pg.layout = 'free'; renderOne(pg.id); touch();
    });
    $('#fitSel', ed).addEventListener('change', (e) => { pg.fit = e.target.value; renderOne(pg.id); touch(); });
    $('#capChk', ed).addEventListener('change', (e) => { pg.showCaptions = e.target.checked; renderOne(pg.id); touch(); });

    // titles & captions style
    $$('.lbl-row', ed).forEach((row) => {
      const k = row.dataset.k;
      const set = (p, v) => {
        pg.labels = cleanLabels({ ...labelStyle(pg), [k]: { ...labelStyle(pg)[k], [p]: v } });
        renderOne(pg.id); touch();
      };
      $$('select, input[type=color]', row).forEach((s) => s.addEventListener('input', () => set(s.dataset.p, s.dataset.p === 'size' ? +s.value : s.value)));
      $$('button[data-p]', row).forEach((b) => b.addEventListener('click', () => {
        const on = !b.classList.contains('on');
        b.classList.toggle('on', on);
        set(b.dataset.p, on);
      }));
    });
    $('#lblAll', ed).addEventListener('click', () => {
      const L = cleanLabels(labelStyle(pg));
      project.pages.forEach((p) => { if (p.type === 'content') { p.labels = clone(L); p.showCaptions = pg.showCaptions; } });
      renderPreview(); touch();
      toast('Title & caption settings applied to all pages');
    });
    renderAttachmentList(pg);
    refreshEditorWarning();
  }

  function labelControls(pg, k) {
    const s = labelStyle(pg)[k];
    const sizes = [7, 8, 9, 9.5, 10, 11, 12, 14, 16, 18, 20, 24];
    if (!sizes.includes(s.size)) sizes.push(s.size), sizes.sort((x, y) => x - y);
    return `<div class="lbl-row row" data-k="${k}">
      <span class="lbl-name">${k === 'title' ? 'Title' : 'Caption'}</span>
      <select data-p="pos" title="Where to put it">${LABEL_POS.map(([v, l]) => `<option value="${v}" ${s.pos === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select data-p="size" title="Font size (pt)">${sizes.map((z) => `<option value="${z}" ${s.size === z ? 'selected' : ''}>${z}</option>`).join('')}</select>
      <button class="tog ${s.bold ? 'on' : ''}" data-p="bold" title="Bold"><b>B</b></button>
      <button class="tog ${s.italic ? 'on' : ''}" data-p="italic" title="Italic"><i>I</i></button>
      <select data-p="align" title="Alignment">${['left', 'center', 'right'].map((v) => `<option value="${v}" ${s.align === v ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select>
      <input type="color" data-p="color" value="${s.color}" title="Color">
    </div>`;
  }

  /* ------------------------------------------------------------------ table editing */
  const cellSpan = (c) => +c.getAttribute('colspan') || 1;
  const rowCols = (tr) => Array.from(tr.cells).reduce((s, c) => s + cellSpan(c), 0);
  /** The cell of a row that covers visual column `idx`. */
  function cellAtCol(tr, idx) {
    let x = 0;
    for (const c of Array.from(tr.cells)) { if (idx < x + cellSpan(c)) return c; x += cellSpan(c); }
    return null;
  }
  /** Visual column index of a cell (its first column). */
  function colOfCell(td) {
    let x = 0;
    for (const c of Array.from(td.parentElement.cells)) { if (c === td) return x; x += cellSpan(c); }
    return x;
  }
  /** Make sure the table has a <colgroup> with % widths (measured from how it looks now). */
  function ensureColgroup(table) {
    const n = Math.max(...Array.from(table.rows).map(rowCols));
    let cg = table.querySelector('colgroup');
    if (cg && cg.children.length === n) return cg;
    const ref = Array.from(table.rows).find((r) => r.cells.length === n) || table.rows[0];
    const ws = [];
    Array.from(ref.cells).forEach((c) => { const w = c.getBoundingClientRect().width / cellSpan(c); for (let k = 0; k < cellSpan(c); k++) ws.push(w || 1); });
    while (ws.length < n) ws.push(ws[ws.length - 1] || 1);
    cg?.remove();
    cg = document.createElement('colgroup');
    ws.forEach(() => cg.appendChild(document.createElement('col')));
    table.insertBefore(cg, table.firstChild);
    setColWidths(table, ws);
    return cg;
  }
  function getColWidths(table) {
    return Array.from(ensureColgroup(table).children).map((c) => parseFloat(c.style.width) || 1);
  }
  function setColWidths(table, ws) {
    const total = ws.reduce((a, b) => a + b, 0) || 1;
    Array.from(table.querySelector('colgroup').children).forEach((c, i) => (c.style.width = (ws[i] / total * 100).toFixed(2) + '%'));
    table.style.tableLayout = 'fixed'; table.style.width = '100%';
  }
  function newCell(likeTh) { const c = document.createElement(likeTh ? 'th' : 'td'); c.innerHTML = '<br>'; return c; }
  function placeCaret(el) {
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(true);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  function wireTableTools(rte, bar) {
    let cell = null;
    const currentCell = () => {
      const s = window.getSelection();
      const n = s.rangeCount ? s.anchorNode : null;
      const el = n && (n.nodeType === 1 ? n : n.parentElement);
      const c = el?.closest?.('td, th');
      return c && rte.contains(c) ? c : null;
    };
    const update = () => {
      if (!rte.isConnected) return document.removeEventListener('selectionchange', update);
      const c = currentCell();
      if (c) cell = c;
      if (document.activeElement === rte || bar.contains(document.activeElement)) bar.hidden = !c;
    };
    document.addEventListener('selectionchange', update);
    bar.addEventListener('mousedown', (e) => e.preventDefault());  // keep the cursor in the table
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-t]');
      if (!b || !cell || !rte.contains(cell)) return;
      const table = cell.closest('table'), tr = cell.parentElement, col = colOfCell(cell);
      const act = b.dataset.t;
      if (act === 'rowAbove' || act === 'rowBelow') {
        const nr = document.createElement('tr');
        const asTh = act === 'rowAbove' && Array.from(tr.cells).every((c) => c.tagName === 'TH');
        Array.from(tr.cells).forEach((c) => { const x = newCell(asTh); if (cellSpan(c) > 1) x.setAttribute('colspan', cellSpan(c)); nr.appendChild(x); });
        tr.parentElement.insertBefore(nr, act === 'rowAbove' ? tr : tr.nextSibling);
        placeCaret(nr.cells[Math.min(nr.cells.length - 1, Array.from(tr.cells).indexOf(cell))]);
      } else if (act === 'colLeft' || act === 'colRight') {
        const ws = getColWidths(table);
        const at = act === 'colLeft' ? col : col + cellSpan(cell) - 1;
        for (const r of Array.from(table.rows)) {
          const c = cellAtCol(r, at); if (!c) continue;
          const x = newCell(c.tagName === 'TH');
          r.insertBefore(x, act === 'colLeft' ? c : c.nextSibling);
        }
        const half = ws[at] / 2; ws[at] = half; ws.splice(act === 'colLeft' ? at : at + 1, 0, half);
        const cg = table.querySelector('colgroup'); cg.appendChild(document.createElement('col'));
        setColWidths(table, ws);
      } else if (act === 'delRow') {
        const next = tr.nextElementSibling || tr.previousElementSibling;
        tr.remove();
        if (!table.rows.length) table.remove(); else if (next) placeCaret(next.cells[0]);
      } else if (act === 'delCol') {
        const ws = getColWidths(table);
        for (const r of Array.from(table.rows)) {
          const c = cellAtCol(r, col); if (!c) continue;
          if (cellSpan(c) > 1) c.setAttribute('colspan', cellSpan(c) - 1); else c.remove();
        }
        ws.splice(col, 1);
        table.querySelector('colgroup').lastElementChild?.remove();
        if (!ws.length || !table.rows[0]?.cells.length) table.remove();
        else {
          setColWidths(table, ws);
          if (tr.cells.length) placeCaret(cellAtCol(tr, Math.min(col, rowCols(tr) - 1)) || tr.cells[0]);
        }
      } else if (act === 'equal') {
        setColWidths(table, getColWidths(table).map(() => 1));
      } else if (act === 'delTable') {
        table.remove(); bar.hidden = true; cell = null;
      }
      const now = currentCell();  // the cell may have been removed: follow the cursor
      cell = now;
      if (!now) bar.hidden = true;
      rte.dispatchEvent(new Event('input'));
    });

    // drag a column border to resize it
    const EDGE = 5;
    let drag = null;
    const edgeAt = (e) => {
      const td = e.target.closest?.('td, th');
      if (!td || !rte.contains(td)) return null;
      const r = td.getBoundingClientRect();
      const table = td.closest('table');
      const last = colOfCell(td) + cellSpan(td) >= Math.max(...Array.from(table.rows).map(rowCols));
      if (!last && r.right - e.clientX <= EDGE) return { table, col: colOfCell(td) + cellSpan(td) - 1 };
      if (colOfCell(td) > 0 && e.clientX - r.left <= EDGE) return { table, col: colOfCell(td) - 1 };
      return null;
    };
    rte.addEventListener('mousemove', (e) => { if (!drag) rte.style.cursor = edgeAt(e) ? 'col-resize' : ''; });
    rte.addEventListener('mousedown', (e) => {
      const hit = edgeAt(e); if (!hit) return;
      e.preventDefault();
      const ws = getColWidths(hit.table);
      drag = { ...hit, ws, x: e.clientX, w: hit.table.getBoundingClientRect().width };
      const move = (ev) => {
        const d = (ev.clientX - drag.x) / drag.w * 100;
        const a = drag.ws[drag.col], b = drag.ws[drag.col + 1];
        const nd = Math.max(3 - a, Math.min(b - 3, d));  // keep both columns at least 3% wide
        const ws2 = drag.ws.slice(); ws2[drag.col] = a + nd; ws2[drag.col + 1] = b - nd;
        setColWidths(drag.table, ws2);
      };
      const up = () => {
        document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
        drag = null; rte.style.cursor = '';
        rte.dispatchEvent(new Event('input'));
      };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });
  }

  /** Small one-field rich text (bold / italic / underline) for titles and captions. */
  function miniEditor(el, get, setVal) {
    el.innerHTML = get() || '';
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }
      if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        document.execCommand({ b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()]);
        el.dispatchEvent(new Event('input'));
      }
    });
    el.addEventListener('input', () => setVal(sanitizeInline(el.innerHTML)));
    el.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
  }

  function refreshEditorWarning() {
    const w = $('#edWarn'); if (!w) return;
    const msg = warnings.get(currentId);
    w.textContent = msg ? '⚠ ' + msg : '';
  }

  function renderAttachmentList(pg) {
    const list = $('#attList'); if (!list) return;
    list.textContent = '';
    pg.attachments.forEach((a, i) => {
      const d = document.createElement('div');
      const free = pg.layout === 'free';
      d.className = 'att' + (activeFree && activeFree.pageId === pg.id && activeFree.i === i ? ' active' : '');
      d.innerHTML = `<div class="thumb" draggable="true" title="Drag to reorder" style="background-image:url('${srcOf(a.src)}')"></div>
        <div class="mini-rt" contenteditable="true" data-f="title" data-ph="Title"></div>
        <div class="mini-rt" contenteditable="true" data-f="caption" data-ph="Caption"></div>
        <div class="att-actions">
          <span><button class="icon-btn" data-a="left" title="${free ? 'Send backward' : 'Move earlier'}">◀</button><button class="icon-btn" data-a="right" title="${free ? 'Bring forward' : 'Move later'}">▶</button></span>
          <span><button class="icon-btn" data-a="rot" title="Rotate 90°">⟳</button><button class="icon-btn" data-a="new" title="Move to its own new page">⇲</button><button class="icon-btn danger" data-a="del" title="Remove">✕</button></span>
        </div>`;
      $$('.mini-rt', d).forEach((el) => miniEditor(el, () => a[el.dataset.f], (v) => {
        a[el.dataset.f] = v; renderOne(pg.id); touch();
      }));
      d.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        const act = b.dataset.a;
        if (act === 'left' && i > 0) [pg.attachments[i - 1], pg.attachments[i]] = [pg.attachments[i], pg.attachments[i - 1]];
        else if (act === 'right' && i < pg.attachments.length - 1) [pg.attachments[i + 1], pg.attachments[i]] = [pg.attachments[i], pg.attachments[i + 1]];
        else if (act === 'del') pg.attachments.splice(i, 1);
        else if (act === 'rot') {
          const im = images.get(a.src); if (!im) return;
          b.disabled = true;
          const r = await normalizeImage(im.blob, 90);
          a.src = await storeImage(r.blob);
          a.ar = r.w / r.h;
          if (a.box) a.box = boxForAspect(pg, a, a.box.w, a.box.x + a.box.w / 2, a.box.y + a.box.h / 2);
        } else if (act === 'new') {
          const [moved] = pg.attachments.splice(i, 1);
          delete moved.box;
          const np = makePage('content', pg.orientation, pg.bg);
          np.attachments.push(moved);
          insertPages([np], pg.id);
          return;
        } else return;
        renderOne(pg.id); renderAttachmentList(pg); renderPageList(); touch();
      });
      $('.thumb', d).addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/att', String(i)); e.stopPropagation(); });
      d.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/att')) { e.preventDefault(); d.classList.add('drag-over'); } });
      d.addEventListener('dragleave', () => d.classList.remove('drag-over'));
      d.addEventListener('drop', (e) => {
        d.classList.remove('drag-over');
        const from = e.dataTransfer.getData('text/att'); if (from === '') return;
        e.preventDefault(); e.stopPropagation();
        const [it] = pg.attachments.splice(+from, 1);
        pg.attachments.splice(i, 0, it);
        renderOne(pg.id); renderAttachmentList(pg); touch();
      });
      list.appendChild(d);
    });
    const h = $('#attHead'); if (h) h.textContent = `Attachments (${pg.attachments.length})`;
  }

  function renderCoverEditor(ed, n) {
    const src = srcOf(project.template.cover);
    ed.innerHTML = `
      ${setupBanner()}
      <h3>Page ${n} — Cover</h3>
      <div class="cover-single">
        ${src ? `<img alt="" src="${esc(src)}">` : '<div class="cover-ph">No cover image</div>'}
        <div>
          <button class="btn sm" id="coverChange">${src ? 'Change cover image…' : 'Add cover image…'}</button>
          <p class="hint">One cover per document. It is a full-page picture with no background around it.
          It is saved in the template, so it comes along when you share the template.</p>
        </div>
      </div>`;
    $('#openTplFromBanner', ed)?.addEventListener('click', openTemplateDialog);
    $('#coverChange', ed).addEventListener('click', () => pickFiles('#fileImage', async ([f]) => {
      project.template.cover = (await importImageFile(f, 3000)).id;
      renderPreview(); renderEditor(); touch();
    }));
  }

  /* ------------------------------------------------------------------ adding things */
  function pickFiles(sel, cb) {
    const inp = $(sel);
    inp.value = '';
    inp.onchange = () => { const f = Array.from(inp.files || []); if (f.length) cb(f); };
    inp.click();
  }

  function wireDrop(el, cb) {
    el.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); el.classList.add('hover'); } });
    el.addEventListener('dragleave', () => el.classList.remove('hover'));
    el.addEventListener('drop', (e) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault(); e.stopPropagation(); el.classList.remove('hover');
      cb(Array.from(e.dataTransfer.files));
    });
  }

  /** Images go on the page; each PDF page becomes its own new page. */
  async function addAttachments(pg, files) {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    const pdfs = files.filter(isPdf);
    if (!imgs.length && !pdfs.length) return toast('Only pictures (JPG/PNG…) and PDF files can be attached.');
    let done = 0;
    for (const f of imgs) {
      try {
        const { id, w, h } = await importImageFile(f);
        const a = { id: uid('att'), src: id, title: '', caption: '', ar: w / h };
        if (pg.layout === 'free') placeNew(pg, a);
        pg.attachments.push(a);
        done++;
      } catch (e) { console.error(e); toast(`Could not read ${f.name}`); }
    }
    if (done) { renderOne(pg.id); if (currentId === pg.id) renderAttachmentList(pg); renderPageList(); touch(); }
    for (const f of pdfs) await addPdfPages(f, pg.id);
  }

  async function addPdfPages(file, afterId) {
    const created = [];
    const t = toast(`Reading ${file.name}…`, 0);
    try {
      await importPdf(file, ({ id, w, h, page, total }) => {
        t.textContent = `Reading ${file.name}: page ${page} of ${total}…`;
        const np = makePage('content', w > h ? 'landscape' : 'portrait');
        np.layout = '1'; np.showCaptions = false;
        np.attachments.push({ id: uid('att'), src: id, title: '', caption: esc(`${baseName(file)} – p. ${page}`), ar: w / h });
        created.push(np);
      });
    } catch (e) {
      console.error(e); toast(`Could not read ${file.name}: ${e.message}`);
    } finally { t.remove(); }
    if (created.length) { insertPages(created, afterId); toast(`Added ${created.length} page(s) from ${file.name}`); }
  }

  function openPhotosDialog(files) {
    const m = modal('Add photos — pages are made for you', `
      <p style="margin-top:0">${files.length} photo(s) selected.</p>
      <div class="row"><span class="field-label">Photos per page</span>
        <select id="perPage"><option>1</option><option>2</option><option>3</option><option selected>4</option><option>6</option><option>9</option></select></div>
      <div class="row"><span class="field-label">Orientation</span>
        <select id="ori"><option value="portrait">Portrait</option><option value="landscape">Landscape</option><option value="auto">Auto (1 per page: follow each photo)</option></select></div>
      <div class="row"><label class="field-label"><input type="checkbox" id="fnCap"> Use file names as captions</label></div>
      <div class="row"><span class="field-label">Title on each page (optional)</span><input type="text" id="ttl" style="flex:1" placeholder="e.g. Culminating activities"></div>`,
      [['Cancel'], ['Add pages', 'primary', async () => {
        const per = +$('#perPage', m).value, ori = $('#ori', m).value, fn = $('#fnCap', m).checked, ttl = $('#ttl', m).value.trim();
        const t = toast('Adding photos…', 0);
        const pages = [];
        let pg = null;
        for (let i = 0; i < files.length; i++) {
          t.textContent = `Adding photo ${i + 1} of ${files.length}…`;
          let info;
          try { info = await importImageFile(files[i]); } catch (e) { toast(`Could not read ${files[i].name}`); continue; }
          if (!pg || pg.attachments.length >= per) {
            const o = ori === 'auto' ? (per === 1 && info.w > info.h ? 'landscape' : 'portrait') : ori;
            pg = makePage('content', o);
            pg.layout = { 1: '1', 2: o === 'landscape' ? '2h' : '2v', 3: o === 'landscape' ? '3h' : 'auto', 4: '4', 6: '6', 9: '9' }[per];
            if (ttl) pg.html = `<p><b>${esc(ttl)}</b></p>`;
            pages.push(pg);
          }
          pg.attachments.push({ id: uid('att'), src: info.id, title: '', caption: fn ? esc(baseName(files[i])) : '', ar: info.w / info.h });
        }
        t.remove();
        if (pages.length) { insertPages(pages); toast(`Added ${pages.length} page(s)`); }
      }]]);
  }

  function openSpecialDialog() {
    const list = specialBgs();
    if (!list.length) {
      modal('Special pages', `<p style="margin-top:0">You have no special backgrounds yet.</p>
        <p class="hint">Special backgrounds are extra page designs (for example a divider page, a certificate frame, or a
        different header for one section). Add them in <b>Template → Backgrounds</b>.</p>`,
        [['Close'], ['Open Template', 'primary', () => { setTimeout(openTemplateDialog, 0); }]]);
      return;
    }
    const m = modal('Add a special page', `<div class="special-grid">${list.map((b) => `
        <button class="special-opt" data-id="${esc(b.id)}">
          <div class="sp-thumb ${b.orientation === 'landscape' ? 'l' : 'p'}" style="background-image:url('${srcOf(b.src)}')"></div>
          <div>${esc(b.name)}</div><div class="muted">${b.orientation}</div>
        </button>`).join('')}</div>`, [['Cancel']]);
    $$('.special-opt', m).forEach((b) => b.addEventListener('click', () => {
      const bg = bgById(b.dataset.id);
      m.remove();
      insertPages([makePage('content', bg.orientation, bg.id)]);
    }));
  }

  function addFromButton(kind) {
    if (kind === 'portrait' || kind === 'landscape') return insertPages([makePage('content', kind)]);
    if (kind === 'special') return openSpecialDialog();
    if (kind === 'cover') {
      const c = project.pages.find((p) => p.type === 'cover');
      if (c) { select(c.id); return toast('This document already has its cover (page 1).'); }
      const pg = makePage('cover');
      project.pages.unshift(pg);
      currentId = pg.id;
      renderPreview(); renderEditor(); touch();
      if (!project.template.cover) toast('Now add the cover image.');
      return;
    }
    if (kind === 'photos') return pickFiles('#filePhotos', openPhotosDialog);
    if (kind === 'pdf') return pickFiles('#filePdf', async (files) => { let after = currentId; for (const f of files) { await addPdfPages(f, after); after = currentId; } });
  }

  /* ------------------------------------------------------------------ modal / toast */
  function modal(title, bodyHtml, buttons = [['Close']]) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><header><span>${esc(title)}</span><button class="icon-btn" data-x>✕</button></header>
      <div class="body">${bodyHtml}</div><footer></footer></div>`;
    const close = () => back.remove();
    const foot = $('footer', back);
    buttons.forEach(([label, cls, fn]) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (cls || '');
      b.textContent = label;
      b.addEventListener('click', async () => { if (fn) { const keep = await fn(back); if (keep === true) return; } close(); });
      foot.appendChild(b);
    });
    $('[data-x]', back).addEventListener('click', close);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    $('#modalRoot').appendChild(back);
    return back;
  }

  function askConfirm(message, okLabel = 'OK') {
    return new Promise((resolve) => {
      let answered = false;
      const m = modal('Please confirm', `<p style="margin:0">${esc(message)}</p>`,
        [['Cancel', '', () => { answered = true; resolve(false); }], [okLabel, 'primary', () => { answered = true; resolve(true); }]]);
      new MutationObserver((_, obs) => { if (!m.isConnected) { obs.disconnect(); if (!answered) resolve(false); } })
        .observe($('#modalRoot'), { childList: true });
    });
  }

  function toast(msg, ms = 3200) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    $('#toasts').appendChild(t);
    if (ms) setTimeout(() => t.remove(), ms);
    return t;
  }

  /* ------------------------------------------------------------------ template settings */
  function openTemplateDialog() {
    const T = clone(project.template);
    const pnum = clone(project.pageNumbers);
    let paper = project.paper;
    const m = modal('Template', '<div id="tplBody"></div>', [
      ['Export template…', '', () => { exportTemplate(T); return true; }],
      ['Import template…', '', () => {
        pickFiles('#fileOpen', async ([f]) => {
          try { const t = await readTemplateFile(f); Object.keys(T).forEach((k) => delete T[k]); Object.assign(T, t); draw(); toast('Template loaded — click Apply'); }
          catch (e) { toast(e.message); }
        });
        return true;
      }],
      ['Cancel'],
      ['Apply', 'primary', async (back) => {
        // pages that used a deleted background fall back to the default one
        const ids = new Set(T.backgrounds.map((b) => b.id));
        project.pages.forEach((p) => { if (p.type === 'content' && p.bg !== 'default' && p.bg !== 'none' && !ids.has(p.bg)) p.bg = 'default'; });
        project.template = T; project.pageNumbers = pnum; project.paper = paper;
        if ($('#asDefault', back).checked) { defaultTemplate = clone(T); await DB.put('kv', 'defaultTemplate', defaultTemplate); toast('Saved as default for new documents'); }
        renderPreview(); renderEditor(); touch();
      }]
    ]);
    const body = $('#tplBody', m);

    function bgRow(b, i) {
      const fixed = b.id === 'portrait' || b.id === 'landscape';
      const mm = b.margins;
      return `<div class="bg-row">
        <div class="tpl-thumb ${b.orientation === 'landscape' ? 'l' : 'p'}" style="background-image:url('${srcOf(b.src)}')">${b.src ? '' : '<span>No image</span>'}</div>
        <div class="bg-fields">
          <div class="row">
            ${fixed ? `<b>${esc(b.name)}</b> <span class="muted">(default for ${b.orientation} pages)</span>`
                    : `<input type="text" data-name="${i}" value="${esc(b.name)}" placeholder="Name, e.g. Section divider">
                       <select data-ori="${i}"><option value="portrait" ${b.orientation === 'portrait' ? 'selected' : ''}>Portrait</option><option value="landscape" ${b.orientation === 'landscape' ? 'selected' : ''}>Landscape</option></select>`}
          </div>
          <div class="row">
            <button class="btn sm" data-img="${i}">${b.src ? 'Change image…' : 'Add image…'}</button>
            ${b.src ? `<button class="btn sm" data-noimg="${i}">Remove image</button>` : ''}
            ${fixed ? '' : `<button class="btn sm danger" data-delbg="${i}">Delete</button>`}
          </div>
          <div class="margins" title="Safe area: text and pictures stay inside these margins (inches)">
            ${['top', 'bottom', 'left', 'right'].map((s) => `<label>${s[0].toUpperCase() + s.slice(1)}</label><input type="number" step="0.05" min="0" max="5" data-m="${i}.${s}" value="${mm[s]}">`).join('')}
          </div>
        </div>
      </div>`;
    }

    function draw() {
      body.innerHTML = `
        <div class="row"><span class="field-label">Template name</span><input type="text" id="tplName" style="flex:1" value="${esc(T.name)}"></div>
        <div class="row"><span class="field-label">Paper</span>
          <select id="paperSel">${Object.entries(D.paperSizes).map(([k, v]) => `<option value="${k}" ${k === paper ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>

        <h4>Cover (one per document)</h4>
        <div class="bg-row">
          <div class="tpl-thumb p" style="background-image:url('${srcOf(T.cover)}')">${T.cover ? '' : '<span>No cover</span>'}</div>
          <div class="bg-fields"><div class="row">
            <button class="btn sm" id="coverImg">${T.cover ? 'Change cover…' : 'Add cover…'}</button>
            ${T.cover ? '<button class="btn sm" id="coverDel">Remove cover</button>' : ''}
          </div><p class="hint">A full-page picture used as page 1.</p></div>
        </div>

        <h4>Backgrounds</h4>
        <p class="hint" style="margin-top:-4px">The margins are the <b>safe area</b> in inches — text and pictures stay inside so they never cover the banner or logos.</p>
        ${T.backgrounds.map(bgRow).join('')}
        <button class="btn sm" id="addBg">+ Add special background</button>
        <p class="hint">Special backgrounds are extra page designs (divider, certificate frame, another header…). Choose them per page.</p>

        <h4>Page numbers</h4>
        <div class="row"><label><input type="checkbox" id="pnOn" ${pnum.enabled ? 'checked' : ''}> Show page numbers</label>
          <select id="pnAlign">${['left', 'center', 'right'].map((a) => `<option ${pnum.align === a ? 'selected' : ''}>${a}</option>`).join('')}</select>
          <span class="field-label">from bottom (in)</span><input type="number" id="pnBottom" step="0.05" value="${pnum.bottom}">
          <span class="field-label">start at</span><input type="number" id="pnStart" min="1" value="${pnum.start}"></div>
        <div class="row"><label><input type="checkbox" id="pnSkip" ${pnum.skipCovers ? 'checked' : ''}> Don’t number the cover</label></div>

        <h4>Share</h4>
        <label class="row"><input type="checkbox" id="asDefault"> Also use this template for new documents on this computer</label>
        <p class="hint">“Export template” saves one file (cover + backgrounds + margins) that you can send to others so everyone uses the same look.</p>`;

      $('#tplName', body).oninput = (e) => (T.name = e.target.value);
      $('#paperSel', body).onchange = (e) => (paper = e.target.value);
      $('#coverImg', body).onclick = () => pickFiles('#fileImage', async ([f]) => { T.cover = (await importImageFile(f, 3000)).id; draw(); });
      $('#coverDel', body) && ($('#coverDel', body).onclick = () => { T.cover = ''; draw(); });
      $$('[data-m]', body).forEach((i) => (i.oninput = () => { const [k, s] = i.dataset.m.split('.'); T.backgrounds[+k].margins[s] = Math.max(0, parseFloat(i.value) || 0); }));
      $$('[data-img]', body).forEach((b) => (b.onclick = () => pickFiles('#fileImage', async ([f]) => { T.backgrounds[+b.dataset.img].src = (await importImageFile(f, 3000)).id; draw(); })));
      $$('[data-noimg]', body).forEach((b) => (b.onclick = () => { T.backgrounds[+b.dataset.noimg].src = ''; draw(); }));
      $$('[data-delbg]', body).forEach((b) => (b.onclick = () => { T.backgrounds.splice(+b.dataset.delbg, 1); draw(); }));
      $$('[data-name]', body).forEach((i) => (i.oninput = () => (T.backgrounds[+i.dataset.name].name = i.value)));
      $$('[data-ori]', body).forEach((s) => (s.onchange = () => { T.backgrounds[+s.dataset.ori].orientation = s.value; draw(); }));
      $('#addBg', body).onclick = () => {
        T.backgrounds.push({ id: uid('bg'), name: 'Special ' + (T.backgrounds.length - 1), orientation: 'portrait', src: '', margins: clone(T.backgrounds[0].margins) });
        draw();
        body.querySelector('[data-name]:last-of-type');
      };
      $('#pnOn', body).onchange = (e) => (pnum.enabled = e.target.checked);
      $('#pnAlign', body).onchange = (e) => (pnum.align = e.target.value);
      $('#pnBottom', body).oninput = (e) => (pnum.bottom = parseFloat(e.target.value) || 0);
      $('#pnStart', body).oninput = (e) => (pnum.start = parseInt(e.target.value, 10) || 1);
      $('#pnSkip', body).onchange = (e) => (pnum.skipCovers = e.target.checked);
    }
    draw();
  }

  /* ------------------------------------------------------------------ files: save / open / templates */
  const blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  const dataUrlToBlob = async (u) => (await fetch(u)).blob();

  function download(parts, name, type = 'application/json') {
    const url = URL.createObjectURL(new Blob(parts, { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  const safeName = (s) => (s || 'document').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'document';

  /** JSON with images embedded, built piece by piece so big documents don't run out of memory. */
  async function imagesJsonParts(ids) {
    const parts = ['{'];
    let first = true;
    for (const id of ids) {
      const im = images.get(id); if (!im) continue;
      parts.push((first ? '' : ',') + JSON.stringify(id) + ':"' + (await blobToDataUrl(im.blob)) + '"');
      first = false;
    }
    parts.push('}');
    return parts;
  }

  async function saveProjectFile() {
    const t = toast('Preparing file…', 0);
    try {
      const parts = [`{"format":"${FMT_DOC}","version":2,"project":`, JSON.stringify(project), ',"images":', ...(await imagesJsonParts(referencedImageIds())), '}'];
      download(parts, safeName(project.name) + '.pagesmith.json');
      toast('Saved. Open this file later with “Open”.');
    } finally { t.remove(); }
  }

  async function loadImagesFrom(map) {
    for (const [id, url] of Object.entries(map || {})) {
      if (!isImgId(id) || typeof url !== 'string' || !url.startsWith('data:image/')) continue;
      await storeImage(await dataUrlToBlob(url), id);
    }
  }

  const num = (v, d) => (Number.isFinite(+v) ? Math.max(0, Math.min(10, +v)) : d);
  const okSrc = (s) => (isImgId(s) ? s : '');
  function cleanMargins(m, d) { return { top: num(m?.top, d.top), right: num(m?.right, d.right), bottom: num(m?.bottom, d.bottom), left: num(m?.left, d.left) }; }

  function cleanTemplate(t) {
    t = t || {};
    const defs = D.template.backgrounds;
    const bgs = Array.isArray(t.backgrounds) ? t.backgrounds : [];
    const out = { name: String(t.name || 'Template'), cover: okSrc(t.cover), backgrounds: [] };
    for (const d of defs) {
      const b = bgs.find((x) => x && x.id === d.id) || {};
      out.backgrounds.push({ id: d.id, name: d.name, orientation: d.orientation, src: okSrc(b.src), margins: cleanMargins(b.margins, d.margins) });
    }
    for (const b of bgs) {
      if (!b || b.id === 'portrait' || b.id === 'landscape' || !/^bg_\w+$/.test(String(b.id))) continue;
      out.backgrounds.push({
        id: String(b.id), name: String(b.name || 'Special'), orientation: b.orientation === 'landscape' ? 'landscape' : 'portrait',
        src: okSrc(b.src), margins: cleanMargins(b.margins, defs[0].margins)
      });
    }
    return out;
  }

  function cleanProject(p) {
    const out = {
      format: FMT_DOC, version: 2, name: String(p.name || 'Untitled document'),
      paper: D.paperSizes[p.paper] ? p.paper : 'long',
      pageNumbers: { enabled: false, align: 'right', bottom: 0.3, side: 0.6, skipCovers: true, start: 1, ...(p.pageNumbers || {}) },
      template: cleanTemplate(p.template),
      pages: []
    };
    let cover = false;
    for (const pg of p.pages || []) {
      if (pg.type === 'cover') { if (!cover) out.pages.push({ id: String(pg.id || uid('pg')), type: 'cover' }); cover = true; continue; }
      out.pages.push({
        id: String(pg.id || uid('pg')), type: 'content', orientation: pg.orientation === 'landscape' ? 'landscape' : 'portrait',
        bg: typeof pg.bg === 'string' && /^(default|none|bg_\w+|portrait|landscape)$/.test(pg.bg) ? pg.bg : 'default',
        html: sanitize(pg.html || ''), layout: LAYOUTS.some(([v]) => v === pg.layout) ? pg.layout : 'auto',
        fit: pg.fit === 'cover' ? 'cover' : 'contain', showCaptions: pg.showCaptions !== false,
        labels: cleanLabels(pg.labels),
        attachments: (pg.attachments || []).map((a) => {
          const out = { id: String(a.id || uid('att')), src: okSrc(a.src), title: sanitizeInline(a.title || ''), caption: sanitizeInline(a.caption || '') };
          if (Number.isFinite(+a.ar) && +a.ar > 0) out.ar = +a.ar;
          if (a.box && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(+a.box[k]))) out.box = clampBox({ x: +a.box.x, y: +a.box.y, w: +a.box.w, h: +a.box.h });
          return out;
        }).filter((a) => a.src)
      });
    }
    const i = out.pages.findIndex((x) => x.type === 'cover');
    if (i > 0) out.pages.unshift(out.pages.splice(i, 1)[0]);
    if (!out.pages.length) out.pages.push(makePage('content'));
    return out;
  }

  async function openProjectFile(file) {
    const t = toast('Opening…', 0);
    try {
      const data = JSON.parse(await file.text());
      if (data.format === FMT_TPL) throw new Error('That is a template file — load it with Template → Import template.');
      if (data.format !== FMT_DOC || !data.project) throw new Error('This is not a Pagesmith document file.');
      await loadImagesFrom(data.images);
      project = cleanProject(data.project);
      currentId = project.pages[0].id;
      $('#projectName').value = project.name;
      renderPreview(); renderEditor(); touch();
      cleanupImages();
      toast('Opened ' + file.name);
    } catch (e) { console.error(e); toast(e.message || 'Could not open file'); }
    finally { t.remove(); }
  }

  async function exportTemplate(T) {
    const parts = [`{"format":"${FMT_TPL}","version":2,"template":`, JSON.stringify(T), ',"images":', ...(await imagesJsonParts(new Set(templateImageIds(T)))), '}'];
    download(parts, safeName(T.name || 'template') + '.template.json');
  }

  async function readTemplateFile(file) {
    const data = JSON.parse(await file.text());
    if (data.format !== FMT_TPL) throw new Error('This is not a template file (.template.json).');
    await loadImagesFrom(data.images);
    return cleanTemplate(data.template);
  }

  /* ------------------------------------------------------------------ new / export */
  function openNewDialog() {
    const m = modal('New document', `
      <div class="row"><span class="field-label">Name</span><input type="text" id="nn" style="flex:1" value="Untitled document"></div>
      <h4 style="margin-top:16px">Template</h4>
      <label class="row"><input type="radio" name="nt" value="same" checked> Same template as now (${esc(project.template.name)})</label>
      <label class="row"><input type="radio" name="nt" value="file"> Load a template file (.template.json)…</label>
      <label class="row"><input type="radio" name="nt" value="blank"> Blank template</label>
      <p class="hint">The current document will be closed. If you still need it, click Cancel and use “Save file” first.</p>`,
      [['Cancel'], ['Create', 'primary', async (back) => {
        const name = $('#nn', back).value.trim() || 'Untitled document';
        const how = $('input[name=nt]:checked', back).value;
        const start = (tpl) => {
          newProject(name, tpl);
          $('#projectName').value = project.name;
          renderPreview(); renderEditor(); touch();
          cleanupImages();
        };
        if (how === 'same') start(project.template);
        else if (how === 'blank') start(D.template);
        else pickFiles('#fileOpen', async ([f]) => { try { start(await readTemplateFile(f)); } catch (e) { toast(e.message); } });
      }]]);
    $('#nn', m).select();
  }

  function openExportDialog() {
    const warnCount = warnings.size;
    modal('Export PDF', `
      ${warnCount ? `<p class="hint warn" style="font-size:14px">⚠ ${warnCount} page(s) have too much content. Check pages marked ⚠ first.</p>` : ''}
      <ol class="steps">
        <li>Click <b>Open print window</b>.</li>
        <li>Destination: <b>Save as PDF</b> (or your printer).</li>
        <li>Under <b>More settings</b>: Margins <b>None</b>, Scale <b>Default</b>, and turn on <b>Background graphics</b>.</li>
        <li>Click <b>Save</b>. Portrait and landscape pages keep their own orientation.</li>
      </ol>
      <p class="hint">Use Google Chrome or Microsoft Edge for best results.</p>`,
      [['Cancel'], ['Open print window', 'primary', () => { setTimeout(() => window.print(), 50); }]]);
  }

  /* ------------------------------------------------------------------ editor / preview divider */
  const SIDEBAR_DEFAULT = 460, SIDEBAR_MIN = 320, PREVIEW_MIN = 280;
  function setSidebarWidth(px, save = true) {
    const max = Math.max(SIDEBAR_MIN, window.innerWidth - PREVIEW_MIN);
    const w = Math.round(Math.min(max, Math.max(SIDEBAR_MIN, px)));
    $('.sidebar').style.width = w + 'px';
    if (save) { try { localStorage.setItem('pagesmith.sidebar', String(w)); } catch (_) { /* storage blocked */ } }
    return w;
  }
  function wireSplitter() {
    const sp = $('#splitter');
    let saved = null;
    try { saved = parseInt(localStorage.getItem('pagesmith.sidebar'), 10); } catch (_) { /* storage blocked */ }
    if (saved) setSidebarWidth(saved, false);
    sp.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX, startW = $('.sidebar').getBoundingClientRect().width;
      sp.setPointerCapture(e.pointerId);
      sp.classList.add('dragging'); document.body.classList.add('resizing');
      const move = (ev) => setSidebarWidth(startW + ev.clientX - startX, false);
      const up = () => {
        sp.removeEventListener('pointermove', move); sp.removeEventListener('pointerup', up); sp.removeEventListener('pointercancel', up);
        sp.classList.remove('dragging'); document.body.classList.remove('resizing');
        setSidebarWidth($('.sidebar').getBoundingClientRect().width);
      };
      sp.addEventListener('pointermove', move); sp.addEventListener('pointerup', up); sp.addEventListener('pointercancel', up);
    });
    sp.addEventListener('dblclick', () => setSidebarWidth(SIDEBAR_DEFAULT));
    sp.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: -24, ArrowRight: 24 }[e.key];
      if (d) { e.preventDefault(); setSidebarWidth($('.sidebar').getBoundingClientRect().width + d); }
    });
    window.addEventListener('resize', () => setSidebarWidth($('.sidebar').getBoundingClientRect().width, false));
  }

  /* ------------------------------------------------------------------ wiring */
  function wire() {
    wireSplitter();
    $('#projectName').addEventListener('input', (e) => { project.name = e.target.value; touch(); });
    $('#btnNew').onclick = openNewDialog;
    $('#btnOpen').onclick = () => pickFiles('#fileOpen', ([f]) => {
      askConfirm('Open this file? The current document will be replaced (use “Save file” first if you still need it).', 'Open').then((ok) => ok && openProjectFile(f));
    });
    $('#btnSaveFile').onclick = saveProjectFile;
    $('#btnTemplate').onclick = openTemplateDialog;
    $('#btnExport').onclick = openExportDialog;
    $('#zoom').onchange = renderPreview;
    $$('[data-add]').forEach((b) => (b.onclick = () => addFromButton(b.dataset.add)));

    // page list: select, actions, drag reorder
    const ol = $('#pageList');
    ol.addEventListener('click', (e) => {
      const li = e.target.closest('.page-item'); if (!li) return;
      const act = e.target.closest('[data-act]')?.dataset.act;
      const id = li.dataset.id;
      if (act === 'up') movePage(id, -1);
      else if (act === 'down') movePage(id, 1);
      else if (act === 'dup') duplicatePage(id);
      else if (act === 'del') deletePage(id);
      else select(id);
    });
    let dragId = null;
    ol.addEventListener('dragstart', (e) => { dragId = e.target.closest('.page-item')?.dataset.id; e.dataTransfer.setData('text/page', dragId || ''); });
    ol.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('text/page')) return;
      e.preventDefault();
      $$('.page-item', ol).forEach((x) => x.classList.remove('drag-over'));
      e.target.closest('.page-item')?.classList.add('drag-over');
    });
    ol.addEventListener('drop', (e) => {
      const li = e.target.closest('.page-item');
      $$('.page-item', ol).forEach((x) => x.classList.remove('drag-over'));
      if (!li || !dragId || li.dataset.id === dragId) return;
      e.preventDefault();
      const [pg] = project.pages.splice(pageIndex(dragId), 1);
      project.pages.splice(pageIndex(li.dataset.id), 0, pg);
      normalizeOrder();
      dragId = null; renderPreview(); touch();
    });

    // preview: click to select; drop files on a page to attach them there
    const pv = $('#previewPages');
    pv.addEventListener('click', (e) => {
      const s = e.target.closest('.slot'); if (!s) return;
      if (!e.target.closest('.free-item')) { activeFree = null; $$('.free-item.active').forEach((x) => x.classList.remove('active')); }
      select(s.dataset.id, false);
    });
    document.addEventListener('keydown', nudgeFree);
    pv.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
    pv.addEventListener('drop', (e) => {
      const s = e.target.closest('.slot'); if (!s || !e.dataTransfer.files.length) return;
      e.preventDefault();
      const pg = pageById(s.dataset.id);
      if (pg.type !== 'content') return toast('Drop pictures on a content page, not the cover.');
      select(pg.id, false);
      addAttachments(pg, Array.from(e.dataTransfer.files));
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    // paste a screenshot anywhere (outside text boxes) → attachment on current page
    document.addEventListener('paste', (e) => {
      if (e.target.closest && e.target.closest('[contenteditable], input, textarea')) return;
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
      const pg = current();
      if (!files.length || !pg || pg.type !== 'content') return;
      e.preventDefault();
      addAttachments(pg, files).then(() => toast('Picture added'));
    });

    new ResizeObserver(() => {
      if ($('#zoom').value === 'fit' && project && Math.abs(computeScale() - scale) > 0.01) renderPreview();
    }).observe($('#previewPages'));
  }

  async function boot() {
    wire();
    try { await DB.open(); } catch (e) { console.warn(e); toast('Browser storage is blocked — use “Save file” to keep your work.', 6000); }
    try {
      const keys = (await DB.keys('images')) || [];
      for (const k of keys) { const b = await DB.get('images', k); if (b) images.set(k, { blob: b, url: URL.createObjectURL(b) }); }
      const dt = await DB.get('kv', 'defaultTemplate');
      if (dt) defaultTemplate = cleanTemplate(dt);
      const saved = await DB.get('kv', 'project');
      if (saved) {
        project = cleanProject(saved);
        const cid = await DB.get('kv', 'currentId');
        currentId = pageById(cid) ? cid : project.pages[0].id;
      }
    } catch (e) { console.error(e); }
    if (!project) newProject('Untitled document');
    $('#projectName').value = project.name;
    renderPreview();
    renderEditor();
    $('#saveStatus').textContent = DB.db ? 'All changes saved' : 'Not saved (storage blocked)';
    cleanupImages().catch(() => {});
  }

  boot();
})();
