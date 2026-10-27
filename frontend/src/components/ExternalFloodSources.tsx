'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ExternalFloodSnapshot, ExternalFloodSource } from '@/lib/api';
import { ui } from '@/lib/ui';

const LABELS: Record<string, string> = {
  gauge_count: 'Gauges', rainfall_count: 'Rainfall records', flood_risk_count: 'Risk records',
  alert_count: 'Alerts', latest_level_count: 'Latest levels', flood_status_count: 'Flood statuses',
};

const STATUS_STYLE: Record<ExternalFloodSource['status'], string> = {
  ok: 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300',
  partial: 'border-amber-700/60 bg-amber-950/40 text-amber-300',
  stale: 'border-orange-700/60 bg-orange-950/40 text-orange-300',
  disabled: 'border-slate-600 bg-slate-800 text-slate-300',
  error: 'border-red-700/60 bg-red-950/40 text-red-300',
};

const HEALTH_LABELS: Array<[ExternalFloodSource['status'], string]> = [
  ['ok', 'Healthy'], ['stale', 'Delayed or stale'], ['partial', 'Partial'], ['disabled', 'Disabled'], ['error', 'Error'],
];

function formatSourceTime(value: string | null) {
  return value
    ? new Date(value.replace(' ', 'T')).toLocaleString('en-LK', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' })
    : 'Not available';
}

export default function ExternalFloodSources() {
  const [snapshot, setSnapshot] = useState<ExternalFloodSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const mounted = useRef(true);

  const loadSnapshot = useCallback(() => {
    setLoading(true);
    setUnavailable(false);
    return api.getExternalFloodSnapshot()
      .then((data) => {
        if (!Array.isArray(data?.sources)) throw new Error('Invalid external flood snapshot');
        if (mounted.current) setSnapshot(data);
      })
      .catch(() => {
        if (mounted.current) setUnavailable(true);
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadSnapshot();
    return () => { mounted.current = false; };
  }, [loadSnapshot]);

  if (loading && !snapshot) {
    return (
      <section aria-labelledby="external-flood-heading" aria-busy="true" className="space-y-3">
        <h2 id="external-flood-heading" className={ui.h2}>Additional flood intelligence</h2>
        <p role="status" aria-live="polite" className={`${ui.muted} rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2`}>
          Loading external source health and freshness…
        </p>
      </section>
    );
  }

  if (unavailable && !snapshot) {
    return (
      <section aria-labelledby="external-flood-heading" className="space-y-3">
        <h2 id="external-flood-heading" className={ui.h2}>Additional flood intelligence</h2>
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          <span>External source health and freshness are temporarily unavailable.</span>
          <button type="button" onClick={() => loadSnapshot()} className="focus-ring min-h-11 rounded-lg border border-amber-600 px-3 font-semibold hover:bg-amber-900">Retry</button>
        </div>
      </section>
    );
  }

  if (snapshot && snapshot.sources.length === 0) {
    return (
      <section aria-labelledby="external-flood-heading" aria-busy="false" className="space-y-3">
        <h2 id="external-flood-heading" className={ui.h2}>Additional flood intelligence</h2>
        <p role="status" aria-live="polite" className={`${ui.muted} rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2`}>
          No external flood sources are currently included in this snapshot.
        </p>
      </section>
    );
  }

  if (!snapshot) return null;

  return (
    <section aria-labelledby="external-flood-heading" className="space-y-3">
      <div>
        <h2 id="external-flood-heading" className={ui.h2}>Additional flood intelligence</h2>
        <p className={`${ui.muted} mt-1`}>
          Separate community, aggregated and forecast signals. These records are not merged into the official measured map layers.
        </p>
      </div>
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3" aria-label="External source health summary">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {HEALTH_LABELS.map(([status, label]) => (
            <div key={status}>
              <dt className="text-xs text-slate-400">{label}</dt>
              <dd className="text-lg font-semibold text-white">{snapshot.source_status_counts[status] ?? 0}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-slate-300">
          Source-reported update range for usable sources: oldest {formatSourceTime(snapshot.oldest_usable_update_at)}; newest {formatSourceTime(snapshot.newest_usable_update_at)}. This describes source freshness, not live status or accuracy.
        </p>
      </div>
      <p role="note" className="rounded-lg border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
        Operational limitation: this information supports situational awareness only. Do not use it for official emergency decisions; follow authorities and emergency services.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {snapshot.sources.map((source) => <SourceCard key={source.id} source={source} />)}
      </div>
    </section>
  );
}

function SourceCard({ source }: { source: ExternalFloodSource }) {
  const metrics = Object.entries(source.summary).filter(
    ([key, value]) => key !== 'stale' && key !== 'endpoint_statuses' && (typeof value === 'number' || typeof value === 'string'),
  );
  const nonOfficial = source.kind === 'aggregator' || source.kind === 'community';
  const updated = formatSourceTime(source.updated_at);

  return (
    <article className={`${ui.card} ${ui.cardPad} flex flex-col gap-3`}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{source.kind}</p>
          <h3 className="font-semibold text-white">{source.name}</h3>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase ${STATUS_STYLE[source.status]}`}>
          {source.status}
        </span>
      </header>
      {nonOfficial && (
        <p className="rounded border border-amber-800/60 bg-amber-950/30 px-2 py-1.5 text-xs font-medium text-amber-200">
          Non-official source
        </p>
      )}
      <p className="text-xs text-slate-300">{source.status_message}</p>
      {metrics.length > 0 && (
        <dl className="grid grid-cols-2 gap-2">
          {metrics.map(([key, value]) => (
            <div key={key} className="rounded-lg bg-slate-900/60 px-2.5 py-2">
              <dt className="text-[11px] text-slate-400">{LABELS[key] ?? key.replaceAll('_', ' ')}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-white">{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-auto space-y-1 text-[11px] leading-relaxed text-slate-400">
        <p><span className="text-slate-300">Source-reported update:</span> {updated}</p>
        <p>{source.attribution}</p>
        <p>{source.license}</p>
      </div>
      <a href={source.source_url} target="_blank" rel="noopener noreferrer" className={`${ui.link} inline-flex min-h-11 items-center text-sm`}>
        Open source documentation <span aria-hidden="true" className="ml-1">↗</span>
      </a>
    </article>
  );
}
