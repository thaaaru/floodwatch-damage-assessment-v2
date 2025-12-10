// SPDX-License-Identifier: Apache-2.0

'use client';

import { ReactNode } from 'react';

interface FloatingButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  badge?: number | string;
}

export function FloatingButton({
  icon,
  label,
  onClick,
  variant = 'secondary',
  size = 'md',
  badge,
}: FloatingButtonProps) {
  const sizeClasses = {
    sm: 'w-12 h-12 text-sm',
    md: 'w-14 h-14 text-base',
    lg: 'w-16 h-16 text-lg',
  };

  const variantClasses = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-lg',
    secondary: 'bg-white text-slate-700 hover:bg-slate-50 shadow-md border border-slate-200',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-lg',
  };

  return (
    <button
      onClick={onClick}
      className={`
        relative rounded-full flex items-center justify-center
        transition-all active:scale-95 font-medium
        ${sizeClasses[size]}
        ${variantClasses[variant]}
      `}
      aria-label={label}
      style={{
        minWidth: '44px',
        minHeight: '44px',
      }}
    >
      {icon}

      {badge !== undefined && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 border-2 border-white">
          {badge}
        </span>
      )}

      <span className="sr-only">{label}</span>
    </button>
  );
}

interface FloatingControlsProps {
  onLocate?: () => void;
  onFilter?: () => void;
  onLayers?: () => void;
  position?: 'bottom-right' | 'bottom-left' | 'top-right';
  showLocate?: boolean;
  showFilter?: boolean;
  showLayers?: boolean;
  filterCount?: number;
}

export default function FloatingControls({
  onLocate,
  onFilter,
  onLayers,
  position = 'bottom-right',
  showLocate = true,
  showFilter = false,
  showLayers = true,
  filterCount = 0,
}: FloatingControlsProps) {
  const positionClasses = {
    'bottom-right': 'bottom-24 right-4',
    'bottom-left': 'bottom-24 left-4',
    'top-right': 'top-20 right-4',
  };

  return (
    <div
      className={`fixed z-30 flex flex-col gap-3 ${positionClasses[position]}`}
      style={{ touchAction: 'auto' }}
    >
      {showFilter && onFilter && (
        <FloatingButton
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          }
          label="Filters"
          onClick={onFilter}
          badge={filterCount > 0 ? filterCount : undefined}
        />
      )}

      {showLayers && onLayers && (
        <FloatingButton
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zm10 0a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
            </svg>
          }
          label="Layers"
          onClick={onLayers}
        />
      )}

      {showLocate && onLocate && (
        <FloatingButton
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
          label="My Location"
          onClick={onLocate}
          variant="primary"
        />
      )}
    </div>
  );
}

interface PrimaryCTAProps {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: 'primary' | 'danger';
  disabled?: boolean;
}

export function PrimaryCTA({
  label,
  onClick,
  icon,
  variant = 'primary',
  disabled = false,
}: PrimaryCTAProps) {
  const variantClasses = {
    primary: 'bg-brand-600 hover:bg-brand-700',
    danger: 'bg-red-600 hover:bg-red-700',
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-30" style={{ touchAction: 'auto' }}>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`
          w-full h-14 rounded-full text-white font-bold text-lg
          flex items-center justify-center gap-3
          shadow-2xl transition-all active:scale-98
          ${variantClasses[variant]}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        style={{
          minHeight: '56px', // 44px + padding for comfort
        }}
      >
        {icon}
        {label}
      </button>
    </div>
  );
}
