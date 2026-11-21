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
			triggers.scheduled({ schedule: "0 6 * * 0" }),
		],
		env: {
			SITE_ORIGIN: bindings.text("https://soderlind.no"),
			PAGE_PATH: bindings.text("/{slug}/"),
			FALLBACK_PATH: bindings.text("/og/{slug}.png"),
			CACHE: bindings.kv({
				id: "your-kv-namespace-id",
			}),
			BROWSER: bindings.browser({}),
		},
	},
});
