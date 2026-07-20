import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsConfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    css: false,
    env: {
      // push-notifications.ts reads this once at module load to decide if
      // push is "supported" at all — without it every test in that file
      // would hit the unsupported-browser branch instead of the one it's
      // actually testing.
      VITE_VAPID_PUBLIC_KEY: "test-vapid-key",
    },
  },
});
