import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { gisApi, fileUrl } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { useSpecies } from '@/lib/useSpecies';
import PublicHeader from '@/components/public/PublicHeader';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/icons';

// Keyed on SpeciesIndicator. The old map keyed on display strings and included
// 'Caution: Venomous', which conflated conservation standing with danger - those
// are separate fields now (indicator and hazard), because a Reticulated Python
// is Native but dangerous and a Philippine Duck is Vulnerable but harmless.
const INDICATOR_TONE = {
  Common: { bg: 'bg-slate-100', fg: 'text-slate-700' },
  Native: { bg: 'bg-emerald-100', fg: 'text-emerald-800' },
  Endemic: { bg: 'bg-purple-100', fg: 'text-purple-800' },
  Near_Threatened: { bg: 'bg-orange-100', fg: 'text-orange-800' },
  Vulnerable: { bg: 'bg-amber-100', fg: 'text-amber-800' },
  Endangered: { bg: 'bg-red-100', fg: 'text-red-800' },
  Critically_Endangered: { bg: 'bg-red-200', fg: 'text-red-900' },
};

const HAZARD_TONE = { bg: 'bg-red-100', fg: 'text-red-800' };

// Written out rather than run through humanize(), which would print
// "Powerful Bite Or Talons". These are read by someone standing near the animal,
// so each one is phrased as the warning rather than as an enum value.
const HAZARD_LABEL = {
  Venomous: 'Venomous',
  Aggressive: 'Can be aggressive',
  Disease_Risk: 'Disease risk',
  Powerful_Bite_Or_Talons: 'Powerful bite or talons',
};

const BADGE = 'rounded px-2 py-0.5 text-xs font-semibold';

// `indicator` is descriptive and nullable - an Admin may add a species without
// deciding its conservation standing. Nothing is shown in that case: defaulting
// the label to "Common" would turn a blank field into a claim about the animal.
function IndicatorBadge({ indicator }) {
  if (!indicator) return null;
  const tone = INDICATOR_TONE[indicator] || INDICATOR_TONE.Common;
  return <span className={`${BADGE} ${tone.bg} ${tone.fg}`}>{humanize(indicator)}</span>;
}

// "What to do if you find wildlife" - quick guidance shown on the page. Static
// editorial copy with a single consumer, so it lives on the page that renders
// it; everything species-specific comes from the catalogue instead.
const FIELD_GUIDANCE = [
  {
    title: 'Keep a safe distance',
    text: 'Do not corner, chase, or handle the animal, especially snakes, raptors, and bats. Keep children and pets away.',
  },
  {
    title: 'Do not keep or sell it',
    text: 'Possessing or trading protected wildlife is illegal (R.A. 9147). Native species belong in the wild.',
  },
  {
    title: 'Report a turnover',
    text: 'File a wildlife turnover so CENRO can document species, condition, and chain-of-custody, then arrange rescue or release.',
  },
  {
    title: 'Endangered species are protected',
    text: 'Exact locations of endangered species are obfuscated on public maps to deter poaching.',
  },
];

export default function WildlifePage() {
  const [stats, setStats] = useState(null);
  const { common, endangered, loading, error } = useSpecies();

  // Every species except the `Other` sentinel, which the hook keeps separate: it
  // stands in for "an animal not in the catalogue" and is not an animal, so it
  // must never appear in a field guide.
  const rows = common.concat(endangered);

  // Attribution for whichever species currently carry a photo. A credit with no
  // photo attributes nothing, so both are required.
  const credits = rows
    .filter((s) => s.photo_path && s.photo_credit)
    .map((s) => ({ name: s.name, credit: s.photo_credit }));

  useEffect(() => {
    gisApi.stats().then((r) => setStats(r.data.stats)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      {/* Hero */}
      <section className="border-b bg-muted/30">
        <div className="container py-14">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
              Wildlife &amp; Biodiversity
            </span>
            <h1 className="mt-5 font-display text-4xl tracking-tight">Cabuyao&apos;s Wildlife</h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Cabuyao sits along Laguna de Bay, the largest lake in the Philippines. Its creeks, fishponds, and
              remaining green spaces shelter native birds, reptiles, and mammals. Learn how to recognize them and
              what to do if you encounter one.
            </p>
            {stats && (
              <div className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
                <div className="bg-background p-5 text-center">
                  <div className="text-2xl font-bold text-primary">{stats.wildlife_cases}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">Wildlife cases logged</div>
                </div>
                <div className="bg-background p-5 text-center">
                  <div className="text-2xl font-bold text-primary">{stats.barangays_covered}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">Barangays covered</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* What to do */}
      <section className="container py-14">
        <h2 className="text-center font-display text-3xl">Found wildlife? Here&apos;s what to do</h2>
        <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FIELD_GUIDANCE.map((g, i) => (
            <Card key={g.title} className="p-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {i + 1}
              </div>
              <h3 className="mt-3 font-semibold text-foreground">{g.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{g.text}</p>
            </Card>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/login" className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Report a wildlife turnover
          </Link>
          <Link to="/map" className="rounded-md border px-6 py-3 text-sm font-semibold hover:bg-accent">
            View the live map
          </Link>
        </div>
      </section>

      {/* Species guide */}
      <section className="border-t bg-muted/30">
        <div className="container py-14">
          <h2 className="text-center font-display text-3xl">Species you might encounter</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted-foreground">
            A field guide to wildlife commonly seen around Cabuyao and the Laguna de Bay shoreline.
          </p>

          {/* The catalogue is fetched now, so loading, failure and empty are all
              real states and each has to say something. A section that simply
              renders nothing reads as a broken page rather than as a list that
              has not arrived. */}
          {error ? (
            <p role="alert" className="mx-auto mt-10 max-w-2xl rounded-md border border-destructive/40 bg-destructive/5 p-4 text-center text-sm text-destructive">
              {error}
            </p>
          ) : loading ? (
            <p className="mt-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" />
              Loading the species guide&hellip;
            </p>
          ) : rows.length === 0 ? (
            <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted-foreground">
              The species guide is still being prepared. You can report a wildlife sighting or turnover either way.
            </p>
          ) : (
            <div className="mx-auto mt-10 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((s) => (
                <Card key={s.name} className="flex flex-col overflow-hidden">
                  {/* Photos are admin-uploaded and optional, so a card falls back
                      to text only and the grid stays consistent - which is the
                      state of a fresh install, where no species has one yet.
                      Through fileUrl(), never the bare stored path: the API SIGNS
                      the path, which makes it authorised, not absolute. The local
                      storage driver returns a relative /uploads/... that would
                      resolve against this app's origin - fine behind Vite's dev
                      proxy, a 404 on the deployed site, where the API is a
                      different origin. */}
                  {s.photo_path && (
                    <img
                      src={fileUrl(s.photo_path)}
                      alt={`Reference photograph of the ${s.name}`}
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover img-outline"
                    />
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-foreground">{s.name}</h3>
                        {s.scientific_name && (
                          <p className="text-xs italic text-muted-foreground">{s.scientific_name}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <IndicatorBadge indicator={s.indicator} />
                        {s.hazard && s.hazard !== 'None' && (
                          <span className={`${BADGE} ${HAZARD_TONE.bg} ${HAZARD_TONE.fg}`}>
                            {HAZARD_LABEL[s.hazard] || humanize(s.hazard)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {[s.category, s.biome && humanize(s.biome)].filter(Boolean).join(' · ')}
                    </div>
                    {s.local_name && (
                      <p className="mt-2 text-xs text-muted-foreground">Also called &ldquo;{s.local_name}&rdquo;</p>
                    )}
                    {/* A spacer even when empty, so the handling note stays
                        pinned to the bottom of every card in a row. */}
                    <div className="mt-3 flex-1">
                      {s.body_description && (
                        <p className="text-sm text-muted-foreground">{s.body_description}</p>
                      )}
                    </div>
                    {s.handling_note && (
                      <div className="mt-4 rounded-lg bg-accent/40 p-3 text-xs text-foreground">
                        <span className="font-semibold">If you find one: </span>
                        {s.handling_note}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {credits.length > 0 && (
            <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted-foreground">
              Photos: {credits.map((c) => `${c.name} (${c.credit})`).join('; ')}.
            </p>
          )}

          <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted-foreground">
            Educational reference only. Conservation status follows IUCN/DENR categories. Handling or trading
            protected wildlife is prohibited under R.A. 9147 (Wildlife Resources Conservation and Protection Act).
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="container flex flex-col items-center justify-between gap-2 py-8 text-sm text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} CENROWATCH · CENRO Cabuyao</span>
          <Link to="/" className="hover:text-foreground">Back to home</Link>
        </div>
      </footer>
    </div>
  );
}
