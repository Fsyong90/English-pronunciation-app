import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 监听 0.0.0.0 方便用手机在同一局域网内访问开发服务器
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
});
