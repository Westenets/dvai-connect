import 'newrelic';
import '../styles/globals.css';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: {
        default: 'DVAI Connect | Conference app with built-in Agentic AI',
        template: '%s',
    },
    description:
        'DVAI Connect is an Video conferencing app that gives you everything needed to connect with peers for audio and/or video calls with an additional layer of AI agents and End-to-end encryptions and a build in meeting record feature.',
    twitter: {
        creator: '@livekitted',
        site: '@livekitted',
        card: 'summary_large_image',
    },
    openGraph: {
        url: 'https://connect.deepvoiceai.co',
        images: [
            {
                url: 'https://connect.deepvoiceai.co/images/livekit-meet-open-graph.png',
                width: 2000,
                height: 1000,
                type: 'image/png',
            },
        ],
        siteName: 'DVAI Connect',
    },
    icons: {
        icon: {
            rel: 'icon',
            url: '/favicon.ico',
        },
        apple: [
            {
                rel: 'apple-touch-icon',
                url: '/images/livekit-apple-touch.png',
                sizes: '180x180',
            },
            { rel: 'mask-icon', url: '/images/livekit-safari-pinned-tab.svg', color: '#070707' },
        ],
    },
};

export const viewport: Viewport = {
    themeColor: '#070707',
};

import { Inter } from 'next/font/google';
import { AuthProvider } from '@/components/AuthProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { PageTransition } from '@/components/PageTransition';
import { ClarityInit } from '@/components/ClarityInit';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`${inter.variable}`}>
            <head></head>
            <body>
                <ClarityInit />
                <Toaster />
                <AuthProvider>
                    <ThemeProvider>
                        <PageTransition>{children}</PageTransition>
                    </ThemeProvider>
                </AuthProvider>
            </body>
        </html>
    );
}
