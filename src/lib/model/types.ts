export type Orientation = 'portrait' | 'landscape';
export type PaperKey = 'long' | 'a4' | 'letter';

export interface Margins {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

/** A page design: the picture behind the page and the safe area (inches) where content may go. */
export interface Background {
	id: string; // 'portrait' | 'landscape' (the defaults) or 'bg_…' (special)
	name: string;
	orientation: Orientation;
	src: string; // image id ('img_…') or ''
	margins: Margins;
}

export interface Template {
	name: string;
	cover: string; // image id or ''
	backgrounds: Background[];
}

/** Position of a picture in a manual layout, as fractions (0–1) of the attachment area. */
export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Attachment {
	id: string;
	src: string; // image id
	title: string; // inline html (b/i/u/br)
	caption: string; // inline html
	ar?: number; // picture width / height
	box?: Box;
}

export type LabelPos = 'above' | 'below' | 'top' | 'bottom';
export interface LabelStyle {
	pos: LabelPos;
	size: number;
	align: 'left' | 'center' | 'right';
	bold: boolean;
	italic: boolean;
	color: string;
}
export interface Labels {
	title: LabelStyle;
	caption: LabelStyle;
}

export type LayoutKey = 'auto' | 'free' | '1' | '2h' | '2v' | '3h' | '3v' | '4' | '6' | '9';

export interface CoverPage {
	id: string;
	type: 'cover';
}

export interface ContentPage {
	id: string;
	type: 'content';
	orientation: Orientation;
	bg: string; // 'default' | 'none' | background id
	html: string;
	layout: LayoutKey;
	fit: 'contain' | 'cover';
	showCaptions: boolean;
	textV: 'top' | 'middle' | 'bottom';
	textAlign: '' | 'center';
	labels?: Labels;
	attachments: Attachment[];
}

export type Page = CoverPage | ContentPage;

export interface PageNumbers {
	enabled: boolean;
	align: 'left' | 'center' | 'right';
	bottom: number;
	side: number;
	skipCovers: boolean;
	start: number;
}

export interface Project {
	format: 'pagesmith';
	version: 3;
	name: string;
	paper: PaperKey;
	pageNumbers: PageNumbers;
	template: Template;
	pages: Page[];
}
