// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseFontSize, firstFamily } from './fonts';
import { sanitize } from './sanitize';

describe('font size box', () => {
	it('accepts typed numbers like Word', () => {
		expect(parseFontSize('20')).toBe(20);
		expect(parseFontSize(' 10.5 ')).toBe(10.5);
		expect(parseFontSize('13pt')).toBe(13);
		expect(parseFontSize('11.3')).toBe(11.5);
	});
	it('rejects junk and silly sizes', () => {
		for (const v of ['', 'abc', '0', '-5', '500', '12px']) expect(parseFontSize(v)).toBeNull();
	});
});

describe('font family', () => {
	it('reads the first family without quotes', () => {
		expect(firstFamily('"Times New Roman", serif')).toBe('Times New Roman');
		expect(firstFamily('Georgia')).toBe('Georgia');
		expect(firstFamily(undefined)).toBe('');
	});
	it('survives cleaning', () => {
		expect(sanitize('<p><span style="font-family: &quot;Times New Roman&quot;; font-size: 20pt">x</span></p>')).toContain('font-family');
	});
});
