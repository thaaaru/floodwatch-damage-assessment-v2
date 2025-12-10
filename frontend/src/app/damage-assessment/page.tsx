// SPDX-License-Identifier: Apache-2.0

'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

// Dynamically import the map component to avoid SSR issues with Leaflet
const DamageMap = dynamic(
  () => import('@/components/damage-assessment/DamageMap'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">Loading damage assessment map...</p>
        </div>
      </div>
    )
  }
);

export default function DamageAssessmentPage() {
  return (
    <div className="relative w-full h-screen">
      <Suspense fallback={<div>Loading...</div>}>
        <DamageMap />
      </Suspense>
    </div>
  );
}
