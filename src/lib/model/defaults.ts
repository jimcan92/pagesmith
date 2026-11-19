import type { ContentPage, CoverPage, Margins, Orientation, PaperKey, Project, Template } from './types';

export const PX_PER_IN = 96;

export const PAPER_SIZES: Record<PaperKey, { name: string; w: number; h: number }> = {
	long: { name: 'Long bond (8.5 × 13 in)', w: 8.5, h: 13 },
	a4: { name: 'A4 (8.27 × 11.69 in)', w: 8.27, h: 11.69 },
	letter: { name: 'Letter (8.5 × 11 in)', w: 8.5, h: 11 }
};

const oneInch = (): Margins => ({ top: 1, right: 1, bottom: 1, left: 1 });

/** A blank template. Teams set their own up in the app or import a .template.json. */
export function blankTemplate(): Template {
	return {
		name: 'Blank template',
		cover: '',
		backgrounds: [
			{ id: 'portrait', name: 'Portrait', orientation: 'portrait', src: '', margins: oneInch() },
			{ id: 'landscape', name: 'Landscape', orientation: 'landscape', src: '', margins: oneInch() }
		]
	};
}

export const uid = (prefix: string) =>
	prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export function makeContentPage(orientation: Orientation = 'portrait', bg = 'default'): ContentPage {
	return {
		id: uid('pg'),
		type: 'content',
		orientation,
		bg,
		html: '',
		layout: 'auto',
		fit: 'contain',
		showCaptions: true,
		textV: 'top',
		textAlign: '',
		attachments: []
	};
}

export const makeCoverPage = (): CoverPage => ({ id: uid('pg'), type: 'cover' });

export function newProject(name = 'Untitled document', template: Template = blankTemplate()): Project {
	const p: Project = {
		format: 'pagesmith',
		version: 3,
		name,
		paper: 'long',
		pageNumbers: { enabled: false, align: 'right', bottom: 0.3, side: 0.6, skipCovers: true, start: 1 },
		template: structuredClone(template),
		pages: []
	};
	if (p.template.cover) p.pages.push(makeCoverPage());
	p.pages.push(makeContentPage('portrait'));
	return p;
}
