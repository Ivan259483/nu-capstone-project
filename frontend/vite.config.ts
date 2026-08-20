import { defineConfig, loadEnv, type PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:3000';

    console.log(`🚀 Proxying /api to: ${backendUrl}`);

    const plugins: PluginOption[] = [react()];
    if (process.env.ANALYZE === '1') {
        plugins.push(
            visualizer({
                filename: 'dist/stats.html',
                open: false,
                gzipSize: true,
                brotliSize: true,
            })
        );
    }

    return {
        /** Also expose NEXT_PUBLIC_* so WebAR / scan flows can share one env name with Next.js. */
        envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
        plugins,
        server: {
            host: 'localhost',
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
            // Force a single React instance (fixes @dnd-kit/core useReducer crash with Vite)
            dedupe: ['react', 'react-dom', 'three'],
        },
        build: {
            // Use Vite's safe default target (esnext) — avoids esbuild destructuring
            // transpilation failures that occur with explicit legacy browser target lists.
            // Modern evergreen browsers support all ES2020+ features natively; no polyfills needed.
            // Generate deploy-safe maps for private error-reporting uploads without
            // embedding source content or advertising their URL in production JS.
            sourcemap: 'hidden',
            // Raise the warning limit slightly since we have legitimate large dashboard chunks
            chunkSizeWarningLimit: 600,
            rollupOptions: {
                output: {
                    sourcemapExcludeSources: true,
                },
            },
        },
    };
});
