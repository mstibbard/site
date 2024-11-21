import type { Post } from '$lib/types';
import { getPosts } from '$lib/writing';
import { siteConfig } from '$lib/config';

export const prerender = true;

export const GET = async () => {
	const posts: Post[] = await getPosts();

	const headers = { 'Content-Type': 'application/xml' };

	const xml = `
		<rss xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
			<channel>
				<title>${siteConfig.name}</title>
				<description>${siteConfig.description}</description>
				<link>${siteConfig.url}</link>
				<atom:link href="${siteConfig.url}/rss.xml" rel="self" type="application/rss+xml"/>
				${posts
					.map(
						(post) => `
						<item>
							<title>${post.title}</title>
							<description>${post.description}</description>
							<link>${siteConfig.url}/writing/${post.slug}</link>
							<guid isPermaLink="true">${siteConfig.url}/writing/${post.slug}</guid>
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
