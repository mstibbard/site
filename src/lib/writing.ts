import type { Post } from './types';

/**
 * Retrieves the Front Matter + slug for each "published" .md file in /src/content/writing.
 *
 * By default the response is sorted in descending order on "date".
 */
export async function getPosts(sortOrder: 'asc' | 'desc' = 'desc') {
	let posts: Post[] = [];

	const paths = import.meta.glob('/src/content/writing/*.md', {
		eager: true
	});

	for (const path in paths) {
		const file = paths[path];
		const slug = path.split('/').at(-1)?.replace('.md', '');

		if (file && typeof file === 'object' && 'metadata' in file && slug) {
			const metadata = file.metadata as Omit<Post, 'slug'>;
			const post = { ...metadata, slug } satisfies Post;
			posts.push(post);
		}
	}

	posts = posts.sort((first, second) => {
		const firstDate = new Date(first.datePublished).getTime();
		const secondDate = new Date(second.datePublished).getTime();
		return sortOrder === 'asc' ? firstDate - secondDate : secondDate - firstDate;
	});

	return posts;
}

/**
 * Produces an array containing the slug for each "published" .md file in /src/content/writing.
 *
 * By default the response is sorted in descending order on "date".
 */
export async function getPostsSlugList(sortOrder: 'asc' | 'desc' = 'desc') {
	const posts: Post[] = await getPosts(sortOrder);
	const slugs = posts.map((item) => item.slug);
	return slugs;
}

type DateStyle = Intl.DateTimeFormatOptions['dateStyle'];

/**
 * Formats an ISO date string.
 *
 * Defaults to dateStyle `medium` and locales `en`.
 *
 * @example
 * formatDate('2024-04-16');
 * 'Apr 16, 2024'
 *
 * formatDate('2024-04-16', 'long');
 * 'April 16, 2024'
 *
 * formatDate('2024-04-16', 'full');
 * 'Tuesday, April 16, 2024'
 *
 * formatDate('2024-04-16', 'short');
 * '4/16/24'
 *
 * formatDate('2024-04-16', 'short', 'en-AU');
 * '16/4/24'
 *
 * formatDate('2024-04-16', 'long', 'en-AU');
 * '16 April 2024'
 */
export function formatDate(date: string, dateStyle: DateStyle = 'medium', locales = 'en-AU') {
	const dateToFormat = new Date(date.replaceAll('-', '/'));
	const dateFormatter = new Intl.DateTimeFormat(locales, { dateStyle });
	return dateFormatter.format(dateToFormat);
}
