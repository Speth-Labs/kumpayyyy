import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Lumin — Ruang Kenangan',
  description: 'Kumpulan foto kenangan yang disusun membentuk huruf Y.',
  openGraph: {
    title: 'Lumin — Ruang Kenangan',
    description: 'Kumpulan foto kenangan yang disusun membentuk huruf Y.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lumin — Ruang Kenangan',
    description: 'Kumpulan foto kenangan yang disusun membentuk huruf Y.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className={geistSans.variable + ' ' + geistMono.variable + ' antialiased'}>{children}</body>
    </html>
  );
}
