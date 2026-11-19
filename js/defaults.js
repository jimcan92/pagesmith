/*
 * Built-in defaults: a blank template. Each team sets up its own look in the app
 * (Template button) or imports a ready-made .template.json file.
 * Margins are in inches and mark the "safe area" where text and pictures may go,
 * so nothing covers the banner (top) or the logos (bottom) of a background.
 */
window.PAGESMITH_DEFAULTS = {
  paperSizes: {
    long:   { name: 'Long bond (8.5 × 13 in)', w: 8.5,  h: 13 },
    a4:     { name: 'A4 (8.27 × 11.69 in)',    w: 8.27, h: 11.69 },
    letter: { name: 'Letter (8.5 × 11 in)',    w: 8.5,  h: 11 }
  },
  template: {
    name: 'Blank template',
    cover: '',
    backgrounds: [
      { id: 'portrait',  name: 'Portrait',  orientation: 'portrait',  src: '', margins: { top: 1, right: 1, bottom: 1, left: 1 } },
      { id: 'landscape', name: 'Landscape', orientation: 'landscape', src: '', margins: { top: 1, right: 1, bottom: 1, left: 1 } }
    ]
  }
};
