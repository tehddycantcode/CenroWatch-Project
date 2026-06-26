import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, FileText, CircleCheck, Bird, Trash2, Sprout } from 'lucide-react';
import { gisApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { BrandMark } from '@/components/ui/brand-mark';
import { IconChip } from '@/components/ui/icon-chip';
import { cardHover } from '@/components/ui/card';

const services = [
  {
    title: 'Environmental Complaints',
    desc: 'Report illegal dumping, open burning, noise, and other concerns with photo evidence and a map pin.',
    icon: Trash2,
    tone: 'amber',
  },
  {
    title: 'Wildlife Turnover',
    desc: 'Report sightings or turn over rescued wildlife. Endangered species are flagged for priority review.',
    icon: Bird,
    tone: 'violet',
  },
  {
    title: 'Service Requests',
    desc: 'Request seedlings, garbage hauling, creek cleaning, or environmental education from CENRO.',
    icon: Sprout,
    tone: 'primary',
  },
];

const STAT_META = {
  'Total Reports': { icon: FileText, tone: 'primary' },
  Resolved: { icon: CircleCheck, tone: 'forest' },
  'Wildlife Cases': { icon: Bird, tone: 'violet' },
  'Barangays Covered': { icon: MapPin, tone: 'blue' },
};

export default function LandingPage() {
  const [stats, setStats] = useState([
    { label: 'Total Reports', value: '-' },
    { label: 'Resolved', value: '-' },
    { label: 'Wildlife Cases', value: '-' },
    { label: 'Barangays Covered', value: '18' },
  ]);

  useEffect(() => {
    gisApi
      .stats()
      .then((r) => {
        const s = r.data.stats;
        setStats([
          { label: 'Total Reports', value: String(s.total_reports) },
          { label: 'Resolved', value: String(s.resolved) },
          { label: 'Wildlife Cases', value: String(s.wildlife_cases) },
          { label: 'Barangays Covered', value: String(s.barangays_covered) },
        ]);
      })
      .catch(() => {}); // leave the placeholders if the API is unreachable
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" aria-label="CENROWATCH home">
            <BrandMark withWordmark />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground sm:flex">
            <Link to="/map" className="transition-colors hover:text-foreground">Live Map</Link>
            <Link to="/feed" className="transition-colors hover:text-foreground">Reports</Link>
            <Link to="/wildlife" className="transition-colors hover:text-foreground">Wildlife</Link>
            <Link to="/login" className="transition-colors hover:text-foreground">Login</Link>
          </nav>
          <Link to="/register" className={buttonVariants({ size: 'sm' })}>Report Now</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-eco-soft">
        <div className="container py-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft">
              <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Live - Cabuyao City Environmental System
            </span>
            <h1 className="mt-6 font-display text-4xl tracking-tight sm:text-5xl">
              Guard <span className="text-primary">Cabuyao&apos;s</span> Environment Together
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Report environmental concerns, track wildlife sightings, and help CENRO protect
              all 18 barangays of Cabuyao City - from your phone or computer.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/register" className={buttonVariants({ size: 'lg' })}>File a Report</Link>
              <Link to="/report-anonymous" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                Report Anonymously
              </Link>
              <Link to="/map" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                View Live Map
              </Link>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Have a reference number?{' '}
              <Link to="/track" className="font-medium text-primary hover:underline">Track your report</Link>.
            </p>
          </div>

          {/* Stats */}
          <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
            {stats.map((s) => {
              const meta = STAT_META[s.label];
              return (
                <div key={s.label} className="rounded-xl border bg-background p-6 text-center shadow-soft">
                  {meta && <IconChip icon={meta.icon} tone={meta.tone} size="sm" className="mx-auto" />}
                  <div className="mt-3 text-3xl font-bold text-primary">{s.value}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{s.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="border-t bg-muted/30">
        <div className="container py-16">
          <h2 className="text-center font-display text-3xl">What you can do</h2>
          <div className="mx-auto mt-10 grid max-w-5xl gap-6 sm:grid-cols-3">
            {services.map((s) => (
              <div key={s.title} className={cn('rounded-xl border bg-background p-6', cardHover)}>
                <IconChip icon={s.icon} tone={s.tone} size="lg" />
                <h3 className="mt-4 font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="container flex flex-col items-center justify-between gap-2 py-8 text-sm text-muted-foreground sm:flex-row">
          <span>{new Date().getFullYear()} CENROWATCH - CENRO Cabuyao</span>
          <span>Pamantasan ng Cabuyao - BSIT Capstone</span>
        </div>
      </footer>
    </div>
  );
}
