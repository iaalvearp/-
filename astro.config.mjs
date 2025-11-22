// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  // Importante: 'server' habilita el backend (SSR)
  output: 'server',
  integrations: [react()],

  vite: {
    plugins: [tailwindcss()]
  },

  adapter: cloudflare({
    // Configuración para acceder a la base de datos D1 localmente
    platformProxy: {
      enabled: true,
    },
  }),
});