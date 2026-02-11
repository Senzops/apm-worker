import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  minify: true,
  sourcemap: true,
  splitting: false,
  // Ensure node built-ins are not polyfilled by tsup, letting the runtime provide them
  external: ['node:async_hooks', 'node:crypto', 'cloudflare:sockets'],
});