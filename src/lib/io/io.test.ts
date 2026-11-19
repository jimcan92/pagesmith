import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { cleanProject, cleanTemplate } from './legacy';
import { parseDocx } from './docxImport';

describe('legacy loaders', () => {
	it('opens a document from the previous version', () => {
		const old = {
			format: 'pagesmith', version: 2, name: 'Old', paper: 'long',
			template: { name: 'T', cover: 'img_c1', backgrounds: [{ id: 'portrait', src: 'img_p1', margins: { top: 1.55 } }, { id: 'bg_x1', name: 'Div', orientation: 'landscape', src: 'img_d' }] },
			pages: [
				{ id: 'a', type: 'content', orientation: 'landscape', bg: 'bg_x1', html: '<p>hi<script>x</script></p>', layout: 'free',
					attachments: [{ id: 't', src: 'img_1', caption: '<i>c</i>', box: { x: 2, y: 0, w: 0.5, h: 0.5 } }, { src: 'http://evil' }] },
				{ id: 'c', type: 'cover' }
			]
		};
		const p = cleanProject(old);
		expect(p.pages[0].type).toBe('cover'); // cover moved first
		const pg = p.pages[1];
		if (pg.type !== 'content') throw new Error();
		expect(pg.html).toBe('<p>hi</p>');
		expect(pg.attachments).toHaveLength(1);
		expect(pg.attachments[0].box!.x).toBe(0.5);
		expect(p.template.backgrounds[0].margins.top).toBe(1.55);
		expect(p.template.backgrounds).toHaveLength(3);
	});
	it('cleans a template file', () => {
		const t = cleanTemplate({ name: 'X', cover: 'javascript:alert(1)', backgrounds: [] });
		expect(t.cover).toBe('');
		expect(t.backgrounds.map((b) => b.id)).toEqual(['portrait', 'landscape']);
	});
});

const SAMPLE = '../Area IV- SUPPORT TO STUDENTS.docx';
describe.skipIf(!existsSync(SAMPLE))('Word import (sample document)', () => {
	it('reads the Area IV document into pages', async () => {
		const buf = readFileSync(SAMPLE);
		const doc = await parseDocx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
		expect(doc.pages.length).toBeGreaterThan(70);
		expect(doc.pages.filter((p) => p.landscape).length).toBe(1);
		expect(doc.pictures).toBeGreaterThan(140);
		expect(doc.pages.some((p) => p.html.includes('COMPLIANCE REPORT'))).toBe(true);
	}, 60000);
});
