import { mdsvex } from 'mdsvex';
import mdsvexConfig from './mdsvex.config.js';
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { PERMANENT_REDIRECTS } from './src/redirects.js';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [vitePreprocess(), mdsvex(mdsvexConfig)],

	kit: {
		adapter: adapter(),
		alias: {
			$content: 'src/content'
		},
		prerender: {
			entries: ['*', ...Object.keys(PERMANENT_REDIRECTS)]
		}
	},

	extensions: ['.svelte', '.md']
};

export default config;
