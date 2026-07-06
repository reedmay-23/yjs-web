import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import Icons from "unplugin-icons/vite";
import {fileURLToPath} from "node:url";
// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3892';

    return {
    plugins: [
        vue(),
        tailwindcss(),
        Icons({
            compiler: 'vue3'
        })
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    },
    server: {
        port: 8170,
        host: '0.0.0.0',
        proxy: {
            '/api': {
                target: apiProxyTarget,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ''),
            }
        }
    },

    }
})
