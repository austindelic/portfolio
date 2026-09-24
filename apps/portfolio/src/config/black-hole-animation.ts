import routeData from "../data/black-hole-routes.json";

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

const routes = routeData as Record<BlackHoleAnimationRouteKey, BlackHoleRouteAnimation>;

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
