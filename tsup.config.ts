import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/webhooks.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  splitting: false,
});
