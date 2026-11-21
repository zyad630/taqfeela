import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Plugin: strip `crossorigin` attributes from the built HTML.
// Electron loads via file:// protocol which blocks crossorigin CORS checks
// and causes blank/blue screen in the packaged EXE.
const removeCrossorigin = {
  name: 'remove-crossorigin',
  transformIndexHtml(html) {
    return html.replace(/ crossorigin(="[^"]*")?/g, '');
  },
};

export default defineConfig({
  plugins: [react(), removeCrossorigin],
  base: './',
  build: {
    sourcemap: false,
  },
});
