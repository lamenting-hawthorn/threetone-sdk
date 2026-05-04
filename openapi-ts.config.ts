import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: process.env.THREETONE_OPENAPI_URL ?? 'https://api.threetone.in/openapi.json',
  output: {
    path: 'src/generated',
    format: 'biome',
    lint: 'biome',
  },
  plugins: ['@hey-api/client-fetch', '@hey-api/sdk', '@hey-api/typescript', '@hey-api/schemas'],
});
