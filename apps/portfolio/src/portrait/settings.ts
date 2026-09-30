export const palettes = {
	amber: {
		label: "Amber",
		colors: ["#17130f", "#88562f", "#ffa133", "#ffdf9b"],
	},
	mono: {
		label: "Monochrome",
		colors: ["#17191b", "#555960", "#a3a8a8", "#f0eee4"],
	},
	green: {
		label: "Phosphor green",
		colors: ["#071a13", "#20593b", "#64d58c", "#d0f7b1"],
	},
	blue: {
		label: "Ice blue",
		colors: ["#0c1a30", "#325886", "#7fbae4", "#d7f5ff"],
	},
	olive: {
		label: "Muted olive",
		colors: ["#242b20", "#566344", "#96a575", "#dce1b4"],
	},
	riso: {
		label: "Pink / cyan",
		colors: ["#231c40", "#c15383", "#66cbd0", "#f5e6da"],
	},
} as const;

export type Palette = keyof typeof palettes;
export type Treatment =
	| "bayer"
	| "halftone"
	| "stipple"
	| "ascii"
	| "mosaic"
	| "quantize"
	| "blueprint"
	| "riso"
	| "thermal"
	| "crt"
	| "original";
export const placements = {
	card: "Compact About card",
	side: "Beside the introduction",
	banner: "Wide banner",
	hero: "Large portrait panel",
	badge: "Badge beside the name",
} as const;
export type Placement = keyof typeof placements;

export interface PortraitSettings {
	preset: string;
	palette: Palette;
	grain: number;
	contrast: number;
	brightness: number;
	crop: "face" | "full";
	placement: Placement;
	scanlines: boolean;
	tilt: boolean;
	reveal: boolean;
}
interface Preset {
	id: string;
	name: string;
	description: string;
	treatment: Treatment;
	palette: Palette;
	grain: number;
	contrast: number;
	brightness?: number;
	scanlines?: boolean;
}
export const presets: readonly Preset[] = [
	{
		id: "amber-bayer",
		name: "Amber Bayer",
		description: "Ordered pixels. Warm signal.",
		treatment: "bayer",
		palette: "amber",
		grain: 2,
		contrast: 1.25,
	},
	{
		id: "fine-newsprint",
		name: "Fine Newsprint",
		description: "A portrait from the Sunday paper.",
		treatment: "halftone",
		palette: "mono",
		grain: 5,
		contrast: 1.15,
	},
	{
		id: "coarse-halftone",
		name: "Coarse Halftone",
		description: "Big dots, a little comic-book ink.",
		treatment: "halftone",
		palette: "amber",
		grain: 12,
		contrast: 1.3,
	},
	{
		id: "ink-stipple",
		name: "Ink Stipple",
		description: "Thousands of scattered pinpoints.",
		treatment: "stipple",
		palette: "mono",
		grain: 2,
		contrast: 1.3,
	},
	{
		id: "terminal-ascii",
		name: "Terminal ASCII",
		description: "A face written in characters.",
		treatment: "ascii",
		palette: "green",
		grain: 3,
		contrast: 1.35,
	},
	{
		id: "block-mosaic",
		name: "Block Mosaic",
		description: "Four tones. Chunky geometry.",
		treatment: "mosaic",
		palette: "riso",
		grain: 9,
		contrast: 1.2,
	},
	{
		id: "game-boy",
		name: "Game Boy",
		description: "Pocket-sized, four-shade nostalgia.",
		treatment: "quantize",
		palette: "olive",
		grain: 4,
		contrast: 1.5,
	},
	{
		id: "blue-blueprint",
		name: "Blue Blueprint",
		description: "Contour lines on a drafting grid.",
		treatment: "blueprint",
		palette: "blue",
		grain: 3,
		contrast: 1.3,
	},
	{
		id: "risograph",
		name: "Risograph",
		description: "Two inks with imperfect registration.",
		treatment: "riso",
		palette: "riso",
		grain: 3,
		contrast: 1.15,
	},
	{
		id: "thermal-print",
		name: "Thermal Print",
		description: "Receipt-paper stripes and ink.",
		treatment: "thermal",
		palette: "mono",
		grain: 2,
		contrast: 1.4,
	},
	{
		id: "crt-portrait",
		name: "CRT Portrait",
		description: "A soft glow behind the glass.",
		treatment: "crt",
		palette: "green",
		grain: 2,
		contrast: 1.2,
		scanlines: true,
	},
	{
		id: "original",
		name: "Original",
		description: "Sea breeze. No filter required.",
		treatment: "original",
		palette: "amber",
		grain: 2,
		contrast: 1,
	},
];

export function getPreset(id: string) {
	return presets.find((preset) => preset.id === id) ?? presets[0];
}
export function defaults(id = presets[0].id): PortraitSettings {
	const preset = getPreset(id);
	return {
		preset: preset.id,
		palette: preset.palette,
		grain: preset.grain,
		contrast: preset.contrast,
		brightness: preset.brightness ?? 0,
		crop: "face",
		placement: "card",
		scanlines: preset.scanlines ?? false,
		tilt: false,
		reveal: false,
	};
}

const bounded = (
	value: string | null,
	fallback: number,
	min: number,
	max: number,
) => {
	const number = value === null || value.trim() === "" ? NaN : Number(value);
	return Number.isFinite(number)
		? Math.min(max, Math.max(min, number))
		: fallback;
};
export function readSettings(params: URLSearchParams): PortraitSettings {
	const result = defaults(params.get("portrait") ?? undefined);
	const palette = params.get("palette");
	const placement = params.get("placement");
	if (palette && Object.hasOwn(palettes, palette))
		result.palette = palette as Palette;
	if (placement && Object.hasOwn(placements, placement))
		result.placement = placement as Placement;
	result.grain = Math.round(bounded(params.get("grain"), result.grain, 1, 16));
	result.contrast = bounded(params.get("contrast"), result.contrast, 0.65, 1.9);
	result.brightness = bounded(
		params.get("brightness"),
		result.brightness,
		-0.2,
		0.2,
	);
	if (params.get("crop") === "full") result.crop = "full";
	for (const key of ["scanlines", "tilt", "reveal"] as const) {
		if (params.has(key)) result[key] = params.get(key) === "1";
	}
	return result;
}
export function settingsURL(
	settings: PortraitSettings,
	path: "/" | "/portrait-lab",
	origin: string,
) {
	const url = new URL(path, origin);
	for (const [key, value] of Object.entries(settings)) {
		url.searchParams.set(
			key === "preset" ? "portrait" : key,
			typeof value === "boolean" ? (value ? "1" : "0") : String(value),
		);
	}
	return url;
}

// A square that includes the cap, smile, shoulders and a little coastline.
export const faceCrop = { left: 0.16, top: 0.08, size: 0.68 };
