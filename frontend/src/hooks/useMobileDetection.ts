import { useState, useEffect } from 'react';

/**
 * Detect if device is mobile based on screen size
 * Uses 768px breakpoint (typical tablet/mobile boundary)
 */
export function useIsMobile(breakpoint: number = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check initial size
    const checkSize = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    // Set initial value
    checkSize();

    // Listen for resize
    window.addEventListener('resize', checkSize);

    return () => window.removeEventListener('resize', checkSize);
  }, [breakpoint]);

  return isMobile;
}

/**
 * Detect if device is touch-capable
 * More reliable than just checking screen size
 */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      (navigator as any).msMaxTouchPoints > 0
    );
  }, []);

  return isTouch;
}

/**
 * Get device type (mobile, tablet, desktop)
 */
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export function useDeviceType(): DeviceType {
  const [deviceType, setDeviceType] = useState<DeviceType>('desktop');

  useEffect(() => {
    const checkDeviceType = () => {
      const width = window.innerWidth;

      if (width < 640) {
        setDeviceType('mobile');
      } else if (width < 1024) {
        setDeviceType('tablet');
      } else {
        setDeviceType('desktop');
      }
    };

    checkDeviceType();
    window.addEventListener('resize', checkDeviceType);

    return () => window.removeEventListener('resize', checkDeviceType);
  }, []);

  return deviceType;
}

/**
 * Detect network connection status
 * Useful for disaster relief apps that need offline support
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Detect network connection quality
 * Useful for adapting UI based on connection speed
 */
export type ConnectionType = '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';

export function useNetworkSpeed(): ConnectionType {
  const [connectionType, setConnectionType] = useState<ConnectionType>('unknown');

  useEffect(() => {
    const connection = (navigator as any).connection ||
                      (navigator as any).mozConnection ||
                      (navigator as any).webkitConnection;

    if (connection) {
      const updateConnectionType = () => {
        setConnectionType(connection.effectiveType || 'unknown');
      };

      updateConnectionType();
      connection.addEventListener('change', updateConnectionType);

      return () => {
        connection.removeEventListener('change', updateConnectionType);
      };
    }
  }, []);

  return connectionType;
}

/**
 * Detect safe area insets for notched devices
 * Returns padding values for safe areas
 */
export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function useSafeAreaInsets(): SafeAreaInsets {
  const [insets, setInsets] = useState<SafeAreaInsets>({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  useEffect(() => {
    const computedStyle = getComputedStyle(document.documentElement);

    setInsets({
      top: parseInt(computedStyle.getPropertyValue('env(safe-area-inset-top)') || '0', 10),
      right: parseInt(computedStyle.getPropertyValue('env(safe-area-inset-right)') || '0', 10),
      bottom: parseInt(computedStyle.getPropertyValue('env(safe-area-inset-bottom)') || '0', 10),
      left: parseInt(computedStyle.getPropertyValue('env(safe-area-inset-left)') || '0', 10),
    });
  }, []);

  return insets;
}

/**
 * Detect if user prefers reduced motion
 * Respect accessibility preferences
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return prefersReducedMotion;
}

/**
 * Get viewport height accounting for mobile browser chrome
 * Returns dynamic viewport height (dvh) if supported, otherwise vh
 */
export function useViewportHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const updateHeight = () => {
      // Use visualViewport if available (more accurate on mobile)
      if (window.visualViewport) {
        setHeight(window.visualViewport.height);
      } else {
        setHeight(window.innerHeight);
      }
    };

    updateHeight();

    window.addEventListener('resize', updateHeight);
    window.visualViewport?.addEventListener('resize', updateHeight);

    return () => {
      window.removeEventListener('resize', updateHeight);
      window.visualViewport?.removeEventListener('resize', updateHeight);
    };
  }, []);

  return height;
}
