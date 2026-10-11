// SPDX-License-Identifier: Apache-2.0

'use client';

type Contact = { number: string; title: string; titleSi: string; description: string };

// 117 (DMC) is the primary number; the rest are national emergency services.
const PRIMARY: Contact = {
  number: '117',
  title: 'Disaster Management Centre (DMC)',
  titleSi: 'ආපදා කළමනාකරණ මධ්‍යස්ථානය',
  description: 'Emergency disaster reporting and relief coordination',
};

const OTHERS: Contact[] = [
  { number: '119', title: 'Police Emergency', titleSi: 'පොලිස් හදිසි ඇමතුම්', description: 'Life-saving and emergency security needs' },
  { number: '1990', title: 'Suwa Seriya Ambulance', titleSi: 'සුව සැරිය ගිලන් රථ සේවාව', description: 'Patient hospitalization' },
  { number: '110', title: 'Fire and Rescue', titleSi: 'ගිනි නිවන හමුදාව', description: 'Fire incidents and victim rescue' },
  { number: '116', title: 'Air Force', titleSi: 'ගුවන් හමුදාව', description: 'Helicopter rescue operations' },
];

const callClasses =
  'focus-ring inline-flex items-center justify-center gap-2 min-h-[48px] min-w-[96px] px-5 rounded-xl font-bold text-lg transition-colors';

export default function EmergencyContacts() {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="bg-slate-800/50 border-b border-slate-700/50">
        <div className="max-w-5xl mx-auto px-4 py-5">
          <h1 className="text-2xl font-bold">Emergency contacts</h1>
          <p className="text-sm text-slate-300 mt-1">ආපදා සහන ලබාගැනීමේ හදිසි ඇමතුම් අංක</p>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <section className="card p-5 sm:p-6" aria-labelledby="national">
          <h2 id="national" className="text-xl font-bold text-white">National emergency numbers</h2>
          <p className="text-sm text-slate-300 mb-5">ජාතික මට්ටමේ හදිසි ඇමතුම් අංක</p>

          {/* Primary: DMC 117 */}
          <div className="rounded-xl border-2 border-red-500 bg-red-500/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-lg font-bold text-white">{PRIMARY.title}</div>
              <div className="text-sm text-slate-300">{PRIMARY.titleSi}</div>
              <div className="text-slate-200 mt-1">{PRIMARY.description}</div>
            </div>
            <a
              href={`tel:${PRIMARY.number}`}
              className={`${callClasses} bg-red-600 text-white hover:bg-red-500 text-2xl min-h-[56px] px-8`}
              aria-label={`Call ${PRIMARY.number}, ${PRIMARY.title}`}
            >
              <PhoneIcon />
              {PRIMARY.number}
            </a>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {OTHERS.map((c) => (
              <div key={c.number} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white">{c.title}</div>
                  <div className="text-xs text-slate-300">{c.titleSi}</div>
                  <div className="text-sm text-slate-300 mt-0.5">{c.description}</div>
                </div>
                <a
                  href={`tel:${c.number}`}
                  className={`${callClasses} bg-slate-700 text-white hover:bg-slate-600 border border-slate-500`}
                  aria-label={`Call ${c.number}, ${c.title}`}
                >
                  {c.number}
                </a>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5 sm:p-6 text-slate-300 space-y-2">
          <p>
            For district disaster management units, call{' '}
            <a href="tel:117" className="focus-ring rounded font-semibold text-white underline underline-offset-2">117</a> or
            visit{' '}
            <a
              href="https://www.dmc.gov.lk"
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring rounded text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
            >
              https://www.dmc.gov.lk
            </a>
            .
          </p>
          <p className="text-sm text-slate-300">Numbers verified 11 Oct 2026 against public DMC/Police advisories.</p>
        </section>
      </main>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}
