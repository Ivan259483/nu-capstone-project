import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:3001';

    console.log(`🚀 Proxying /api to: ${backendUrl}`);

    return {
        plugins: [react()],
        server: {
            watch: { usePolling: true, interval: 800 },
            proxy: {
                '/api': {
                    target: backendUrl,
                    changeOrigin: true,
                    secure: false,
                },
                '/socket.io': {
                    target: backendUrl,
                    ws: true,
                    changeOrigin: true,
                }
            }
        },
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "./src"),
            },
            // Force a single Three.js instance across all packages (model-viewer, r3f, drei)
            dedupe: ['three'],
        },
    };
});
