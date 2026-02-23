import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        viteStaticCopy({
            targets: [
                // Copy md-spreadsheet-parser WASM files for dev server
                {
                    src: 'node_modules/md-spreadsheet-parser/dist/*.wasm',
                    dest: '.'
                }
            ]
        })
    ],
    // Use relative paths for assets - crucial for VS Code Webview
    // Without this, import.meta.url resolves to the webview's base URL
    // and WASM files can't be found
    base: './',
    build: {
        outDir: 'out/webview',
        rollupOptions: {
            input: {
                main: './webview-ui/index.html'
            },
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: '[name].js',
                assetFileNames: '[name].[ext]'
            }
        }
    },
    publicDir: 'resources',
    server: {
        port: 5173,
        strictPort: true,
        cors: true,
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp'
        }
    },
    optimizeDeps: {
        // Exclude md-spreadsheet-parser from optimization to preserve WASM imports
        exclude: ['md-spreadsheet-parser']
    }
});
