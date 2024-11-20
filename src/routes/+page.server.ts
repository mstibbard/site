import type { PageServerLoad } from './$types';
import { getBlogPosts } from '$lib/blog';

export const prerender = true;

export const load: PageServerLoad = async () => {
	const posts = await getBlogPosts();

	return { posts };
};
