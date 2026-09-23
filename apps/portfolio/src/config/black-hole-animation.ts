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

export type BlackHoleOrbit = {
	anchor: BlackHoleVec3;
	lookTarget: BlackHoleVec3;
	driftRadius: number;
	period: number;
	/** Maximum settled heading offsets in degrees; zero when omitted. */
	yawAmplitude?: number;
	pitchAmplitude?: number;
	framingTarget: [number, number];
	/** Session variation affects phase only, never the page composition. */
	phaseOffset?: number;
	/** Inner-gap waypoint for entering or leaving below-disk views. */
	approach?: BlackHoleVec3;
};

export type BlackHoleRouteAnimation = {
	orbit: BlackHoleOrbit;
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
	bloomStrength: 0.65,
	temporalJitter: 0,
	asciiEnabled: true,
	textSize: 9,
	brightness: 0,
	contrast: 1,
	glyphPreset: "gargantua",
	customGlyphs: "voidCG08AA",
	paletteMode: "source",
} satisfies Partial<BlackHoleAnimationKeyframe>;

const routes = {
	"/": {
		orbit: {
			anchor: [8.613, 3.1586, 21.229],
			lookTarget: [5.861, 2.2396, 11.659],
			driftRadius: 0.035,
			yawAmplitude: 0.6,
			pitchAmplitude: 0.2,
			period: 140,
			framingTarget: [0, 0],
		},
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
				position: [8.613, 3.1586, 21.229],
				forward: [-0.2752, -0.0919, -0.957],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		idle: [
			{
				duration: 7.8,
				position: [8.613, 3.1586, 21.229],
				forward: [-0.2752, -0.0919, -0.957],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 8.8,
				position: [10.4, 2.786, 19.1],
				forward: [-0.4377, -0.0823, -0.8954],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 8.2,
				position: [7.372, 2.4849, 17.212],
				forward: [-0.4383, -0.0868, -0.8946],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 7.6,
				position: [11.256, 3.0515, 18.44],
				forward: [-0.5645, -0.0952, -0.8199],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		transition: [
			{
				duration: 1.6,
				position: [12.8, 4.0182, 24.2],
				forward: [-0.4794, -0.1006, -0.8718],
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
		orbit: {
			anchor: [3.45, 3.45, 4.6],
			lookTarget: [-4.0791, -0.92803, -0.3138],
			driftRadius: 0.012,
			yawAmplitude: 0.6,
			pitchAmplitude: 0.2,
			period: 150,
			framingTarget: [0, 0],
		},
		intro: [
			{
				duration: 0,
				position: [13.2, 3.7161, 23.7],
				forward: [-0.6077, -0.091, -0.789],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 3.2,
				position: [10.7, 2.7341, 18.9],
				forward: [-0.6259, -0.0801, -0.7758],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		idle: [
			{
				duration: 8.5,
				position: [10.7, 2.7341, 18.9],
				forward: [-0.6259, -0.0801, -0.7758],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 8.5,
				position: [9.2, 2.3122, 17.4],
				forward: [-0.5859, -0.0719, -0.8072],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 8.5,
				position: [12.1, 3.2108, 20.8],
				forward: [-0.4981, -0.0875, -0.8627],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		transition: [
			{
				duration: 1.7,
				position: [13.8, 4.1655, 25.4],
				forward: [-0.5185, -0.098, -0.8495],
				universeSign: 1,
				ease: "easeInOutCubic",
				...baseVisual,
			},
		],
	},
	"/blog/*": {
		orbit: {
			anchor: [4.4, 0.44, 2.2],
			lookTarget: [6.56683, -0.45087, -7.52169],
			driftRadius: 0.006,
			yawAmplitude: 0.25,
			pitchAmplitude: 0.1,
			period: 160,
			framingTarget: [0, 0],
		},
		intro: [
			{
				duration: 0,
				position: [12.2, 3.4159, 22.8],
				forward: [-0.5181, -0.0862, -0.8509],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 3,
				position: [9.6, 2.6268, 18.2],
				forward: [-0.4917, -0.0819, -0.8669],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		idle: [
			{
				duration: 9,
				position: [9.6, 2.6268, 18.2],
				forward: [-0.4917, -0.0819, -0.8669],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 9,
				position: [8.8, 2.3209, 17.2],
				forward: [-0.5303, -0.0745, -0.8445],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 9,
				position: [11.3, 3.0255, 20.1],
				forward: [-0.4591, -0.0854, -0.8843],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		transition: [
			{
				duration: 1.6,
				position: [12.9, 3.8417, 24.8],
				forward: [-0.4781, -0.0914, -0.8735],
				universeSign: 1,
				ease: "easeInOutCubic",
				...baseVisual,
			},
		],
	},
	"/socials": {
		orbit: {
			anchor: [1.155, 0.105, 0.63],
			lookTarget: [0.28344, 0.18127, 10.59195],
			driftRadius: 0.0015,
			yawAmplitude: 0.25,
			pitchAmplitude: 0.1,
			period: 160,
			framingTarget: [0, 0],
		},
		intro: [
			{
				duration: 0,
				position: [11.8, 2.671, 21.8],
				forward: [-0.3658, -0.0623, -0.9286],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 3.1,
				position: [8.9, 2.2688, 17.9],
				forward: [-0.2958, -0.068, -0.9528],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		idle: [
			{
				duration: 8,
				position: [8.9, 2.2688, 17.9],
				forward: [-0.2958, -0.068, -0.9528],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 8,
				position: [10.8, 2.4159, 20.4],
				forward: [-0.3641, -0.0592, -0.9295],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 8,
				position: [7.8, 2.1734, 16.7],
				forward: [-0.2071, -0.0723, -0.9756],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		transition: [
			{
				duration: 1.6,
				position: [12.1, 2.712, 23.8],
				forward: [-0.3451, -0.0562, -0.9369],
				universeSign: 1,
				ease: "easeInOutCubic",
				...baseVisual,
			},
		],
	},
	"/404": {
		orbit: {
			anchor: [-1.1, -0.22, 1.1],
			lookTarget: [-5.12729, 1.18028, -7.94545],
			driftRadius: 0.002,
			yawAmplitude: 0.25,
			pitchAmplitude: 0.1,
			period: 150,
			framingTarget: [0, 0],
			approach: [1.15, 0.3, 0.7],
		},
		intro: [
			{
				duration: 0,
				position: [14.4, 4.574, 26.8],
				forward: [-0.7078, -0.104, -0.6987],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 3.5,
				position: [10.6, 3.166, 19.4],
				forward: [-0.7388, -0.0971, -0.6669],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		idle: [
			{
				duration: 7,
				position: [10.6, 3.166, 19.4],
				forward: [-0.7388, -0.0971, -0.6669],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 7,
				position: [12.8, 3.7713, 22.1],
				forward: [-0.6602, -0.1014, -0.7442],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		transition: [
			{
				duration: 1.8,
				position: [15.2, 5.1671, 29.5],
				forward: [-0.6626, -0.1092, -0.7409],
				universeSign: 1,
				ease: "easeInOutCubic",
				...baseVisual,
			},
		],
	},
	fallback: {
		orbit: {
			anchor: [8.613, 3.1586, 21.229],
			lookTarget: [5.861, 2.2396, 11.659],
			driftRadius: 0.035,
			yawAmplitude: 0.6,
			pitchAmplitude: 0.2,
			period: 140,
			framingTarget: [0, 0],
		},
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
				position: [8.613, 3.1586, 21.229],
				forward: [-0.2752, -0.0919, -0.957],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		idle: [
			{
				duration: 8,
				position: [8.613, 3.1586, 21.229],
				forward: [-0.2752, -0.0919, -0.957],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
			{
				duration: 8,
				position: [10.4, 2.786, 19.1],
				forward: [-0.4377, -0.0823, -0.8954],
				universeSign: 1,
				ease: "cinematic",
				...baseVisual,
			},
		],
		transition: [
			{
				duration: 1.6,
				position: [12.8, 4.0182, 24.2],
				forward: [-0.4794, -0.1006, -0.8718],
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
