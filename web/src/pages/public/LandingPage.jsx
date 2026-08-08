import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin, FileText, CircleCheck, Bird, Trash2, Sprout,
  ClipboardList, Search,
} from 'lucide-react';
import { gisApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { roleHome } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button-variants';
import { CenroLogo } from '@/components/ui/cenro-logo';
import { IconChip } from '@/components/ui/icon-chip';
import { StatusBadge } from '@/components/ui/badge';
import { cardHover } from '@/components/ui/card';
import { LeafDivider, Step } from '@/components/ui/section';

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

// Per-service colored top strip.
const STRIP = { amber: 'bg-amber-400', violet: 'bg-violet-400', primary: 'bg-brand-accent', blue: 'bg-blue-400' };

// Stylized in-app preview shown beside the hero (no external image).
function HeroPreview() {
  return (
    <div className="animate-float-soft rounded-2xl border bg-background p-5 shadow-soft-lg">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">Live overview</div>
        <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Live
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-muted/30 p-3">
          <IconChip icon={FileText} tone="primary" size="sm" />
          <div className="mt-2 text-2xl font-bold text-primary">128</div>
          <div className="text-xs text-muted-foreground">Reports</div>
        </div>
        <div className="rounded-xl border bg-muted/30 p-3">
          <IconChip icon={CircleCheck} tone="forest" size="sm" />
          <div className="mt-2 text-2xl font-bold text-primary">94</div>
          <div className="text-xs text-muted-foreground">Resolved</div>
        </div>
      </div>
      <div className="mt-3 rounded-xl border bg-background p-3">
        <div className="flex items-center gap-3">
          <IconChip icon={Trash2} tone="amber" size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">Illegal dumping</div>
            <div className="text-xs text-muted-foreground">CMP-2026-0142</div>
          </div>
          <StatusBadge status="Under Review" />
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { isAuthenticated, user, loading } = useAuth();
  // Signed-in residents should land on the report form, not the sign-up page.
  const fileReportHref = !isAuthenticated
    ? '/register'
    : user.role === 'Resident'
      ? '/resident/report-complaint'
      : roleHome(user.role);
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
      <div className="accent-bar-top" />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          {/* Seal only on phones: wordmark + "Report Now" together exceeded a
              320px viewport and pushed the page into horizontal scroll. */}
          <Link to="/" aria-label="CENROWATCH home">
            <CenroLogo withWordmark className="hidden sm:inline-flex" />
            <CenroLogo className="sm:hidden" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground sm:flex">
            <Link to="/map" className="transition-colors hover:text-foreground">Heat Map</Link>
            <Link to="/feed" className="transition-colors hover:text-foreground">Reports</Link>
            <Link to="/wildlife" className="transition-colors hover:text-foreground">Wildlife</Link>
            {!loading && !isAuthenticated && (
              <Link to="/login" className="transition-colors hover:text-foreground">Login</Link>
            )}
          </nav>
          <Link
            to={isAuthenticated ? roleHome(user.role) : '/register'}
            className={buttonVariants({ size: 'sm' })}
          >
            {isAuthenticated ? 'My Dashboard' : 'Report Now'}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-eco-soft">
        <div className="pointer-events-none absolute inset-0 bg-leaf-motif opacity-60" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-24 top-6 h-72 w-72 rounded-full bg-brand-light/30 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-brand-accent/20 blur-3xl" aria-hidden="true" />

        <div className="container relative py-20">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="animate-fade-up text-center lg:text-left">
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft">
                <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Live · Cabuyao City Environmental System
              </span>
              <h1 className="mt-6 font-display text-4xl tracking-tight sm:text-5xl">
                Guard <span className="text-primary">Cabuyao&apos;s</span> Environment Together
              </h1>
              <p className="mt-3 text-sm font-medium text-primary">
                Environmental monitoring system for CENRO Cabuyao
              </p>
              <p className="mt-4 text-lg text-muted-foreground">
                Report environmental concerns, track wildlife sightings, and help CENRO protect
                all 18 barangays of Cabuyao City, from your phone or computer.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
                <Link to={fileReportHref} className={buttonVariants({ size: 'lg' })}>File a Report</Link>
                <Link to="/report-anonymous" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                  Report Anonymously
                </Link>
                <Link to="/map" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                  View Heat Map
                </Link>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Have a reference number?{' '}
                <Link to="/track" className="font-medium text-primary hover:underline">Track your report</Link>.
              </p>
            </div>

            <div className="hidden lg:block">
              <HeroPreview />
            </div>
          </div>

          {/* Stats */}
          <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
            {stats.map((s) => {
              const meta = STAT_META[s.label];
              return (
                <div key={s.label} className="rounded-xl border border-t-2 border-t-brand-accent bg-background p-6 text-center shadow-soft">
                  {meta && <IconChip icon={meta.icon} tone={meta.tone} size="sm" className="mx-auto" />}
                  <div className="mt-3 text-3xl font-bold tabular-nums text-primary">{s.value}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{s.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <LeafDivider />

      {/* How it works */}
      <section className="border-y bg-eco-band">
        <div className="container py-16">
          <h2 className="text-center font-display text-3xl">How it works</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-muted-foreground">
            From the first report to a resolved case in three simple steps.
          </p>
          <div className="mx-auto mt-10 grid max-w-4xl gap-8 sm:grid-cols-3">
            <Step n={1} icon={ClipboardList} tone="primary" title="Report" titleTl="Mag-ulat"
              desc="File a complaint, wildlife turnover, or service request with a photo and a map pin." />
            <Step n={2} icon={Search} tone="blue" title="Review" titleTl="Suriin"
              desc="CENRO staff verify the report, set a priority, and begin processing within the SLA." />
            <Step n={3} icon={CircleCheck} tone="forest" title="Resolve" titleTl="Lutasin"
              desc="You are notified at every status change until the case is resolved or released." />
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
                <span className={cn('mb-4 block h-1 w-12 rounded-full', STRIP[s.tone] || STRIP.primary)} />
                <IconChip icon={s.icon} tone={s.tone} size="lg" />
                <h3 className="mt-4 font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-background">
        <div className="container py-12">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <CenroLogo withWordmark withSubtitle />
              <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                A digital environmental governance platform for the City Environment and Natural
                Resources Office of Cabuyao City, Laguna.
              </p>
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Quick links</div>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><Link to="/map" className="transition-colors hover:text-foreground">Heat Map</Link></li>
                <li><Link to="/feed" className="transition-colors hover:text-foreground">Reports</Link></li>
                <li><Link to="/wildlife" className="transition-colors hover:text-foreground">Wildlife</Link></li>
                <li><Link to="/track" className="transition-colors hover:text-foreground">Track a Report</Link></li>
                <li><Link to="/privacy" className="transition-colors hover:text-foreground">Privacy Notice</Link></li>
              </ul>
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Office</div>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" aria-hidden="true" /> CENRO Cabuyao, Laguna
                </li>
                <li>18 barangays covered</li>
                <li>Pamantasan ng Cabuyao · BSIT Capstone</li>
              </ul>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t pt-6 text-sm text-muted-foreground sm:flex-row">
            <span>{new Date().getFullYear()} CENROWATCH · CENRO Cabuyao</span>
            <span className="flex items-center gap-1.5">
              Built for a greener Cabuyao
              <Sprout className="h-4 w-4 text-primary" aria-hidden="true" />
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
