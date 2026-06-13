const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: false,
    devIndicators: false,
    productionBrowserSourceMaps: true,
    images: {
        formats: ['image/webp'],
    },

    // @dvai-bridge/core's bundled dist contains static-resolvable imports of
    // two optional peers we don't use in the meet web app:
    //   - @dvai-bridge/capacitor (native-mobile transport)
    //   - @mlc-ai/web-llm (WebLLM backend; we use transformers backend)
    // v4.0.2 correctly declares these as optional peers via
    // peerDependenciesMeta, but they remain STATIC imports in the compiled
    // dist — Turbopack/webpack still try to resolve them at build time even
    // though the runtime paths are dead. Aliasing to local stubs satisfies
    // the bundler without pulling in the multi-MB unused packages.
    //
    // Both Turbopack (Next.js 16 default) and webpack (legacy) configs are
    // provided so `next build`, `next build --webpack`, and dev server all
    // resolve the stubs correctly.
    turbopack: {
        resolveAlias: {
            '@dvai-bridge/capacitor': './lib/stubs/dvai-bridge-capacitor.ts',
            '@mlc-ai/web-llm': './lib/stubs/mlc-web-llm.ts',
            // @dvai-bridge/core@4.0.2 imports `fs/promises` for license file
            // loading on Node hosts. Browser bundle never reaches it; stub
            // it so the bundler is satisfied.
            'fs/promises': './lib/stubs/node-fs-promises.ts',
        },
    },
    webpack: (config) => {
        config.resolve = config.resolve || {};
        config.resolve.alias = {
            ...(config.resolve.alias || {}),
            '@dvai-bridge/capacitor': path.resolve(
                __dirname,
                'lib/stubs/dvai-bridge-capacitor.ts',
            ),
            '@mlc-ai/web-llm': path.resolve(
                __dirname,
                'lib/stubs/mlc-web-llm.ts',
            ),
            'fs/promises': path.resolve(
                __dirname,
                'lib/stubs/node-fs-promises.ts',
            ),
        };
        return config;
    },

    headers: async () => {
        return [
            // The pricing page embeds Stripe Checkout iframe from js.stripe.com.
            // Stripe's iframe is blocked by the global COOP `same-origin` +
            // COEP `credentialless` headers we set everywhere else for
            // SharedArrayBuffer / WebGPU support. Relax both on /pricing so
            // the embedded checkout loads correctly. The rest of the app
            // keeps the stricter headers required by Whisper/Gemma WebGPU
            // workloads.
            {
                source: '/pricing/:path*',
                headers: [
                    { key: 'Cross-Origin-Opener-Policy', value: 'unsafe-none' },
                    { key: 'Cross-Origin-Embedder-Policy', value: 'unsafe-none' },
                ],
            },
            {
                source: '/(.*)',
                headers: [
                    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
                    { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
                ],
            },
        ];
    },
};

module.exports = nextConfig;
