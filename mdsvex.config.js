import { escapeSvelte } from 'mdsvex';
import { createHighlighter } from 'shiki';

// Create long-lived singleton highlighter
const highlighter = await createHighlighter({
	themes: ['dark-plus'],
	langs: [
		'css',
		'dotenv',
		'elixir',
		'html',
		'javascript',
		'shellscript',
		'svelte',
		'typescript',
		'yaml'
	]
});

/** @type {import('mdsvex').MdsvexOptions} */
const config = {
	extensions: ['.md'],
	smartypants: {
		quotes: true,
		dashes: 'oldschool'
	},
	highlight: {
		highlighter: async (code, lang = 'text') => {
			await highlighter.loadLanguage(
				'css',
				'dotenv',
				'elixir',
				'html',
				'javascript',
				'shellscript',
				'svelte',
				'typescript',
				'yaml'
			);
			const html = escapeSvelte(highlighter.codeToHtml(code, { lang, theme: 'dark-plus' }));
			return `{@html \`${html}\` }`;
		}
	}
};

export default config;
