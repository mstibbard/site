<script lang="ts">
	import { formatDate } from '$lib/writing.js';

	const { data } = $props();
</script>

<section class="py-4">
	<div class="prose max-w-none text-gray-600">
		<p>
			Hi! You've stumbled upon my personal site. This is where I write (very occasionally) on topics
			that I've learned or find interesting at the time.
		</p>
	</div>
</section>

<section class="my-8">
	<div class="grid grid-cols-1 gap-x-2 gap-y-4 text-gray-700 md:grid-cols-[6fr,1fr,1fr]">
		<div class="text-sm font-semibold">Title</div>
		<div class="hidden text-sm font-semibold md:flex">Published</div>
		<div class="hidden text-sm font-semibold md:flex">Updated</div>

		{#each data.posts as { title, slug, datePublished, dateUpdated }}
			<div class="text-lg font-semibold tracking-tight">
				<a href={`/writing/${slug}`} class="hover:underline">{title}</a>
			</div>
			<div class="hidden md:flex">{formatDate(datePublished)}</div>
			<div class="hidden md:flex">
				{#if dateUpdated}{formatDate(dateUpdated)}{:else}-{/if}
			</div>
		{/each}
	</div>
</section>
