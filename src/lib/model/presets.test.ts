import { describe, expect, it } from 'vitest';
import { PRESETS, presetBoxes } from './presets';

describe('picture arrangement presets', () => {
	const A = 0.72;
	for (const ars of [[0.77], [0.77, 0.77], [1.5, 0.7, 1.33], [1, 1, 1, 1, 1, 1, 1]]) {
		for (const [k] of PRESETS) {
			it(`${k} with ${ars.length} picture(s) stays on the page and keeps picture shapes`, () => {
				const boxes = presetBoxes(k, ars, A);
				expect(boxes).toHaveLength(ars.length);
				boxes.forEach((b, i) => {
					expect(b.x).toBeGreaterThanOrEqual(0);
					expect(b.y).toBeGreaterThanOrEqual(0);
					expect(b.x + b.w).toBeLessThanOrEqual(1 + 1e-9);
					expect(b.y + b.h).toBeLessThanOrEqual(1 + 1e-9);
					expect((b.w * A) / b.h).toBeCloseTo(ars[i], 5);
				});
			});
		}
	}
});
