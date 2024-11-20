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
</div>
