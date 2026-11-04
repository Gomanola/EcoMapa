import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Proxy API requests to avoid CORS during local development.
    // Set VITE_API_URL in .env to your deployed API Gateway URL, e.g.:
    //   VITE_API_URL=https://abc123.execute-api.us-east-1.amazonaws.com/prod/
    // When not set, the app tries /config.json (deployed by CDK) then falls back.
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
