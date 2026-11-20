// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Document, ImageRun, Packer, Paragraph } from 'docx';
import { htmlToContent } from 'docx/html';
import JSZip from 'jszip';
import { parseDocx } from './docxImport';
import { addBorders } from './docxExport';
import { cleanAttachment } from './legacy';
import { borderFromLn, cleanBorder } from '#lib/model/border.ts';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

describe('picture borders', () => {
	it('cleans saved borders', () => {
		expect(cleanBorder({ w: 1.5, color: '#FF0000' })).toEqual({ w: 1.5, color: '#ff0000' });
		expect(cleanBorder({ w: 0 })).toBeUndefined();
		expect(cleanBorder({ w: 99, color: 'red' })).toEqual({ w: 12, color: '#000000' });
		expect(cleanAttachment({ src: 'img_1', border: { w: 2.25, color: '#123456' } })!.border).toEqual({ w: 2.25, color: '#123456' });
	});
	it("reads Word's line colors", () => {
		expect(borderFromLn('19050', null, 'tx1', false)).toEqual({ w: 1.5, color: '#000000' });
		expect(borderFromLn('28575', 'C00000', null, false)).toEqual({ w: 2.25, color: '#c00000' });
		expect(borderFromLn('19050', null, null, true)).toBeUndefined();
	});
	it('saves a border on grid and floating pictures, and reads it back', async () => {
		const grid = htmlToContent('<p><img src="ps:a" width="100" height="120" alt="ps-border:1.5:c00000"></p><p><img src="ps:a" width="100" height="120"></p>', { images: () => PNG });
		const float = new ImageRun({ type: 'png', data: PNG, transformation: { width: 90, height: 90 },
			outline: { width: 38100, type: 'solidFill', solidFillType: 'rgb', value: '0000FF' } });
		const blob = await Packer.toBlob(new Document({ sections: [{ children: [...grid, new Paragraph({ children: [float] })] }] }));
		const zip = await JSZip.loadAsync(await blob.arrayBuffer());
		const xml = addBorders(await zip.file('word/document.xml')!.async('string'));
		expect(xml).not.toContain('ps-border:');
		zip.file('word/document.xml', xml);
		const res = await parseDocx(await zip.generateAsync({ type: 'arraybuffer' }));
		const borders = res.pages.flatMap((p) => p.pics).map((p) => p.border);
		expect(borders).toEqual([{ w: 1.5, color: '#c00000' }, undefined, { w: 3, color: '#0000ff' }]);
	});
});
