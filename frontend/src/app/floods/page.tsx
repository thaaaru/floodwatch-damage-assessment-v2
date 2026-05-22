// SPDX-License-Identifier: Apache-2.0

// The /floods page was hidden on 2026-05-22 (UX request). The previous
// implementation (Leaflet map of irrigation gauges) is preserved in git
// history at commit e627f20 if it ever needs to be restored.
//
// Anyone landing here directly via an old link or bookmark is sent to
// /rivers, which surfaces the same 24 Sri Lanka Irrigation Department
// gauging stations with their water-level data.

import { redirect } from 'next/navigation';

export default function FloodsPage() {
  redirect('/rivers');
}
