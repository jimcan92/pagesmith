// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Document, ExternalHyperlink, ImageRun, Packer, Paragraph, TextRun } from 'docx';
import JSZip from 'jszip';
import { parseDocx } from './docxImport';
import { cleanAttachment } from './legacy';
import { safeUrl, sanitize } from '#lib/model/sanitize.ts';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

async function docxBuffer(children: Paragraph[]) {
	const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
	return blob.arrayBuffer();
}

describe('link addresses', () => {
	it('keeps web, mail and phone links and adds https:// like Word', () => {
		expect(safeUrl('https://a.com/x?y=1')).toBe('https://a.com/x?y=1');
		expect(safeUrl('www.ctu.edu.ph')).toBe('https://www.ctu.edu.ph');
		expect(safeUrl('drive.google.com/file/d/abc')).toBe('https://drive.google.com/file/d/abc');
		expect(safeUrl('me@ctu.edu.ph')).toBe('mailto:me@ctu.edu.ph');
		expect(safeUrl('tel:+63321234567')).toBe('tel:+63321234567');
	});
	it('refuses unsafe or broken addresses', () => {
		for (const v of ['javascript:alert(1)', 'data:text/html,x', 'file:///c:/x', '', 'just words', 'vbscript:x']) expect(safeUrl(v)).toBe('');
	});
	it('keeps links in page text and drops bad ones', () => {
		const html = sanitize('<p><a href="https://a.com" onclick="x()">A</a> <a href="javascript:alert(1)">B</a> <a name="top">C</a></p>');
		expect(html).toContain('<a href="https://a.com" target="_blank" rel="noopener noreferrer nofollow">A</a>');
		expect(html).not.toContain('javascript');
		expect(html).not.toContain('onclick');
		expect(html).toContain(' B ');
	});
	it('keeps a picture link in saved documents, only when safe', () => {
		expect(cleanAttachment({ src: 'img_1', link: 'https://a.com/doc.pdf' })!.link).toBe('https://a.com/doc.pdf');
		expect(cleanAttachment({ src: 'img_1', link: 'javascript:alert(1)' })!.link).toBeUndefined();
	});
});

describe('Word links on open', () => {
	it('reads hyperlinks on text and on pictures', async () => {
		const buf = await docxBuffer([
			new Paragraph({ children: [new TextRun('See '), new ExternalHyperlink({ link: 'https://example.com/manual', children: [new TextRun({ text: 'the manual', bold: true })] })] }),
			new Paragraph({ children: [new ExternalHyperlink({ link: 'https://example.com/full.pdf', children: [new ImageRun({ type: 'png', data: PNG, transformation: { width: 200, height: 260 } })] })] }),
			new Paragraph({ children: [new ImageRun({ type: 'png', data: PNG, transformation: { width: 200, height: 260 } })] })
		]);
		const res = await parseDocx(buf);
		const html = res.pages.map((p) => p.html).join('');
		expect(html).toContain('<a href="https://example.com/manual"><b>the manual</b></a>');
		const pics = res.pages.flatMap((p) => p.pics);
		expect(pics).toHaveLength(2);
		expect(pics[0].link).toBe('https://example.com/full.pdf');
		expect(pics[1].link).toBeUndefined();
	});

	it('reads HYPERLINK fields', async () => {
		const zip = await JSZip.loadAsync(await docxBuffer([new Paragraph({ children: [new TextRun('PLACEHOLDER')] })]));
		const xml = await zip.file('word/document.xml')!.async('string');
		const field = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> HYPERLINK "https://example.com/f" </w:instrText></w:r>' +
			'<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>field link</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
		zip.file('word/document.xml', xml.replace(/<w:r>(?:(?!<w:r>).)*?PLACEHOLDER.*?<\/w:r>/s, field));
		const res = await parseDocx(await zip.generateAsync({ type: 'arraybuffer' }));
		expect(res.pages[0].html).toContain('<a href="https://example.com/f">field link</a>');
	});
});
