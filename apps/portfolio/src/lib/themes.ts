import catalog from "../generated/themes.json";

export type PortfolioTheme = (typeof catalog)[number];
export const themes: PortfolioTheme[] = catalog;
export const THEME_STORAGE_KEY = "portfolio-theme";
const byId = new Map(themes.map((theme) => [theme.id, theme]));

export function getTheme(id: string | null | undefined): PortfolioTheme {
	return byId.get(id ?? "") ?? themes[0];
}

export function activeTheme(): PortfolioTheme {
	return getTheme(document.documentElement.dataset.theme);
}

export function applyTheme(id: string, save = true): PortfolioTheme {
	const theme = getTheme(id);
	document.documentElement.dataset.theme = theme.id;
	document.documentElement.classList.toggle("dark", theme.type === "dark");
	document
		.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
		?.setAttribute("content", theme.ui.background);
	if (save) {
		try {
			localStorage.setItem(THEME_STORAGE_KEY, theme.id);
		} catch {
			/* Storage can be disabled. */
		}
	}
	document.dispatchEvent(
		new CustomEvent("portfolio-theme-change", { detail: theme }),
	);
	return theme;
}

export function themeShaderControls(theme: PortfolioTheme) {
	return theme.id === "original"
		? { paletteMode: "source" as const }
		: {
				paletteMode: "theme" as const,
				shadowColor: theme.shader.shadow,
				midColor: theme.shader.mid,
				highlightColor: theme.shader.highlight,
			};
}
