import { bindings, defineConfig, triggers } from "cf/config";

export default defineConfig({
	worker: {
		name: "og-screenshot",
		compatibilityDate: "2026-03-24",
		compatibilityFlags: [
			"nodejs_compat",
		],
		entrypoint: "src/index.ts",
		triggers: [
			triggers.fetch({
				pattern: "og.soderlind.no/*",
				zone: "soderlind.no",
			}),
			triggers.scheduled({ schedule: "0 6 * * SUN" }),
		],
		env: {
			SITE_ORIGIN: bindings.text("https://soderlind.no"),
			PAGE_PATH: bindings.text("/{slug}/"),
			FALLBACK_PATH: bindings.text("/og/{slug}.png"),
			CACHE: bindings.kv({
				id: "e0845a6454934d0b83074b84db39f196",
			}),
			BROWSER: bindings.browser({}),
		},
	},
});
