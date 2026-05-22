// SPDX-License-Identifier: Apache-2.0

'use client';

import { useState } from 'react';

interface BarChartDatum {
  /** Used as the React key + the X-axis identifier (e.g. year). */
  key: number | string;
  /** Bar height value. */
  value: number;
  /** Optional secondary label for tooltips (e.g. "extreme days"). */
  unit?: string;
  /** Per-bar color override (defaults to props.color). */
  color?: string;
}

interface HoverBarChartProps {
  /** Data points, rendered left-to-right in the given order. */
  data: BarChartDatum[];
  /** Solid color used for every bar that doesn't specify its own. */
  color?: string;
  /** Decimal places to show in the tooltip / label (0 -> integer). */
  precision?: number;
  /** Tailwind height utility, e.g. 'h-12'. */
  heightClass?: string;
  /**
   * If set, ensures the minimum visible bar height (in % of container) so
   * that zero / near-zero values are still discoverable on hover.
   */
  minBarPercent?: number;
  /** Optional value formatter (e.g. for `unit` suffixes). */
  formatValue?: (v: number) => string;
}

/**
 * Bar chart with a React-managed hover tooltip.
 *
 * Designed for the /intel sparklines and 5-year moving-average chart -
 * dense, single-color bars with a year on hover. The previous `title=`
 * attribute approach showed the native browser tooltip, which is slow,
 * dull, and styled per-OS. This component renders a small floating
 * label that follows the cursor target bar.
 */
export default function HoverBarChart({
  data,
  color = '#3b82f6',
  precision = 0,
  heightClass = 'h-12',
  minBarPercent = 0,
  formatValue,
}: HoverBarChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const format = formatValue ?? ((v: number) => v.toFixed(precision));
  const hoveredDatum = hovered !== null ? data[hovered] : null;
  const hoveredFraction = hovered !== null ? hovered / Math.max(data.length - 1, 1) : 0;

  return (
    <div className="relative">
      <div className={`flex items-end gap-px ${heightClass}`}>
        {data.map((d, idx) => {
          const rawPct = (d.value / maxValue) * 100;
          const heightPct = Math.max(rawPct, minBarPercent);
          const barColor = d.color ?? color;
          const isHovered = idx === hovered;
          return (
            <div
              key={d.key}
              className="flex-1 rounded-t min-w-[2px] cursor-pointer transition-opacity"
              style={{
                height: `${heightPct}%`,
                backgroundColor: barColor,
                opacity: hovered === null ? 1 : isHovered ? 1 : 0.5,
              }}
              onMouseEnter={() => setHovered(idx)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
      </div>
      {hoveredDatum !== null && (
        // Tooltip floats just above the bar. We anchor it horizontally as a
        // % of the chart width so it tracks the bar without DOM measurement.
        <div
          className="pointer-events-none absolute -top-10 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-lg ring-1 ring-slate-700"
          style={{ left: `${hoveredFraction * 100}%` }}
        >
          <div className="font-semibold">{hoveredDatum.key}</div>
          <div className="text-slate-300">
            {format(hoveredDatum.value)}
            {hoveredDatum.unit ? ` ${hoveredDatum.unit}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
