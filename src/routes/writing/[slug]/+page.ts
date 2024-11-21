import type { EntryGenerator, PageLoad } from './$types';
import type { MdFile } from '$lib/types';
import { error } from '@sveltejs/kit';
import { getPosts } from '$lib/writing';

export const prerender = true;

export const load: PageLoad = async ({ params }) => {
	try {
		const post: MdFile = await import(`$content/writing/${params.slug}.md`);

		if (!post) {
			error(404, `Could not find ${params.slug}`);
		}

		return {
			content: post.default,
			meta: post.metadata
		};
	} catch (e: unknown) {
		if (e instanceof Error) {
			error(404, e.message);
		} else {
			// eslint-disable-next-line no-console
			console.log('Unknown error: ', e);
			error(404, `Could not find ${params.slug}`);
		}
	}
};

export const entries: EntryGenerator = async () => {
	// eslint-disable-next-line no-console
	console.log('Prerendering /writing/[slug]');
	const posts = await getPosts();
	const entries = posts.map((post) => ({ slug: post.slug }));
	// eslint-disable-next-line no-console
	console.dir(entries, { colors: true });

	return entries;
};
