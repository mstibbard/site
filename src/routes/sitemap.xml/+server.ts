// Docs: https://github.com/jasongitmail/super-sitemap
import type { RequestHandler } from './$types';
import { siteConfig } from '$lib/config';
import { getBlogPostsSlugList } from '$lib/blog';
import * as sitemap from 'super-sitemap';

export const prerender = true;

export const GET: RequestHandler = async () => {
	const blogPostSlugs: string[] = await getBlogPostsSlugList();

	return await sitemap.response({
		origin: siteConfig.url,
		paramValues: {
			'/[slug]': blogPostSlugs
		},
		additionalPaths: []
	});
};
