// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';

export type SheetState = 'collapsed' | 'half' | 'full';

interface BottomSheetProps {
  children: ReactNode;
  state: SheetState;
  onStateChange: (state: SheetState) => void;
  collapsedHeight?: number;
  halfHeight?: string;
  fullHeight?: string;
  handleContent?: ReactNode;
  snapPoints?: { collapsed: number; half: number; full: number };
}

export default function BottomSheet({
  children,
  state,
  onStateChange,
  collapsedHeight = 80,
  halfHeight = '50vh',
  fullHeight = '90vh',
  handleContent,
  snapPoints = { collapsed: 80, half: 50, full: 90 },
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);

  // Get transform value based on state
  const getTransform = (): string => {
    if (isDragging) {
      const deltaY = currentY - startY;
      const baseTransform = state === 'collapsed' ? `calc(100% - ${collapsedHeight}px)` :
                           state === 'half' ? `calc(100% - ${halfHeight})` :
                           `calc(100% - ${fullHeight})`;
      return `calc(${baseTransform} + ${deltaY}px)`;
    }

    return state === 'collapsed' ? `calc(100% - ${collapsedHeight}px)` :
           state === 'half' ? `calc(100% - ${halfHeight})` :
           `calc(100% - ${fullHeight})`;
  };

  // Handle touch start
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setStartY(touch.clientY);
    setCurrentY(touch.clientY);
    setIsDragging(true);
  };

  // Handle touch move
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    const touch = e.touches[0];
    setCurrentY(touch.clientY);

    // Prevent scroll when dragging
    if (sheetRef.current) {
      const scrollTop = sheetRef.current.querySelector('.sheet-content')?.scrollTop || 0;
      if (scrollTop === 0 || touch.clientY > startY) {
        e.preventDefault();
      }
    }
  };

  // Handle touch end
  const handleTouchEnd = () => {
    if (!isDragging) return;

    const deltaY = currentY - startY;
    const threshold = 50; // Minimum swipe distance to trigger state change

    if (deltaY > threshold) {
      // Swiping down
      if (state === 'full') {
        onStateChange('half');
      } else if (state === 'half') {
        onStateChange('collapsed');
      }
    } else if (deltaY < -threshold) {
      // Swiping up
      if (state === 'collapsed') {
        onStateChange('half');
      } else if (state === 'half') {
        onStateChange('full');
      }
    }

    setIsDragging(false);
    setStartY(0);
    setCurrentY(0);
  };

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (state === 'half' || state === 'full') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [state]);

  return (
    <>
      {/* Backdrop */}
      {(state === 'half' || state === 'full') && (
        <div
          className="fixed inset-0 bg-black/40 z-40 animate-in fade-in duration-200"
          onClick={() => onStateChange('collapsed')}
          style={{ touchAction: 'auto' }}
        />
      )}

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className="fixed left-0 right-0 bg-white z-50 shadow-2xl"
        style={{
          bottom: 0,
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
          transform: `translateY(${getTransform()})`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform',
          maxHeight: '100vh',
          touchAction: 'none',
        }}
      >
        {/* Drag Handle */}
        <div
          className="relative h-12 flex items-center justify-center cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ touchAction: 'none' }}
        >
          {/* Visual handle bar */}
          <div className="absolute top-2 w-12 h-1.5 bg-slate-300 rounded-full" />

          {/* Handle content (summary, etc) */}
          {handleContent && state === 'collapsed' && (
            <div className="mt-6 px-4 w-full">
              {handleContent}
            </div>
          )}
        </div>

        {/* Sheet Content */}
        <div
          className="sheet-content overflow-y-auto"
          style={{
            maxHeight: state === 'collapsed' ? `${collapsedHeight - 48}px` :
                      state === 'half' ? 'calc(50vh - 48px)' :
                      'calc(90vh - 48px)',
            overflowY: state === 'collapsed' ? 'hidden' : 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
