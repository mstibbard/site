import type { Component } from 'svelte';

// https://www.totaltypescript.com/concepts/the-prettify-helper
type Prettify<T> = {
	[K in keyof T]: T[K];
} & unknown;
export type FrontMatter = {
	title: string;
	description: string;
	datePublished: string;
	dateUpdated?: string;
};
export type BlogPost = Prettify<
	FrontMatter & {
		slug: string;
	}
>;
export type MdFile = {
	default: Component;
	metadata: FrontMatter;
};
