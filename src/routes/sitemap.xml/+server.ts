// Docs: https://github.com/jasongitmail/super-sitemap
import type { RequestHandler } from './$types';
import { siteConfig } from '$lib/config';
import { getPostsSlugList } from '$lib/writing';
import * as sitemap from 'super-sitemap';

export const prerender = true;

export const GET: RequestHandler = async () => {
	const postSlugs: string[] = await getPostsSlugList();

	return await sitemap.response({
		origin: siteConfig.url,
		paramValues: {
			'/writing/[slug]': postSlugs
		},
		additionalPaths: []
	});
};
