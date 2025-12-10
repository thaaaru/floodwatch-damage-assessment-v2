// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import Header from '@/components/Header';
import LastUpdated from '@/components/LastUpdated';
import '@/styles/globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'FloodWatch LK - Sri Lanka Flood Monitoring System',
  description: 'Real-time flood monitoring and early warning system for Sri Lanka. Get SMS alerts for flood warnings in your district.',
  keywords: 'flood, sri lanka, monitoring, alerts, weather, rainfall, disaster',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!mapsApiKey) {
    console.warn('Google Maps API key not configured. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY environment variable.');
  }

  return (
    <html lang="en" className={inter.variable}>
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-X70YJR4WSV"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-X70YJR4WSV');
          `}
        </Script>
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places&loading=async`}
          strategy="afterInteractive"
        />
      </head>
      <body className={`${inter.className} antialiased`}>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-grow">{children}</main>
          <LastUpdated />
          <footer className="bg-slate-900 text-white py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                    </svg>
                  </div>
                  <div>
                    <span className="font-semibold text-sm">FloodWatch LK</span>
                    <p className="text-xs text-slate-400">Flood Monitoring System for Sri Lanka</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm text-slate-400">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    All systems operational
                  </span>
                  <span>Data: Open-Meteo, GDACS</span>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
