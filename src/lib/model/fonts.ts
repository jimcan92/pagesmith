/** Fonts offered in the font box: the usual Windows / Office fonts (any other name can be typed). */
export const FONTS = [
	'Aptos', 'Arial', 'Arial Black', 'Arial Narrow', 'Bahnschrift', 'Book Antiqua', 'Bookman Old Style', 'Calibri', 'Calibri Light',
	'Cambria', 'Candara', 'Century Gothic', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New',
	'Franklin Gothic Medium', 'Garamond', 'Georgia', 'Gill Sans MT', 'Impact', 'Lucida Console', 'Lucida Sans Unicode',
	'Microsoft Sans Serif', 'Palatino Linotype', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'
];

/** The font the page text uses when none is set. */
export const DEFAULT_FONT = 'Arial';

export const FONT_SIZES = ['8', '9', '10', '10.5', '11', '12', '14', '16', '18', '20', '22', '24', '26', '28', '36', '48', '72'];

/** "12", "12pt", " 10.5 " → 12 / 10.5; anything else (or out of 1–400) → null. */
export function parseFontSize(v: string): number | null {
	const m = String(v).trim().match(/^(\d+(?:\.\d+)?)\s*(pt)?$/i);
	if (!m) return null;
	const n = Math.round(+m[1] * 2) / 2; // Word keeps half points
	return n >= 1 && n <= 400 ? n : null;
}

/** First family of a css font-family value, without quotes. */
export const firstFamily = (v?: string | null) => (v || '').split(',')[0].trim().replace(/^['"]|['"]$/g, '');
