// SPDX-License-Identifier: Apache-2.0

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

const navigation = [
  { name: 'Dashboard', href: '/' },
  { name: 'News', href: '/news' },
  { name: 'Early Warning', href: '/early-warning', dynamic: true },
  { name: 'Rivers', href: '/rivers' },
  // 'Flood Hub' (/floods) is hidden per UX request 2026-05-22; the page
  // still exists but is no longer linked from the nav.
  { name: 'Intel', href: '/intel' },
  { name: 'External Links', href: '/external-links' },
  { name: 'Data Sources', href: '/data-sources' },
  { name: 'Contacts', href: '/contacts' },
];

const getRiskColor = (riskLevel: string) => {
  switch (riskLevel) {
    case 'extreme':
      return 'bg-violet-600 text-white hover:bg-violet-700';
    case 'high':
      return 'bg-red-500 text-white hover:bg-red-600';
    case 'medium':
      return 'bg-amber-500 text-white hover:bg-amber-600';
    case 'low':
      return 'bg-emerald-500 text-white hover:bg-emerald-600';
    default:
      return 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/50';
  }
};

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [highestRiskLevel, setHighestRiskLevel] = useState<string | null>(null);
  const pathname = usePathname();

  // Fetch early warning data to determine the highest risk level across all districts
  useEffect(() => {
    const fetchEarlyWarningData = async () => {
      try {
        const data = await api.getEarlyWarning();
        if (data && data.districts && data.districts.length > 0) {
          // Find the highest risk level across all districts
          const riskOrder = { extreme: 0, high: 1, medium: 2, low: 3, unknown: 4 };
          const highestRisk = data.districts.reduce((max, district) => {
            const currentRiskValue = riskOrder[district.risk_level as keyof typeof riskOrder] ?? 4;
            const maxRiskValue = riskOrder[max.risk_level as keyof typeof riskOrder] ?? 4;
            return currentRiskValue < maxRiskValue ? district : max;
          });
          setHighestRiskLevel(highestRisk.risk_level);
        }
      } catch (err) {
        console.error('Failed to fetch early warning data:', err);
      }
    };
    fetchEarlyWarningData();
    // Refresh every 30 minutes
    const interval = setInterval(fetchEarlyWarningData, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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

  // Pages with a dark background need the header to invert its text colours so
  // the nav links stay readable. Today only the /intel "command center" view
  // is dark; this list is intentionally explicit (rather than e.g. inspecting
  // document.body) so the SSR render matches the client one.
  const darkPagePrefixes = ['/intel'];
  const isDarkPage = darkPagePrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Palette tokens used throughout the rest of the header markup. Swapping
  // here keeps every link / button / hover state in lockstep.
  const palette = isDarkPage
    ? {
        headerBg: 'bg-slate-900/80 backdrop-blur-md border-b border-slate-700/60',
        logoText: 'text-white',
        subText: 'text-slate-300',
        linkIdle: 'text-slate-200 hover:text-white hover:bg-white/10',
        hoverPanel: 'hover:bg-white/10',
        mobileBtn: 'text-slate-200 hover:text-white hover:bg-white/10',
        mobileBorder: 'border-slate-700/60',
        partnerChip: 'text-slate-200 hover:text-white',
      }
    : {
        headerBg: 'bg-white/10 backdrop-blur-md border-b border-slate-200/30',
        logoText: 'text-slate-900',
        subText: 'text-blue-600',
        linkIdle: 'text-slate-600 hover:text-slate-900 hover:bg-white/50',
        hoverPanel: 'hover:bg-white/50',
        mobileBtn: 'text-slate-600 hover:text-slate-900 hover:bg-white/50',
        mobileBorder: 'border-slate-200/60',
        partnerChip: 'text-slate-600 hover:text-slate-900',
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
            <a
              href="https://hackandbuild.dev/"
              target="_blank"
              rel="noopener noreferrer"
              className={`hidden sm:flex items-center gap-1 px-2.5 py-1 glass rounded-lg text-xs ${palette.partnerChip} transition-all hover:shadow-sm`}
              title="Built by Hack & Build"
            >
              <span>by</span>
              <span className="font-semibold">Hack & Build</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              const isDynamic = item.dynamic && item.name === 'Early Warning';
              const riskColor = isDynamic && highestRiskLevel ? getRiskColor(highestRiskLevel) : null;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    isActive && isDynamic && highestRiskLevel
                      ? `${riskColor} shadow-md`
                      : isActive
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md'
                      : isDynamic && highestRiskLevel
                      ? `${riskColor}`
                      : palette.linkIdle
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-2">
            <a
              href="https://floodsupport.org"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-gradient btn-sm flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span className="hidden lg:inline">Report Emergency</span>
            </a>
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
                const isDynamic = item.dynamic && item.name === 'Early Warning';
                const riskColor = isDynamic && highestRiskLevel ? getRiskColor(highestRiskLevel) : null;

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      isActive && isDynamic && highestRiskLevel
                        ? `${riskColor} shadow-md`
                        : isActive
                        ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md'
                        : isDynamic && highestRiskLevel
                        ? `${riskColor}`
                        : palette.linkIdle
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
              <div className={`pt-3 mt-2 border-t ${palette.mobileBorder}`}>
                <a
                  href="https://floodsupport.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-gradient btn-md w-full justify-center flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  Report Emergency
                </a>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
