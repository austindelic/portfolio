export type BlackHoleVec3 = [number, number, number];

export type BlackHoleAnimationEase =
	| "linear"
	| "smoothstep"
	| "easeInOutCubic"
	| "cinematic";

export type BlackHoleAnimationPaletteMode = "source" | "custom";

export type BlackHoleAnimationGlyphPreset =
	| "gargantua"
	| "classic"
	| "dense"
	| "custom";

export type BlackHoleAnimationKeyframe = {
	duration: number;
	position: BlackHoleVec3;
	forward: BlackHoleVec3;
	universeSign: number;
	ease?: BlackHoleAnimationEase;
	timeScale?: number;
	exposure?: number;
	bloomStrength?: number;
	temporalJitter?: number;
	asciiEnabled?: boolean;
	textSize?: number;
	brightness?: number;
	contrast?: number;
	glyphPreset?: BlackHoleAnimationGlyphPreset;
	customGlyphs?: string;
	paletteMode?: BlackHoleAnimationPaletteMode;
	shadowColor?: string;
	midColor?: string;
	highlightColor?: string;
};

export type BlackHoleRouteAnimation = {
	intro: BlackHoleAnimationKeyframe[];
	idle: BlackHoleAnimationKeyframe[];
	transition: BlackHoleAnimationKeyframe[];
};

export type BlackHoleAnimationRouteKey =
	| "/"
	| "/blog"
	| "/blog/*"
	| "/socials"
	| "/404"
	| "fallback";

const baseVisual = {
	timeScale: 2,
	exposure: 2,
	bloomStrength: 0,
	temporalJitter: 0,
	asciiEnabled: true,
	textSize: 9,
	brightness: 0,
	contrast: 1,
	glyphPreset: "custom",
	customGlyphs: "voidCG08AA",
	paletteMode: "source",
} satisfies Partial<BlackHoleAnimationKeyframe>;

const routes = {
	"/": {
		intro: [
			{
				duration: 0,
				position: [0.95, 0.009, 0.588],
				forward: [0.847, 0.037, 0.53],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 5,
				position: [8.613, 3.4, 21.229],
				forward: [-0.272, 0.179, -0.946],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		idle: [
			{
				duration: 7.8,
				position: [8.613, 3.4, 21.229],
				forward: [-0.272, 0.179, -0.946],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 8.8,
				position: [10.4, 1.2, 19.1],
				forward: [-0.438, 0.08, -0.896],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 8.2,
				position: [7.372, 2.238, 17.212],
				forward: [-0.439, -0.07, -0.896],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 7.6,
				position: [11.256, 4.159, 18.44],
				forward: [-0.566, -0.067, -0.822],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		transition: [
			{
				duration: 1.6,
				position: [12.8, 5.4, 24.2],
				forward: [-0.48, -0.09, -0.873],
				universeSign: 1,
				ease: "easeInOutCubic",
				...baseVisual,
			},
			{
				duration: 1.2,
				position: [0.95, 0.009, 0.588],
				forward: [0.847, 0.037, 0.53],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
	},
	"/blog": {
		intro: [
			{
				duration: 0,
				position: [13.2, 3.2, 23.7],
				forward: [-0.61, -0.035, -0.792],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 3.2,
				position: [10.7, 0.7, 18.9],
				forward: [-0.626, 0.08, -0.776],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		idle: [
			{
				duration: 8.5,
				position: [10.7, 0.7, 18.9],
				forward: [-0.626, 0.08, -0.776],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 8.5,
				position: [9.2, -1.2, 17.4],
				forward: [-0.58, 0.16, -0.799],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 8.5,
				position: [12.1, 2.4, 20.8],
				forward: [-0.5, -0.02, -0.866],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		transition: [
			{
				duration: 1.7,
				position: [13.8, 4.8, 25.4],
				forward: [-0.52, -0.06, -0.852],
				universeSign: 1,
				ease: "easeInOutCubic",
				...baseVisual,
			},
		],
	},
	"/blog/*": {
		intro: [
			{
				duration: 0,
				position: [12.2, 2.1, 22.8],
				forward: [-0.52, 0.02, -0.854],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 3,
				position: [9.6, 1.1, 18.2],
				forward: [-0.49, 0.12, -0.864],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		idle: [
			{
				duration: 9,
				position: [9.6, 1.1, 18.2],
				forward: [-0.49, 0.12, -0.864],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 9,
				position: [8.8, -0.6, 17.2],
				forward: [-0.53, 0.08, -0.844],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 9,
				position: [11.3, 1.9, 20.1],
				forward: [-0.46, 0.06, -0.886],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		transition: [
			{
				duration: 1.6,
				position: [12.9, 3.3, 24.8],
				forward: [-0.48, 0.01, -0.877],
				universeSign: 1,
				ease: "easeInOutCubic",
				...baseVisual,
			},
		],
	},
	"/socials": {
		intro: [
			{
				duration: 0,
				position: [11.8, -3.4, 21.8],
				forward: [-0.36, 0.19, -0.914],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 3.1,
				position: [8.9, -2.1, 17.9],
				forward: [-0.29, 0.21, -0.934],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		idle: [
			{
				duration: 8,
				position: [8.9, -2.1, 17.9],
				forward: [-0.29, 0.21, -0.934],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 8,
				position: [10.8, -4.1, 20.4],
				forward: [-0.36, 0.16, -0.919],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 8,
				position: [7.8, -1.1, 16.7],
				forward: [-0.2, 0.27, -0.942],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		transition: [
			{
				duration: 1.6,
				position: [12.1, -4.8, 23.8],
				forward: [-0.34, 0.18, -0.923],
				universeSign: 1,
				ease: "easeInOutCubic",
				...baseVisual,
			},
		],
	},
	"/404": {
		intro: [
			{
				duration: 0,
				position: [14.4, 6.2, 26.8],
				forward: [-0.7, -0.18, -0.691],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 3.5,
				position: [10.6, 4.6, 19.4],
				forward: [-0.74, -0.08, -0.668],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		idle: [
			{
				duration: 7,
				position: [10.6, 4.6, 19.4],
				forward: [-0.74, -0.08, -0.668],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 7,
				position: [12.8, 5.6, 22.1],
				forward: [-0.66, -0.1, -0.744],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		transition: [
			{
				duration: 1.8,
				position: [15.2, 7.4, 29.5],
				forward: [-0.66, -0.14, -0.738],
				universeSign: 1,
				ease: "easeInOutCubic",
				...baseVisual,
			},
		],
	},
	fallback: {
		intro: [
			{
				duration: 0,
				position: [0.95, 0.009, 0.588],
				forward: [0.847, 0.037, 0.53],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 3,
				position: [8.613, 3.4, 21.229],
				forward: [-0.272, 0.179, -0.946],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		idle: [
			{
				duration: 8,
				position: [8.613, 3.4, 21.229],
				forward: [-0.272, 0.179, -0.946],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 8,
				position: [10.4, 1.2, 19.1],
				forward: [-0.438, 0.08, -0.896],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		transition: [
			{
				duration: 1.6,
				position: [12.8, 5.4, 24.2],
				forward: [-0.48, -0.09, -0.873],
				universeSign: 1,
				ease: "easeInOutCubic",
				...baseVisual,
			},
		],
	},
} satisfies Record<BlackHoleAnimationRouteKey, BlackHoleRouteAnimation>;

export const BLACK_HOLE_ANIMATION_ROUTES = routes;

export const BLACK_HOLE_ANIMATION_ROUTE_OPTIONS = [
	{ label: "Home", value: "/" },
	{ label: "Blog", value: "/blog" },
	{ label: "Blog post", value: "/blog/*" },
	{ label: "Socials", value: "/socials" },
	{ label: "404", value: "/404" },
	{ label: "Fallback", value: "fallback" },
] satisfies Array<{ label: string; value: BlackHoleAnimationRouteKey }>;

export function normalizeBlackHoleAnimationRoute(
	pathname: string | undefined,
): BlackHoleAnimationRouteKey {
	const path = (pathname || "/").split(/[?#]/, 1)[0] || "/";
	const normalized =
		path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;

	if (normalized === "/") return "/";
	if (normalized === "/blog") return "/blog";
	if (normalized.startsWith("/blog/")) return "/blog/*";
	if (normalized === "/socials") return "/socials";
	if (normalized === "/404") return "/404";

	return "fallback";
}

export function getBlackHoleRouteAnimation(
	pathname: string | undefined,
): BlackHoleRouteAnimation {
	return routes[normalizeBlackHoleAnimationRoute(pathname)];
}
