/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: false,
    devIndicators: false,
    productionBrowserSourceMaps: true,
    images: {
        formats: ['image/webp'],
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
