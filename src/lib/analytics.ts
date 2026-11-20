/*
 * Usage counts with GoatCounter (no cookies, no personal data).
 * Only on the published site, never while developing. Only the name of an action is sent
 * (e.g. "save-docx"), never anything from the document.
 */
export const GOATCOUNTER_CODE = 'jimcan'; // the site code from goatcounter.com, e.g. 'pagesmith-jimcan'

const live = () => typeof location !== 'undefined' && location.hostname.endsWith('github.io');

type GC = { count: (o: { path: string; title?: string; event?: boolean }) => void };

/** Load the counter once (it counts the page visit itself). */
export function startAnalytics() {
	if (!GOATCOUNTER_CODE || !live() || document.querySelector('script[data-goatcounter]')) return;
	const s = document.createElement('script');
	s.async = true;
	s.src = 'https://gc.zgo.at/count.js';
	s.dataset.goatcounter = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
	document.head.appendChild(s);
}

/** Count one use of a feature. Safe to call anywhere; does nothing when analytics is off. */
export function track(action: string) {
	if (!GOATCOUNTER_CODE || !live()) return;
	try {
		const gc = (window as unknown as { goatcounter?: GC }).goatcounter;
		gc?.count?.({ path: action, title: action, event: true });
	} catch {
		/* never let counting break the app */
	}
}
