import type { BlogPost } from '$lib/types';
import { getBlogPosts } from '$lib/blog';
import { siteConfig } from '$lib/config';

export const prerender = true;

export const GET = async () => {
	const blogPosts: BlogPost[] = await getBlogPosts();

	const headers = { 'Content-Type': 'application/xml' };

	const xml = `
		<rss xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
			<channel>
				<title>${siteConfig.name}</title>
				<description>${siteConfig.description}</description>
				<link>${siteConfig.url}</link>
				<atom:link href="${siteConfig.url}/rss.xml" rel="self" type="application/rss+xml"/>
				${blogPosts
					.map(
						(post) => `
						<item>
							<title>${post.title}</title>
							<description>${post.description}</description>
							<link>${siteConfig.url}/${post.slug}</link>
							<guid isPermaLink="true">${siteConfig.url}/${post.slug}</guid>
							<pubDate>${new Date(post.datePublished).toUTCString()}</pubDate>
						</item>
					`
					)
					.join('')}
			</channel>
		</rss>
	`.trim();

	return new Response(xml, { headers });
};
