<script lang="ts">
	import { page } from '$app/stores';
	import '../app.css';

	const name = 'stibbard.io';
	const keywords = 'blog,technology,learning';
	let { children } = $props();

	// Set title & description from page `load` functions, otherwise default to config values
	let title = $derived($page.data.meta?.title ? `${$page.data.meta.title} | ${name}` : name);

	let description = $derived(
		$page.data.meta?.description
			? $page.data.meta.description
			: "Matt Stibbard's personal site, where he writes (very occasionally) about topics he's learned or found interesting at the time."
	);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="application-name" content={name} />
	<meta name="description" content={description} />
	<meta name="keywords" content={keywords} />
	<meta property="og:type" content="website" />
	<meta name="og:title" content={title} />
	<meta name="og:description" content={description} />
	<meta property="og:url" content={`${$page.url}`} />
	<meta property="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:creator" content="@MatthewStibbard" />
	<meta property="twitter:url" content={`${$page.url}`} />
	<link rel="canonical" href={`${$page.url}`} />
</svelte:head>

<div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
	<nav class="py-6" aria-label="Main">
		<a href="/" class="text-2xl font-bold text-gray-900">{name}</a>
	</nav>

	<main class="mb-2">
		{@render children()}
	</main>
</div>
