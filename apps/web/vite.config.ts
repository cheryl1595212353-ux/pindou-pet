import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";

const DEFAULT_API_ORIGIN = "http://127.0.0.1:8000";
const DEEPSEEK_API_ORIGIN = "https://api.deepseek.com";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const apiOrigin = env.PINDOU_API_ORIGIN ?? DEFAULT_API_ORIGIN;
  const apiProxy: Record<string, string | ProxyOptions> = {
    "/api": {
      target: apiOrigin,
      changeOrigin: false,
    },
  };

  // The browser calls the key-less "/deepseek-api/*" path; the dev/preview
  // server injects DEEPSEEK_API_KEY (from apps/web/.env.local) so the secret
  // never ships in the client bundle. Without a key, omit the proxy entirely
  // so chat content is not sent to an unauthenticated external endpoint.
  const deepseekKey = env.DEEPSEEK_API_KEY;
  if (deepseekKey) {
    apiProxy["/deepseek-api"] = {
      target: DEEPSEEK_API_ORIGIN,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/deepseek-api/, ""),
      headers: { Authorization: `Bearer ${deepseekKey}` },
    };
  }

  return {
    plugins: [react()],
    server: { proxy: apiProxy },
    preview: { proxy: apiProxy },
  };
});
