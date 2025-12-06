'use client';

export default function EmergencyContacts() {
  return (
    <div className="min-h-screen bg-slate-50">
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
          <p className="text-sm text-slate-500 mb-6">ජාතික මට්ටමේ හදිසි ඇමතුම් අංක</p>

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
              title="Fire Brigade"
              titleSi="ගිනි නිවන හමුදාව"
              description="Fire incidents and victim rescue"
              color="amber"
            />
            <ContactCard
              number="011 258 8946"
              title="NBRO (Landslide Warnings)"
              titleSi="ජාතික ගොඩනැගිලි පර්යේෂණ සංවිධානය"
              description="Landslide risk reporting"
              color="yellow"
            />
            <ContactCard
              number="011 268 6686"
              title="Meteorological Department"
              titleSi="කාලගුණ විද්‍යා දෙපාර්තමේන්තුව"
              description="Weather forecasts"
              color="cyan"
            />
            <ContactCard
              number="011 244 5368"
              title="Navy Headquarters"
              titleSi="නාවික හමුදා මූලස්ථානය"
              description="Boat services and flood rescue"
              color="blue"
            />
            <ContactCard
              number="113"
              title="Army Headquarters"
              titleSi="යුධ හමුදා මූලස්ථානය"
              description="Emergency disaster relief and rescue"
              color="emerald"
            />
            <ContactCard
              number="116"
              title="Air Force Headquarters"
              titleSi="ගුවන් හමුදා මූලස්ථානය"
              description="Helicopter rescue operations"
              color="violet"
            />
          </div>
        </section>

        {/* Western Province */}
        <ProvinceSection
          title="Western Province"
          titleSi="බස්නාහිර පළාත"
          note="High flood risk areas"
          districts={[
            { name: 'Colombo', nameSi: 'කොළඹ', phone1: '011 243 4028', phone2: '077 395 7893' },
            { name: 'Gampaha', nameSi: 'ගම්පහ', phone1: '033 223 4676', phone2: '077 395 7888' },
            { name: 'Kalutara', nameSi: 'කළුතර', phone1: '034 222 2344', phone2: '077 395 7887' },
          ]}
        />

        {/* Southern Province */}
        <ProvinceSection
          title="Southern Province"
          titleSi="දකුණු පළාත"
          districts={[
            { name: 'Galle', nameSi: 'ගාල්ල', phone1: '091 224 2355', phone2: '077 395 7889' },
            { name: 'Matara', nameSi: 'මාතර', phone1: '041 223 4030', phone2: '077 395 7894' },
            { name: 'Hambantota', nameSi: 'හම්බන්තොට', phone1: '047 225 8056', phone2: '077 395 7895' },
          ]}
        />

        {/* Sabaragamuwa Province */}
        <ProvinceSection
          title="Sabaragamuwa Province"
          titleSi="සබරගමුව පළාත"
          note="Landslide and flood prone"
          districts={[
            { name: 'Ratnapura', nameSi: 'රත්නපුර', phone1: '045 222 5522', phone2: '077 395 7898' },
            { name: 'Kegalle', nameSi: 'කෑගල්ල', phone1: '035 222 2843', phone2: '077 395 7891' },
          ]}
        />

        {/* North Western Province */}
        <ProvinceSection
          title="North Western Province"
          titleSi="වයඹ පළාත"
          districts={[
            { name: 'Kurunegala', nameSi: 'කුරුණෑගල', phone1: '037 222 0455', phone2: '077 395 7892' },
            { name: 'Puttalam', nameSi: 'පුත්තලම', phone1: '032 226 5345', phone2: '077 395 7896' },
          ]}
        />

        {/* Central Province */}
        <ProvinceSection
          title="Central Province"
          titleSi="මධ්‍යම පළාත"
          districts={[
            { name: 'Kandy', nameSi: 'මහනුවර', phone1: '081 220 2875', phone2: '077 395 7890' },
            { name: 'Nuwara Eliya', nameSi: 'නුවරඑළිය', phone1: '052 222 3448', phone2: '077 395 7897' },
            { name: 'Matale', nameSi: 'මාතලේ', phone1: '066 223 0926', phone2: '077 395 7886' },
          ]}
        />

        {/* North Central Province */}
        <ProvinceSection
          title="North Central Province"
          titleSi="උතුරු මැද පළාත"
          districts={[
            { name: 'Anuradhapura', nameSi: 'අනුරාධපුරය', phone1: '025 222 5333', phone2: '077 395 7883' },
            { name: 'Polonnaruwa', nameSi: 'පොළොන්නරුව', phone1: '027 222 6676', phone2: '077 395 7884' },
          ]}
        />

        {/* Uva Province */}
        <ProvinceSection
          title="Uva Province"
          titleSi="ඌව පළාත"
          districts={[
            { name: 'Badulla', nameSi: 'බදුල්ල', phone1: '055 222 4434', phone2: '077 395 7885' },
            { name: 'Monaragala', nameSi: 'මොනරාගල', phone1: '055 227 6378', phone2: '077 395 7893' },
          ]}
        />

        {/* Report Emergency CTA */}
        <section className="card p-8 bg-gradient-to-br from-brand-600 to-brand-700 text-white text-center">
          <h2 className="text-2xl font-bold mb-2">Report an Emergency</h2>
          <p className="text-brand-100 mb-6">Submit SOS requests for immediate rescue assistance</p>
          <a
            href="https://floodsupport.org"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-white text-brand-700 px-6 py-3 rounded-xl font-bold text-lg hover:bg-brand-50 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            FloodSupport.org
          </a>
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
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/60 hover:shadow-soft transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900">{title}</div>
          <div className="text-xs text-slate-500 mb-1">{titleSi}</div>
          <div className="text-sm text-slate-600">{description}</div>
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

function ProvinceSection({
  title,
  titleSi,
  note,
  districts,
}: {
  title: string;
  titleSi: string;
  note?: string;
  districts: Array<{ name: string; nameSi: string; phone1: string; phone2: string }>;
}) {
  return (
    <section className="card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{titleSi}</p>
        </div>
        {note && (
          <span className="badge-warning">{note}</span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {districts.map((d) => (
          <div key={d.name} className="bg-slate-50 rounded-xl p-4 border border-slate-200/60">
            <div className="font-semibold text-slate-900">{d.name}</div>
            <div className="text-xs text-slate-500 mb-3">{d.nameSi}</div>
            <div className="flex flex-col gap-2">
              <a
                href={`tel:${d.phone1.replace(/\s/g, '')}`}
                className="text-sm bg-slate-200 hover:bg-brand-600 hover:text-white px-3 py-2 rounded-lg text-center font-medium transition-colors"
              >
                {d.phone1}
              </a>
              <a
                href={`tel:${d.phone2.replace(/\s/g, '')}`}
                className="text-sm bg-slate-200 hover:bg-emerald-600 hover:text-white px-3 py-2 rounded-lg text-center font-medium transition-colors"
              >
                {d.phone2}
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
