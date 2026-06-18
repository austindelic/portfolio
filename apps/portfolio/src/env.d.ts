/// <reference path="../.astro/types.d.ts" />
/// <reference types="@astrojs/image/client" />

declare module "*.glsl?raw" {
	const source: string;
	export default source;
}
