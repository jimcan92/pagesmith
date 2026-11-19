/* IndexedDB: the open document and the pictures (pictures are kept outside the document JSON). */
import { uid } from '#lib/model/defaults.ts';

const DB_NAME = 'pagesmith'; // same database as the previous version, so existing work opens

let db: IDBDatabase | null = null;

export async function openDb(): Promise<boolean> {
	if (db) return true;
	if (typeof indexedDB === 'undefined') return false;
	return new Promise((resolve) => {
		const r = indexedDB.open(DB_NAME, 1);
		r.onupgradeneeded = () => {
			r.result.createObjectStore('kv');
			r.result.createObjectStore('images');
		};
		r.onsuccess = () => { db = r.result; resolve(true); };
		r.onerror = () => resolve(false);
	});
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
	if (!db) return Promise.resolve(undefined);
	return new Promise((resolve, reject) => {
		const t = db!.transaction(store, mode);
		const req = fn(t.objectStore(store));
		t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
		t.onerror = () => reject(t.error);
		t.onabort = () => reject(t.error);
	});
}

export const kvGet = <T>(k: string) => run<T>('kv', 'readonly', (s) => s.get(k));
export const kvSet = (k: string, v: unknown) => run('kv', 'readwrite', (s) => s.put(v, k));
export const storageReady = () => !!db;

/* ---------------- pictures ---------------- */
const images = new Map<string, { blob: Blob; url: string }>();

export async function storeImage(blob: Blob, id = uid('img')): Promise<string> {
	const old = images.get(id);
	if (old) URL.revokeObjectURL(old.url);
	images.set(id, { blob, url: URL.createObjectURL(blob) });
	try { await run('images', 'readwrite', (s) => s.put(blob, id)); } catch (e) { console.warn(e); }
	return id;
}

export const imageUrl = (id: string) => (id ? images.get(id)?.url || '' : '');
export const imageBlob = (id: string) => images.get(id)?.blob;
export const hasImage = (id: string) => images.has(id);

/** Load every stored picture into memory (object URLs). */
export async function loadAllImages() {
	const keys = ((await run<IDBValidKey[]>('images', 'readonly', (s) => s.getAllKeys())) || []) as string[];
	for (const k of keys) {
		if (images.has(k)) continue;
		const b = await run<Blob>('images', 'readonly', (s) => s.get(k));
		if (b) images.set(k, { blob: b, url: URL.createObjectURL(b) });
	}
}

/** Remove stored pictures that nothing uses any more. */
export async function cleanupImages(used: Set<string>) {
	const keys = ((await run<IDBValidKey[]>('images', 'readonly', (s) => s.getAllKeys())) || []) as string[];
	for (const k of keys) {
		if (used.has(k)) continue;
		await run('images', 'readwrite', (s) => s.delete(k));
		const im = images.get(k);
		if (im) { URL.revokeObjectURL(im.url); images.delete(k); }
	}
}
