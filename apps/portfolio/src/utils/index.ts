import type { CollectionEntry } from "astro:content";

export function sortMDByDate(posts: CollectionEntry<"blog">[] = []) {
	return posts.sort(
		(a, b) =>
			new Date(b.data.publishDate).valueOf() -
			new Date(a.data.publishDate).valueOf(),
	);
}
