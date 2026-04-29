const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: false,
    devIndicators: false,
    productionBrowserSourceMaps: true,
    images: {
        formats: ['image/webp'],
    },

    // @westenets/dvai-bridge-core's bundled dist contains static-resolvable
    // imports of two optional peers we don't use in the meet web app:
    //   - @westenets/dvai-bridge-capacitor (native-mobile transport)
    //   - @mlc-ai/web-llm (WebLLM backend; we use transformers backend)
    // Both code paths are dead at runtime here, but Turbopack/webpack still
    // try to resolve them at build time. Aliasing to local stubs satisfies
    // the bundler without pulling in the multi-MB unused packages.
    //
    // Both Turbopack (Next.js 16 default) and webpack (legacy) configs are
    // provided so `next build`, `next build --webpack`, and dev server all
    // resolve the stubs correctly.
    turbopack: {
        resolveAlias: {
            '@westenets/dvai-bridge-capacitor': './lib/stubs/dvai-bridge-capacitor.ts',
            '@mlc-ai/web-llm': './lib/stubs/mlc-web-llm.ts',
        },
    },
    webpack: (config) => {
        config.resolve = config.resolve || {};
        config.resolve.alias = {
            ...(config.resolve.alias || {}),
            '@westenets/dvai-bridge-capacitor': path.resolve(
                __dirname,
                'lib/stubs/dvai-bridge-capacitor.ts',
            ),
            '@mlc-ai/web-llm': path.resolve(
                __dirname,
                'lib/stubs/mlc-web-llm.ts',
            ),
        };
        return config;
    },

    headers: async () => {
        return [
            {
                source: '/(.*)',
                headers: [
                    {
                        key: 'Cross-Origin-Opener-Policy',
                        value: 'same-origin',
                    },
                    {
                        key: 'Cross-Origin-Embedder-Policy',
                        value: 'credentialless',
                    },
                ],
            },
        ];
    },
};

module.exports = nextConfig;
