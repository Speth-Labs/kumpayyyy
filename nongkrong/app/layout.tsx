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
  title: 'N — Ruang Kenangan',
  description: 'Kumpulan foto kenangan yang disusun membentuk huruf N.',
  openGraph: {
    title: 'N — Ruang Kenangan',
    description: 'Kumpulan foto kenangan yang disusun membentuk huruf N.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'N — Ruang Kenangan',
    description: 'Kumpulan foto kenangan yang disusun membentuk huruf N.',
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
