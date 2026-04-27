import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Library mode for production build
  if (mode === 'production') {
    return {
      plugins: [react()],
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
      },
      build: {
        lib: {
          entry: path.resolve(__dirname, 'embed.tsx'),
          name: 'VarienChatWidget',
          fileName: () => 'varien-chat-widget.js',
          formats: ['iife'],
        },
        rollupOptions: {
          // Bundle everything - no external dependencies
          external: [],
          output: {
            // Ensure everything is in one file
            inlineDynamicImports: true,
            // Global variable name
            name: 'VarienChatWidget',
          },
        },
        // Minify for production
        minify: 'terser',
        // Output to dist folder
        outDir: 'dist',
        // Single file output
        cssCodeSplit: false,
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
      },
    };
  }

  // Development mode
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
