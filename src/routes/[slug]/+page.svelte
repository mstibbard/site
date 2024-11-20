<script lang="ts">
	import { formatDate } from '$lib/blog';

	const { data } = $props();
	const { meta, content: ContentComponent } = data;
</script>

<article class="mx-auto max-w-5xl px-4 sm:px-6 md:my-16 lg:px-8">
	<hgroup class="text-center">
		<h1 class="mb-8 text-4xl font-bold tracking-tight md:text-5xl">{meta.title}</h1>

		<div class="prose mx-auto">
			{#if meta.description}
				<p class="prose-lg">{meta.description}</p>
			{/if}
			<span class="prose-sm">
				{formatDate(meta.datePublished, 'long')}
			</span>
			{#if meta.dateUpdated}
				<br /><span class=" prose-sm italic">Updated {formatDate(meta.dateUpdated, 'long')}</span>
			{/if}
		</div>
	</hgroup>

	<div
		class="prose-lg py-12 text-justify prose-a:text-blue-500 hover:prose-a:underline prose-blockquote:mx-auto prose-blockquote:max-w-lg prose-blockquote:text-center prose-blockquote:italic prose-pre:bg-[#1E1E1E] prose-pre:text-[#D4D4D4] prose-ol:list-decimal prose-ul:list-disc"
	>
		<ContentComponent />
	</div>
</article>
