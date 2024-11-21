import type { PageServerLoad } from './$types';
import { getPosts } from '$lib/writing';

export const prerender = true;

export const load: PageServerLoad = async () => {
	const posts = await getPosts();

	return { posts };
};
