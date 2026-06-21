import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { seoMetadataPlugin } from './utils/seo/metadata.mjs';

export default defineConfig({
  base: '/parkdale-breakfast-bar/',
  plugins: [react(), seoMetadataPlugin()],
});
