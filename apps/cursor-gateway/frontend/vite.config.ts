import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://sub2apiextra-cursorgateway:3000",
      "/v1": "http://sub2apiextra-cursorgateway:3000",
      "/models": "http://sub2apiextra-cursorgateway:3000",
      "/chat/completions": "http://sub2apiextra-cursorgateway:3000",
      "/health": "http://sub2apiextra-cursorgateway:3000",
    },
  },
});
