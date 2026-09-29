import { mkdirSync, writeFileSync } from "node:fs";
import { themeNames } from "@shikijs/themes";

type Theme = {
	name: string;
	displayName?: string;
	type: "dark" | "light";
	colors: Record<string, string>;
	tokenColors: Array<{
		scope?: string | string[];
		settings: { foreground?: string };
	}>;
};
type RGB = [number, number, number];
const out = new URL("../src/generated/", import.meta.url);
mkdirSync(out, { recursive: true });
const hex = (rgb: RGB) =>
	`#${rgb
		.map((x) =>
			Math.round(Math.max(0, Math.min(255, x)))
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
const parse = (
	value: string | undefined,
	background?: RGB,
): RGB | undefined => {
	if (!value || !/^#[\da-f]{3,8}$/i.test(value)) return;
	let digits = value.slice(1);
	if (digits.length === 3 || digits.length === 4)
		digits = [...digits].map((x) => x + x).join("");
	if (digits.length !== 6 && digits.length !== 8) return;
	const channel = (at: number) => Number.parseInt(digits.slice(at, at + 2), 16);
	const rgb: RGB = [channel(0), channel(2), channel(4)];
	if (digits.length === 8 && background) {
		const alpha = channel(6) / 255;
		return rgb.map((x, i) => x * alpha + background[i] * (1 - alpha)) as RGB;
	}
	return rgb;
};
const blend = (a: RGB, b: RGB, amount: number): RGB =>
	a.map((x, i) => x * (1 - amount) + b[i] * amount) as RGB;
const brightness = (rgb: RGB) => {
	const [r, g, b] = rgb.map((n) => {
		const c = n / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: RGB, b: RGB) => {
	const x = brightness(a),
		y = brightness(b);
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const readable = (color: RGB, background: RGB, ratio: number): RGB => {
	if (contrast(color, background) >= ratio) return color;
	const pole: RGB = brightness(background) < 0.18 ? [255, 255, 255] : [0, 0, 0];
	let low = 0,
		high = 1;
	for (let i = 0; i < 12; i++) {
		const mid = (low + high) / 2;
		if (contrast(blend(color, pole, mid), background) >= ratio) high = mid;
		else low = mid;
	}
	return blend(color, pole, high);
};
const scopeColor = (
	theme: Theme,
	pattern: RegExp,
	bg: RGB,
): RGB | undefined => {
	for (const token of theme.tokenColors) {
		const scopes = Array.isArray(token.scope)
			? token.scope
			: [token.scope ?? ""];
		if (scopes.some((scope) => pattern.test(scope))) {
			const color = parse(token.settings.foreground, bg);
			if (color) return color;
		}
	}
};
const cssName = (name: string) =>
	name.replace(/[A-Z]/g, (x) => `-${x.toLowerCase()}`);
const syntaxScopes: Record<string, RegExp> = {
	constant: /constant\.numeric|constant\.language/,
	string: /^string(?:\.|$)/,
	comment: /^comment(?:\.|$)/,
	keyword: /^keyword(?:\.|$)/,
	parameter: /variable\.parameter/,
	function: /entity\.name\.function|support\.function/,
	"string-expression": /string\.interpolated|string\.regexp/,
	punctuation: /^punctuation(?:\.|$)/,
	link: /markup\.underline\.link|markup\.link/,
	type: /entity\.name\.type|support\.type/,
};
const original = {
	id: "original",
	name: "Original",
	type: "dark",
	ui: {
		background: "#222222",
		surface: "#222222",
		foreground: "#c0c0c0",
		muted: "#b0b0a1",
		border: "#606052",
		accent: "#ffa133",
		accentText: "#222222",
		selection: "#ffa133",
	},
	shader: {
		background: "#222222",
		stars: "#e6e8ef",
		jet: "#79d9ff",
		shadow: "#08162d",
		mid: "#35c7ff",
		highlight: "#fffaf2",
	},
	syntax: {
		constant: "#d2a6ff",
		string: "#aad94c",
		comment: "#acb6bf",
		keyword: "#ff8f40",
		parameter: "#bfbdb6",
		function: "#ffb454",
		"string-expression": "#95e6cb",
		punctuation: "#bfbdb6",
		link: "#73d0ff",
		type: "#59c2ff",
	},
};
const result: Array<typeof original> = [original];
const skipped: string[] = [];
for (const id of themeNames) {
	const theme = (await import(`@shikijs/themes/${id}`)).default as Theme;
	const bg = parse(theme.colors["editor.background"]);
	const fg =
		parse(theme.colors["editor.foreground"]) ??
		parse(
			theme.tokenColors.find((token) => !token.scope)?.settings.foreground,
			bg,
		) ??
		parse(theme.colors["input.foreground"], bg) ??
		parse(theme.type === "light" ? "#252525" : "#dedede");
	if (!bg || !fg || !["dark", "light"].includes(theme.type)) {
		skipped.push(`${id}: missing editor colors or type`);
		continue;
	}
	const color = (key: string) => parse(theme.colors[key], bg);
	const surface = color("sideBar.background") ?? blend(bg, fg, 0.06);
	const foreground = readable(fg, surface, 4.5);
	const muted = readable(
		color("descriptionForeground") ?? blend(fg, bg, 0.3),
		surface,
		4.5,
	);
	const rawAccent =
		color("button.background") ??
		color("focusBorder") ??
		scopeColor(theme, /entity\.name\.function/, bg) ??
		fg;
	const accent = readable(rawAccent, surface, 3);
	const accentText =
		contrast([0, 0, 0], accent) >= contrast([255, 255, 255], accent)
			? "#000000"
			: "#ffffff";
	const syntax = Object.fromEntries(
		Object.entries(syntaxScopes).map(([name, pattern]) => [
			name,
			hex(readable(scopeColor(theme, pattern, bg) ?? fg, bg, 3)),
		]),
	);
	const emission = [
		syntax.string,
		syntax.keyword === syntax.string ? syntax.parameter : syntax.keyword,
		syntax.function,
	].map((value) => parse(value) ?? fg);
	result.push({
		id,
		name:
			theme.displayName ??
			id
				.replace(
					/(^|-)(\w)/g,
					(_, separator, letter) =>
						`${separator ? " " : ""}${letter.toUpperCase()}`,
				)
				.trim(),
		type: theme.type,
		ui: {
			background: hex(bg),
			surface: hex(surface),
			foreground: hex(foreground),
			muted: hex(muted),
			border: hex(
				color("panel.border") ??
					color("focusBorder") ??
					blend(surface, foreground, 0.3),
			),
			accent: hex(accent),
			accentText,
			selection: hex(color("editor.selectionBackground") ?? accent),
		},
		shader: {
			background: hex(
				blend(
					blend(bg, rawAccent, 0.4),
					[0, 0, 0],
					theme.type === "light" ? 0.75 : 0.15,
				),
			),
			stars: hex(blend(parse(syntax.constant) ?? fg, fg, 0.28)),
			jet: hex(blend(parse(syntax.type) ?? fg, rawAccent, 0.2)),
			shadow: hex(emission[0]),
			mid: hex(emission[1]),
			highlight: hex(blend(emission[2], [255, 255, 255], 0.24)),
		},
		syntax: syntax as typeof original.syntax,
	});
}
const css = result
	.map((theme) => {
		const declarations = [
			...Object.entries(theme.ui).map(
				([name, value]) => `--theme-${cssName(name)}:${value}`,
			),
			...Object.entries(theme.syntax).map(
				([name, value]) => `--shiki-token-${name}:${value}`,
			),
			`--shiki-foreground:${theme.ui.foreground}`,
			`--shiki-background:${theme.ui.surface}`,
		].join(";");
		return `html[data-theme="${theme.id}"]{${declarations}}`;
	})
	.join("\n");
writeFileSync(
	new URL("themes.json", out),
	`${JSON.stringify(result, null, 2)}\n`,
);
writeFileSync(new URL("themes.css", out), `${css}\n`);
console.log(
	`Generated ${result.length} themes (${result.length - 1} Shiki); skipped ${skipped.length}`,
);
for (const item of skipped) console.log(`  ${item}`);
