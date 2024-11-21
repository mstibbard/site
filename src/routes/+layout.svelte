<script lang="ts">
	import { page } from '$app/stores';
	import { siteConfig } from '$lib/config';
	import '../app.css';

	let { children } = $props();

	// Set title & description from page `load` functions, otherwise default to config values
	let title = $derived(
		$page.data.meta?.title ? `${$page.data.meta.title} | ${siteConfig.name}` : siteConfig.name
	);
	let description = $derived(
		$page.data.meta?.description ? $page.data.meta.description : siteConfig.description
	);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="application-name" content={siteConfig.name} />
	<meta name="description" content={description} />
	<meta property="og:type" content="website" />
	<meta name="og:title" content={title} />
	<meta name="og:description" content={description} />
	<meta property="og:url" content={`${$page.url}`} />
	<meta property="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:creator" content={siteConfig.twitterHandle} />
	<meta property="twitter:url" content={`${$page.url}`} />
	<link rel="canonical" href={`${$page.url}`} />
</svelte:head>

<div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
	<nav class="py-6" aria-label="Main">
		<a href="/" class="text-2xl font-bold text-gray-900">{siteConfig.name}</a>
	</nav>

	<main class="mb-2">
		{@render children()}
	</main>

	<footer aria-labelledby="footer" class="py-12">
		<h2 id="footer-heading" class="sr-only">Footer</h2>
		<div class="flex justify-center text-sm tracking-tight">
			Copyright &copy; {new Date().getFullYear()} Matthew Stibbard
		</div>
		<div class="mt-4 flex justify-center gap-x-4">
			<a href={`https://twitter.com/${siteConfig.twitterHandle}`} aria-label="X / Twitter">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6"
					fill="currentColor"
					viewBox="0 0 16 16"
				>
					<path
						d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865z"
					/>
				</svg></a
			>
			<a href="https://bsky.app/profile/stibbard.io" aria-label="Bluesky">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" class="h-6 w-6"
					><path
						d="M111.8 62.2C170.2 105.9 233 194.7 256 242.4c23-47.6 85.8-136.4 144.2-180.2c42.1-31.6 110.3-56 110.3 21.8c0 15.5-8.9 130.5-14.1 149.2C478.2 298 412 314.6 353.1 304.5c102.9 17.5 129.1 75.5 72.5 133.5c-107.4 110.2-154.3-27.6-166.3-62.9l0 0c-1.7-4.9-2.6-7.8-3.3-7.8s-1.6 3-3.3 7.8l0 0c-12 35.3-59 173.1-166.3 62.9c-56.5-58-30.4-116 72.5-133.5C100 314.6 33.8 298 15.7 233.1C10.4 214.4 1.5 99.4 1.5 83.9c0-77.8 68.2-53.4 110.3-21.8z"
						fill="#1185fe"
					/></svg
				></a
			>
			<a href="https://github.com/mstibbard" aria-label="GitHub"
				><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" class="h-6 w-6"
					><path
						d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3 .3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5 .3-6.2 2.3zm44.2-1.7c-2.9 .7-4.9 2.6-4.6 4.9 .3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3 .7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3 .3 2.9 2.3 3.9 1.6 1 3.6 .7 4.3-.7 .7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3 .7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3 .7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"
					/></svg
				></a
			>
			<a href={`${siteConfig.url}/rss.xml`} aria-label="RSS">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24"
					><path
						d="M0 0v24h24v-24h-24zm6.168 20c-1.197 0-2.168-.969-2.168-2.165s.971-2.165 2.168-2.165 2.167.969 2.167 2.165-.97 2.165-2.167 2.165zm5.18 0c-.041-4.029-3.314-7.298-7.348-7.339v-3.207c5.814.041 10.518 4.739 10.56 10.546h-3.212zm5.441 0c-.021-7.063-5.736-12.761-12.789-12.792v-3.208c8.83.031 15.98 7.179 16 16h-3.211z"
					/></svg
				></a
			>
		</div>
	</footer>
</div>
