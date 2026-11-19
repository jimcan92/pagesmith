import { storeImage } from '#lib/state/storage.ts';

export const MAX_IMG_SIDE = 2400; // plenty for print, keeps files small

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
	try {
		return await createImageBitmap(file, { imageOrientation: 'from-image' });
	} catch {
		const url = URL.createObjectURL(file);
		try {
			const img = new Image();
			img.src = url;
			await img.decode();
			return img;
		} finally {
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		}
	}
}

export const canvasToJpeg = (c: HTMLCanvasElement, q = 0.88) =>
	new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode picture'))), 'image/jpeg', q));

/** Resize (and optionally rotate) a picture, re-encoded as JPEG on white. */
export async function normalizeImage(file: Blob, rotate = 0, maxSide = MAX_IMG_SIDE) {
	const src = await decode(file);
	const sw = src.width, sh = src.height;
	const k = Math.min(1, maxSide / Math.max(sw, sh));
	const w = Math.round(sw * k), h = Math.round(sh * k);
	const quarter = rotate % 180 !== 0;
	const c = document.createElement('canvas');
	c.width = quarter ? h : w;
	c.height = quarter ? w : h;
	const g = c.getContext('2d')!;
	g.fillStyle = '#fff';
	g.fillRect(0, 0, c.width, c.height);
	g.translate(c.width / 2, c.height / 2);
	g.rotate((rotate * Math.PI) / 180);
	g.drawImage(src, -w / 2, -h / 2, w, h);
	if ('close' in src) src.close();
	return { blob: await canvasToJpeg(c), w: c.width, h: c.height };
}

/** Store a picture file; returns its id and size. */
export async function importImageFile(file: Blob, maxSide?: number) {
	const { blob, w, h } = await normalizeImage(file, 0, maxSide);
	return { id: await storeImage(blob), w, h };
}

export const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
export const isDocx = (f: File) => /\.docx$/i.test(f.name);
export const isImage = (f: File) => f.type.startsWith('image/');
export const baseName = (f: { name: string }) => f.name.replace(/\.[^.]+$/, '');
