import { describe, expect, it } from 'vitest';
import { sanitize, sanitizeInline, plainText, parseWidth } from './sanitize';
import { gridFor, boxForAspect, clampBox, snapMove } from './layout';
import { cleanLabels } from './labels';

describe('sanitize', () => {
	it('drops scripts, unknown tags and attributes but keeps formatting', () => {
		const out = sanitize('<p onclick="x()" style="text-align:center;position:fixed"><b>Hi</b><script>bad()</script><o:p></o:p><img src=x></p>');
		expect(out).toBe('<p style="text-align:center"><b>Hi</b></p>');
	});
	it('keeps Word column widths as colwidth in px (a table narrower than the page keeps its size)', () => {
		const html = `<table><tr><td style="width:18pt">#</td><td style="width:270pt">Long</td><td style="width:45pt">A</td></tr></table>`;
		const doc = new DOMParser().parseFromString(sanitize(html, 600), 'text/html');
		const ws = Array.from(doc.querySelectorAll('td')).map((c) => +c.getAttribute('colwidth')!);
		expect(ws).toEqual([24, 360, 60]);
	});
	it('shrinks a table that is wider than the page to fit', () => {
		const html = `<table><tr><td style="width:300pt">a</td><td style="width:300pt">b</td></tr></table>`;
		const doc = new DOMParser().parseFromString(sanitize(html, 600), 'text/html');
		const ws = Array.from(doc.querySelectorAll('td')).map((c) => +c.getAttribute('colwidth')!);
		expect(ws).toEqual([300, 300]);
	});
	it('keeps the editor colwidth as-is when it fits', () => {
		const html = `<table><tr><td colwidth="100">a</td><td colwidth="200">b</td></tr></table>`;
		expect(sanitize(html, 600)).toContain('colwidth="200"');
	});
	it('gives a cell under a rowspan the width of the column it is really in', () => {
		// row 2's only cell sits in column 3: columns 1-2 are taken by the merged cell above
		const html = `<table><tr><th colwidth="94">a</th><th colwidth="155">b</th><th colwidth="155">c</th></tr>`
			+ `<tr><td colspan="2" rowspan="2" colwidth="94,155">m</td><td colwidth="155">x</td></tr>`
			+ `<tr><td colwidth="94">y</td></tr></table>`;
		const doc = new DOMParser().parseFromString(sanitize(html, 600), 'text/html');
		expect(doc.querySelectorAll('tr')[2].cells[0].getAttribute('colwidth')).toBe('155');
		expect(doc.querySelectorAll('col').length).toBe(3);
	});
	it('handles colspan in % colgroups', () => {
		const html = `<table><colgroup><col style="width:25%"><col style="width:75%"></colgroup><tr><td colspan="2">x</td></tr></table>`;
		expect(sanitize(html, 400)).toContain('colwidth="100,300"');
	});
	it('inline: only b/i/u/br', () => {
		expect(sanitizeInline('<span style="color:red">a</span><b>b</b><div>c</div>')).toBe('a<b>b</b><br>c');
	});
	it('plain text decodes entities', () => {
		expect(plainText('<p>A &amp; B</p><p>C</p>')).toBe('A & B C');
	});
	it('parses widths', () => {
		expect(parseWidth('72pt')!.px).toBeCloseTo(96);
		expect(parseWidth('25%')!.pct).toBe(25);
		expect(parseWidth('nope')).toBeNull();
	});
});

describe('layout', () => {
	it('picks grids', () => {
		expect(gridFor({ attachments: Array(4) as never, orientation: 'portrait', layout: 'auto' })).toEqual({ c: 2, r: 2 });
		expect(gridFor({ attachments: Array(3) as never, orientation: 'landscape', layout: 'auto' })).toEqual({ c: 3, r: 1 });
		expect(gridFor({ attachments: Array(7) as never, orientation: 'portrait', layout: '4' })).toEqual({ c: 2, r: 4 });
	});
	it('keeps boxes inside and in shape', () => {
		const b = boxForAspect(0.6, 1.5, 0.5);
		expect(b.w).toBeCloseTo(0.5);
		expect(b.h).toBeCloseTo((0.5 * 0.6) / 1.5);
		expect(clampBox({ x: 0.9, y: -1, w: 0.3, h: 2 })).toEqual({ x: 0.7, y: 0, w: 0.3, h: 1 });
		expect(snapMove({ x: 0.005, y: 0.3, w: 0.2, h: 0.2 }).x).toBe(0);
	});
	it('cleans label styles', () => {
		const l = cleanLabels({ title: { pos: 'nowhere' as never, size: 999, color: 'red' } });
		expect(l.title.pos).toBe('above');
		expect(l.title.size).toBe(40);
		expect(l.title.color).toBe('#111111');
	});
});
