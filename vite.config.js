import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    server: {
        host: '0.0.0.0',
        port: 5174,
        // В dev проксируем API на локальный coolay-backend (порт можно переопределить через API_PORT)
        proxy: {
            '/api': {
                target: "http://127.0.0.1:".concat(process.env.API_PORT || 8821),
                changeOrigin: true,
            },
        },
    },
});
