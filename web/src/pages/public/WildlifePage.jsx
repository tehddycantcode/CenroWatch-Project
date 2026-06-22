import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { gisApi } from '@/lib/api';
import { SPECIES, FIELD_GUIDANCE, CONSERVATION_TONE } from '@/lib/species';
import PublicHeader from '@/components/public/PublicHeader';
import { Card } from '@/components/ui/card';

function StatusBadge({ status }) {
  const tone = CONSERVATION_TONE[status] || CONSERVATION_TONE.Common;
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${tone.bg} ${tone.fg}`}>{status}</span>;
}

export default function WildlifePage() {
  const [stats, setStats] = useState(null);

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
          <div className="mx-auto mt-10 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SPECIES.map((s) => (
              <Card key={s.scientific} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-foreground">{s.name}</h3>
                    <p className="text-xs italic text-muted-foreground">{s.scientific}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{s.group}</div>
                <p className="mt-3 flex-1 text-sm text-muted-foreground">{s.blurb}</p>
                <div className="mt-4 rounded-lg bg-accent/40 p-3 text-xs text-foreground">
                  <span className="font-semibold">If you find one: </span>
                  {s.note}
                </div>
              </Card>
            ))}
          </div>
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
