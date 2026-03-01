import '../styles/globals.css';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: {
    default: 'DVAI Connect | Conference app with built-in Agentic AI',
    template: '%s',
  },
  description:
    'DVAI Connect is an WebRTC project that gives you everything needed to connect with peers for audio and/or video calls with an additional layer of AI agents.',
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

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable}`}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap"
          rel="stylesheet"
        />
      </head>
      <body data-lk-theme="default">
        <Toaster />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
