import type { PicBorder } from './types';

/** Line widths offered for picture borders (points), like Word's Weight menu. */
export const BORDER_WIDTHS = [0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6];
export const DEFAULT_BORDER: PicBorder = { w: 1.5, color: '#000000' };
export const EMU_PER_PT = 12700;

/** A valid border, or undefined (width 0.25–12 pt, a #rrggbb color). */
export function cleanBorder(b: unknown): PicBorder | undefined {
	const o = b as { w?: unknown; color?: unknown } | null;
	const w = Number(o?.w);
	if (!o || !Number.isFinite(w) || w <= 0) return undefined;
	const color = /^#[0-9a-f]{6}$/i.test(String(o.color)) ? String(o.color).toLowerCase() : '#000000';
	return { w: Math.min(12, Math.max(0.25, Math.round(w * 100) / 100)), color };
}

/** Word's <a:ln> (in a picture's shape properties) → a border. Theme colors: dark text = black, light = white. */
export function borderFromLn(wEmu: string | null, srgb: string | null, scheme: string | null, noFill: boolean): PicBorder | undefined {
	if (noFill) return undefined;
	const w = (Number(wEmu) || 9525) / EMU_PER_PT;
	let color = '#000000';
	if (srgb && /^[0-9a-f]{6}$/i.test(srgb)) color = '#' + srgb.toLowerCase();
	else if (scheme && /^(bg1|lt1)$/.test(scheme)) color = '#ffffff';
	else if (!srgb && !scheme) return undefined; // a line with no fill set draws nothing in Word
	return cleanBorder({ w, color });
}

/** <a:ln> markup for a border, for a picture's <pic:spPr>. */
export const lnXml = (b: PicBorder) =>
	`<a:ln w="${Math.round(b.w * EMU_PER_PT)}"><a:solidFill><a:srgbClr val="${b.color.slice(1).toUpperCase()}"/></a:solidFill></a:ln>`;
