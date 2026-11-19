import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Svelte runes only work in .svelte / .svelte.ts files; elsewhere they throw at run time
 *  (rune_outside_svelte), and svelte-check does not notice. */
describe('runes', () => {
	it('are not used in plain .ts files', () => {
		const files: string[] = [];
		(function walk(dir: string) {
			for (const e of readdirSync(dir, { withFileTypes: true })) {
				const p = join(dir, e.name);
				if (e.isDirectory()) walk(p);
				else if (p.endsWith('.ts') && !p.endsWith('.svelte.ts') && !p.endsWith('.test.ts') && !p.endsWith('.d.ts')) files.push(p);
			}
		})('src');
		const bad = files.filter((f) => /\$(state|derived|effect|props|bindable|inspect)\b/.test(readFileSync(f, 'utf8')));
		expect(bad).toEqual([]);
	});
});
