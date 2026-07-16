import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";

const DEFAULT_API_ORIGIN = "http://127.0.0.1:8000";

export default defineConfig(({ mode }) => {
  const apiOrigin = loadEnv(mode, ".", "").PINDOU_API_ORIGIN ?? DEFAULT_API_ORIGIN;
  const apiProxy: Record<string, string | ProxyOptions> = {
    "/api": {
      target: apiOrigin,
      changeOrigin: false,
    },
  };

  return {
    plugins: [react()],
    server: { proxy: apiProxy },
    preview: { proxy: apiProxy },
  };
});
