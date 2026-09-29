import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { createCssVariablesTheme } from "shiki/core";

// https://astro.build/config
export default defineConfig({
	integrations: [sitemap(), react()],
	site: "https://austindelic.com",
	compressHTML: true,
	markdown: {
		shikiConfig: {
			theme: createCssVariablesTheme({
				name: "portfolio-code",
				variablePrefix: "--shiki-",
			}),
		},
	},
	vite: {
		plugins: [tailwindcss()],
	},
});
