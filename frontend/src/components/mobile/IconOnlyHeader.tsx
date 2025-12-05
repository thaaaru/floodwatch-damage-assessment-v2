'use client';

import { ReactNode } from 'react';

interface IconOnlyHeaderProps {
  onMenuClick?: () => void;
  onNotificationClick?: () => void;
  onProfileClick?: () => void;
  onInfoClick?: () => void;
  notificationCount?: number;
  actions?: ReactNode;
}

export default function IconOnlyHeader({
  onMenuClick,
  onNotificationClick,
  onProfileClick,
  onInfoClick,
  notificationCount = 0,
  actions,
}: IconOnlyHeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="h-12 px-3 flex items-center justify-between gap-2">
        {/* Left: Menu Icon */}
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
            aria-label="Menu"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        {/* Center: Custom Actions or Empty Space */}
        <div className="flex-1 flex items-center justify-center gap-2">
          {actions}
        </div>

        {/* Right: Icon Actions */}
        <div className="flex items-center gap-1">
          {onInfoClick && (
            <button
              onClick={onInfoClick}
              className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
              aria-label="Information"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}

          {onNotificationClick && (
            <button
              onClick={onNotificationClick}
              className="relative w-10 h-10 flex items-center justify-center rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
              aria-label="Notifications"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {notificationCount > 0 && (
                <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 border-2 border-white">
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              )}
            </button>
          )}

          {onProfileClick && (
            <button
              onClick={onProfileClick}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-brand-100 hover:bg-brand-200 active:bg-brand-300 transition-colors overflow-hidden"
              aria-label="Profile"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <svg className="w-6 h-6 text-brand-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

interface CompactAlertBannerProps {
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success';
  onDismiss?: () => void;
}

export function CompactAlertBanner({
  message,
  type = 'info',
  onDismiss,
}: CompactAlertBannerProps) {
  const typeStyles = {
    info: 'bg-blue-500 text-white',
    warning: 'bg-yellow-500 text-white',
    error: 'bg-red-500 text-white',
    success: 'bg-green-500 text-white',
  };

  const icons = {
    info: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
    ),
    warning: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    ),
    error: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    ),
    success: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ),
  };

  return (
    <div className={`${typeStyles[type]} px-3 py-2 flex items-center gap-2 text-sm font-medium shadow-sm`}>
      <div className="flex-shrink-0">
        {icons[type]}
      </div>
      <p className="flex-1 truncate">{message}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-black/10 active:bg-black/20"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
