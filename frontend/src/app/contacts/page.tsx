// SPDX-License-Identifier: Apache-2.0

'use client';

export default function EmergencyContacts() {
  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-gradient-to-r from-red-600 to-red-700 text-white px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold">Emergency Contacts</h1>
          <p className="text-red-100 mt-1">ආපදා සහන ලබාගැනීමේ හදිසි ඇමතුම් අංක</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* National Emergency Numbers */}
        <section className="card p-6">
          <h2 className="text-xl font-bold mb-1 text-red-600">
            National Emergency Numbers
          </h2>
          <p className="text-sm text-slate-400 mb-6">ජාතික මට්ටමේ හදිසි ඇමතුම් අංක</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ContactCard
              number="117"
              title="Disaster Management Centre (DMC)"
              titleSi="ආපදා කළමනාකරණ මධ්‍යස්ථානය"
              description="Emergency disaster reporting and relief coordination"
              color="red"
            />
            <ContactCard
              number="119"
              title="Police Emergency"
              titleSi="පොලිස් හදිසි ඇමතුම්"
              description="Life-saving and emergency security needs"
              color="blue"
            />
            <ContactCard
              number="1990"
              title="Suwa Seriya Ambulance"
              titleSi="සුව සැරිය ගිලන් රථ සේවාව"
              description="Patient hospitalization"
              color="emerald"
            />
            <ContactCard
              number="110"
              title="Fire and Rescue"
              titleSi="ගිනි නිවන හමුදාව"
              description="Fire incidents and victim rescue"
              color="amber"
            />
            <ContactCard
              number="116"
              title="Air Force"
              titleSi="ගුවන් හමුදා මූලස්ථානය"
              description="Helicopter rescue operations"
              color="violet"
            />
          </div>
        </section>

        <section className="card p-6 text-sm text-slate-300 space-y-2">
          <p>
            For district disaster management units, call <a href="tel:117" className="font-semibold text-white underline">117</a> or
            visit{' '}
            <a href="https://www.dmc.gov.lk" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">
              https://www.dmc.gov.lk
            </a>
            .
          </p>
          <p className="text-xs text-slate-400">Numbers verified 11 Oct 2026 against public DMC/Police advisories.</p>
        </section>
      </main>
    </div>
  );
}

function ContactCard({
  number,
  title,
  titleSi,
  description,
  color,
}: {
  number: string;
  title: string;
  titleSi: string;
  description: string;
  color: string;
}) {
  const colorClasses: Record<string, { bg: string; text: string; hover: string }> = {
    red: { bg: 'bg-red-600', text: 'text-red-600', hover: 'hover:bg-red-700' },
    blue: { bg: 'bg-blue-600', text: 'text-blue-600', hover: 'hover:bg-blue-700' },
    emerald: { bg: 'bg-emerald-600', text: 'text-emerald-600', hover: 'hover:bg-emerald-700' },
    amber: { bg: 'bg-amber-600', text: 'text-amber-600', hover: 'hover:bg-amber-700' },
    yellow: { bg: 'bg-yellow-600', text: 'text-yellow-600', hover: 'hover:bg-yellow-700' },
    cyan: { bg: 'bg-cyan-600', text: 'text-cyan-600', hover: 'hover:bg-cyan-700' },
    violet: { bg: 'bg-violet-600', text: 'text-violet-600', hover: 'hover:bg-violet-700' },
  };

  const styles = colorClasses[color] || colorClasses.blue;

  return (
    <div className="bg-slate-900 rounded-xl p-4 border border-slate-700/60 hover:shadow-soft transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white">{title}</div>
          <div className="text-xs text-slate-400 mb-1">{titleSi}</div>
          <div className="text-sm text-slate-300">{description}</div>
        </div>
        <a
          href={`tel:${number.replace(/\s/g, '')}`}
          className={`${styles.bg} ${styles.hover} text-white px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap transition-colors flex-shrink-0`}
        >
          {number}
        </a>
      </div>
    </div>
  );
}
