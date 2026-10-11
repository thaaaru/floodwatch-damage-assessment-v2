// SPDX-License-Identifier: Apache-2.0

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const navigation = [
  { name: 'Dashboard', href: '/' },
  { name: 'News', href: '/news' },
  // 'Flood Hub' (/floods) is hidden per UX request 2026-05-22; the page
  // still exists but is no longer linked from the nav.
  { name: 'External Links', href: '/external-links' },
  { name: 'Data Sources', href: '/data-sources' },
  { name: 'Contacts', href: '/contacts' },
];


export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // The entire site uses a dark theme (slate-900 base) modelled after the
  // /data-sources page; the Header therefore renders in dark mode everywhere.
  // The `palette` block is kept (rather than inlined) so a light page can be
  // re-introduced later just by extending `lightPagePrefixes`.
  const lightPagePrefixes: string[] = [];
  const isLightPage = lightPagePrefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // Palette tokens used throughout the rest of the header markup. Swapping
  // here keeps every link / button / hover state in lockstep.
  const palette = isLightPage
    ? {
        headerBg: 'bg-white/10 backdrop-blur-md border-b border-slate-200/30',
        logoText: 'text-slate-900',
        subText: 'text-blue-600',
        linkIdle: 'text-slate-600 hover:text-slate-900 hover:bg-white/50',
        hoverPanel: 'hover:bg-white/50',
        mobileBtn: 'text-slate-600 hover:text-slate-900 hover:bg-white/50',
        mobileBorder: 'border-slate-200/60',
      }
    : {
        headerBg: 'bg-slate-800/50 backdrop-blur-md border-b border-slate-700/50',
        logoText: 'text-white',
        subText: 'text-slate-300',
        linkIdle: 'text-slate-300 hover:text-white hover:bg-white/10',
        hoverPanel: 'hover:bg-white/10',
        mobileBtn: 'text-slate-300 hover:text-white hover:bg-white/10',
        mobileBorder: 'border-slate-700/50',
      };

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled ? `${palette.headerBg} shadow-sm` : palette.headerBg
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg group-hover:shadow-cyan-500/50 transition-all">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                </div>
              </div>
              <div className="flex flex-col">
                <span className={`font-bold text-base leading-tight ${palette.logoText}`}>FloodWatch</span>
                <span className={`text-xs font-semibold ${palette.subText}`}>Sri Lanka</span>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md'
                      : palette.linkIdle
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`p-1.5 rounded-lg transition-colors ${palette.mobileBtn}`}
              aria-label="Toggle menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className={`md:hidden py-4 border-t ${palette.mobileBorder} animate-fade-in`}>
            <div className="flex flex-col gap-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md'
                        : palette.linkIdle
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
