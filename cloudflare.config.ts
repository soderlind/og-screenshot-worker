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
		],
		env: {
			CACHE: bindings.kv({
				id: "your-kv-namespace-id",
			}),
			BROWSER: bindings.browser({}),
		},
	},
});
