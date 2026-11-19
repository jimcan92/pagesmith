import type { ContentPage, LabelPos, Labels, LabelStyle } from './types';

export const LABEL_POS: [LabelPos, string][] = [
	['above', 'Above picture'],
	['below', 'Below picture'],
	['top', 'On picture – top'],
	['bottom', 'On picture – bottom']
];

export const LABEL_DEFAULTS: Labels = {
	title: { pos: 'above', size: 11, align: 'center', bold: true, italic: false, color: '#111111' },
	caption: { pos: 'below', size: 9.5, align: 'center', bold: false, italic: true, color: '#222222' }
};

export const labelStyle = (pg: Pick<ContentPage, 'labels'>): Labels => ({
	title: { ...LABEL_DEFAULTS.title, ...(pg.labels?.title || {}) },
	caption: { ...LABEL_DEFAULTS.caption, ...(pg.labels?.caption || {}) }
});

export function cleanLabels(l: Partial<Record<keyof Labels, Partial<LabelStyle>>> | undefined): Labels {
	const out = {} as Labels;
	for (const k of ['title', 'caption'] as const) {
		const s = { ...LABEL_DEFAULTS[k], ...((l && l[k]) || {}) };
		out[k] = {
			pos: LABEL_POS.some(([v]) => v === s.pos) ? s.pos : LABEL_DEFAULTS[k].pos,
			size: Math.min(40, Math.max(6, +s.size || LABEL_DEFAULTS[k].size)),
			align: ['left', 'center', 'right'].includes(s.align) ? s.align : 'center',
			bold: !!s.bold,
			italic: !!s.italic,
			color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : LABEL_DEFAULTS[k].color
		};
	}
	return out;
}

export const labelCss = (s: LabelStyle) =>
	`font-size:${s.size}pt;text-align:${s.align};font-weight:${s.bold ? 700 : 400};font-style:${s.italic ? 'italic' : 'normal'};color:${s.color}`;
