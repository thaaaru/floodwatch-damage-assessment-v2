// SPDX-License-Identifier: Apache-2.0

// Shared text and surface styles, taken from the /rivers page.
export const ui = {
  page: 'min-h-screen bg-slate-900 text-white',
  container: 'mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8',
  card: 'bg-slate-800 rounded-2xl shadow-lg border border-slate-700',
  cardPad: 'p-3 sm:p-4',
  // Inner surface on a card (tiles, stat boxes, selected-item panels)
  inset: 'bg-slate-900 rounded-lg border border-slate-700',
  h1: 'text-lg sm:text-xl md:text-2xl font-bold',
  h2: 'text-base sm:text-lg font-semibold text-white',
  intro: 'text-xs sm:text-sm text-slate-300',
  body: 'text-sm text-slate-300',
  meta: 'text-xs text-slate-300',
  muted: 'text-xs text-slate-400',
  link: 'focus-ring rounded text-cyan-300 underline underline-offset-2 hover:text-cyan-200',
  // Secondary button (page-header actions)
  btn: 'focus-ring inline-flex items-center gap-2 min-h-[40px] px-3 rounded-lg border border-slate-600 bg-slate-900 text-sm font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors',
  th: 'bg-slate-900 text-slate-200 border-b border-slate-600 text-xs',
  tr: 'border-b border-slate-700',
} as const;
