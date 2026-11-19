import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

// GitHub Pages serves the app from /pagesmith; locally it runs at the root.
const base = (process.env.BASE_PATH ?? "") as "" | `/${string}`;

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter({ pages: 'build', assets: 'build', fallback: undefined, strict: true }),
			paths: { base }
		})
	],
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.ts']
	}
});
