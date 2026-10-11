// SPDX-License-Identifier: Apache-2.0

import { ui } from '@/lib/ui';

export default function PageHeader({
  title,
  subtitle,
  width = 'max-w-7xl',
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  width?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800 border-b border-slate-700">
      <div className={`${width} mx-auto px-3 sm:px-4 lg:px-8 py-3 sm:py-4`}>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <a href="/" className="focus-ring rounded text-slate-300 hover:text-white transition-colors flex-shrink-0" aria-label="Back to dashboard">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </a>
          <div className="min-w-0 flex-1">
            <h1 className={ui.h1}>{title}</h1>
            {subtitle && <p className={`${ui.intro} mt-0.5`}>{subtitle}</p>}
          </div>
          {/* Actions wrap under the title on phones so the title is not truncated. */}
          {actions && (
            <div className="basis-full sm:basis-auto flex flex-wrap items-center gap-2 pl-6 sm:pl-0">{actions}</div>
          )}
        </div>
      </div>
    </div>
  );
}
