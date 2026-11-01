import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const browserBuild = mode === 'browser';
  return {
    plugins: [react()],
    // The static build uses relative paths so it works both on a user page
    // (user.github.io) and on a project page (user.github.io/repo).
    base: browserBuild ? './' : '/',
    build: {
      outDir: browserBuild ? 'dist-browser' : 'dist'
    },
    server: {
      port: 5174,
      watch: {
        ignored: ['**/data/**']
      },
      proxy: {
        '/api': `http://127.0.0.1:${process.env.PORT || 8890}`
      }
    }
  };
});
