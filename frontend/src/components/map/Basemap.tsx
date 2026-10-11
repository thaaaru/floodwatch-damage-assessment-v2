// SPDX-License-Identifier: Apache-2.0
'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { Layer } from 'leaflet';
import { addBasemap, BasemapFlavor } from '@/lib/basemap';

/** react-leaflet child that adds the shared self-hosted basemap (see lib/basemap.ts). */
export default function Basemap({ flavor = 'light' }: { flavor?: BasemapFlavor }) {
  const map = useMap();
  useEffect(() => {
    let layer: Layer | null = null;
    let cancelled = false;
    addBasemap(map, flavor).then((l) => {
      if (cancelled) l?.remove();
      else layer = l;
    });
    return () => {
      cancelled = true;
      layer?.remove();
    };
  }, [map, flavor]);
  return null;
}
