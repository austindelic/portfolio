import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { compactShaders } from "./tooling/compact-shaders.mjs";

// https://astro.build/config
export default defineConfig({
	integrations: [sitemap(), react()],
	site: "https://austindelic.com",
	compressHTML: true,
	markdown: {
		shikiConfig: {
			theme: {
				name: "departure-dark",
				type: "dark",
				colors: {
					"editor.background": "#222222",
					"editor.foreground": "#C0C0C0",
				},
				tokenColors: [
					{
						scope: ["comment", "punctuation.definition.comment"],
						settings: { foreground: "#A0A08B" },
					},
					{
						scope: ["keyword", "storage", "entity.name.function"],
						settings: { foreground: "#FFA133" },
					},
					{
						scope: ["string", "constant", "entity.name.type"],
						settings: { foreground: "#D6C79F" },
					},
					{
						scope: ["punctuation", "variable"],
						settings: { foreground: "#C0C0C0" },
					},
				],
			},
		},
	},
	vite: {
		plugins: [compactShaders(), tailwindcss()],
	},
});
