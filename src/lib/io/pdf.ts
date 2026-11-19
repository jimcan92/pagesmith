import { storeImage } from '#lib/state/storage.ts';
import { canvasToJpeg } from './images';

/** Render every page of a PDF to a stored picture. Calls onPage for each one. */
export async function importPdf(
	file: Blob,
	onPage: (p: { id: string; w: number; h: number; page: number; total: number }) => void
) {
	const pdfjs = await import('pdfjs-dist');
	const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
	pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
	const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
	const pdf = await task.promise;
	for (let i = 1; i <= pdf.numPages; i++) {
		const page = await pdf.getPage(i);
		const base = page.getViewport({ scale: 1 });
		const vp = page.getViewport({ scale: Math.min(4, 2200 / Math.max(base.width, base.height)) });
		const c = document.createElement('canvas');
		c.width = Math.round(vp.width);
		c.height = Math.round(vp.height);
		const g = c.getContext('2d')!;
		g.fillStyle = '#fff';
		g.fillRect(0, 0, c.width, c.height);
		await page.render({ canvasContext: g, canvas: c, viewport: vp }).promise;
		const id = await storeImage(await canvasToJpeg(c, 0.9));
		onPage({ id, w: c.width, h: c.height, page: i, total: pdf.numPages });
		page.cleanup();
	}
	await task.destroy();
}
