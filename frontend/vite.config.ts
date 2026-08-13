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
            // Target modern browsers — avoids unnecessary legacy syntax transforms (smaller output)
            target: ['es2020', 'chrome80', 'firefox78', 'safari14'],
            // Generate deploy-safe maps for private error-reporting uploads without
            // embedding source content or advertising their URL in production JS.
            sourcemap: 'hidden',
            // Raise the warning limit slightly since we have legitimate large dashboard chunks
            chunkSizeWarningLimit: 600,
            rollupOptions: {
                output: {
                    sourcemapExcludeSources: true,
                    manualChunks(id) {
                        if (!id.includes('node_modules')) return;

                        // ── React core (always needed, kept lean) ──
                        if (
                            id.includes('node_modules/react-dom') ||
                            id.includes('node_modules/react/') ||
                            id.includes('node_modules\\react\\') ||
                            id.includes('node_modules\\react-dom')
                        ) {
                            return 'vendor-react';
                        }

                        // ── Animation (needed on login + public pages) ──
                        if (id.includes('framer-motion') || id.includes('/motion/')) {
                            return 'vendor-framer-motion';
                        }

                        // ── Charts (dashboards only — never on /login) ──
                        if (id.includes('recharts') || id.includes('d3-')) {
                            return 'vendor-recharts';
                        }

                        // ── 3D / AR (feature-specific pages only) ──
                        if (id.includes('three') || id.includes('@react-three')) {
                            return 'vendor-three';
                        }

                        // ── PDF / image export (report pages only — NOT on /login) ──
                        if (id.includes('jspdf') || id.includes('html2canvas')) {
                            return 'vendor-pdf';
                        }

                        // ── Firebase (auth needed early, analytics is deferred) ──
                        if (id.includes('firebase')) {
                            return 'vendor-firebase';
                        }

                        // ── Socket.IO (connected post-auth only) ──
                        if (id.includes('socket.io')) {
                            return 'vendor-socket';
                        }

                        // ── Router ──
                        if (id.includes('react-router')) {
                            return 'vendor-router';
                        }

                        // ── Radix UI components (shared across app) ──
                        if (id.includes('@radix-ui')) {
                            return 'vendor-radix';
                        }

                        // ── Date utils ──
                        if (id.includes('date-fns')) {
                            return 'vendor-date';
                        }

                        // ── Tanstack query ──
                        if (id.includes('@tanstack')) {
                            return 'vendor-query';
                        }
                    },
                },
            },
        },
    };
});
