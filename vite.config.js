import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = process.env.PORT || env.PORT || '3001';
  return {
    server: {
      port: 5173,
      proxy: { '/api': { target: `http://127.0.0.1:${port}` } },
    },
    build: { target: 'es2022' },
  };
});
