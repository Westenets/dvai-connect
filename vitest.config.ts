import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        environment: 'happy-dom',
        globals: false,
        // Restrict to lib/ — app/ has Next.js-specific code that
        // unit tests don't need to touch.
        include: ['lib/**/*.{test,spec}.{ts,tsx}'],
        // We use vi.useFakeTimers() in some tests; isolate test files.
        isolate: true,
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, '.'),
        },
    },
});
