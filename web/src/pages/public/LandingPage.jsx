import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { gisApi } from '@/lib/api';

const services = [
  {
    title: 'Environmental Complaints',
    desc: 'Report illegal dumping, open burning, noise, and other concerns with photo evidence and a map pin.',
  },
  {
    title: 'Wildlife Turnover',
    desc: 'Report sightings or turn over rescued wildlife. Endangered species are flagged for priority review.',
  },
  {
    title: 'Service Requests',
    desc: 'Request seedlings, garbage hauling, creek cleaning, or environmental education from CENRO.',
  },
];

export default function LandingPage() {
  const [stats, setStats] = useState([
    { label: 'Total Reports', value: '—' },
    { label: 'Resolved', value: '—' },
    { label: 'Wildlife Cases', value: '—' },
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
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              CW
            </div>
            <span className="text-lg font-bold tracking-tight">CENROWATCH</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground sm:flex">
            <Link to="/map" className="hover:text-foreground">Live Map</Link>
            <Link to="/feed" className="hover:text-foreground">Reports</Link>
            <Link to="/wildlife" className="hover:text-foreground">Wildlife</Link>
            <Link to="/login" className="hover:text-foreground">Login</Link>
          </nav>
          <Link
            to="/register"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Report Now
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="container py-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            Live · Cabuyao City Environmental System
          </span>
          <h1 className="mt-6 font-display text-4xl tracking-tight sm:text-5xl">
            Guard <span className="text-primary">Cabuyao&apos;s</span> Environment Together
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Report environmental concerns, track wildlife sightings, and help CENRO protect
            all 18 barangays of Cabuyao City — from your phone or computer.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/register"
              className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              File a Report
            </Link>
            <Link
              to="/report-anonymous"
              className="rounded-md border px-6 py-3 text-sm font-semibold hover:bg-accent"
            >
              Report Anonymously
            </Link>
            <Link
              to="/map"
              className="rounded-md border px-6 py-3 text-sm font-semibold hover:bg-accent"
            >
              View Live Map
            </Link>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Have a reference number?{' '}
            <Link to="/track" className="font-medium text-primary hover:underline">Track your report</Link>.
          </p>
        </div>

        {/* Stats */}
        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-background p-6 text-center">
              <div className="text-3xl font-bold text-primary">{s.value}</div>
              <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section className="border-t bg-muted/30">
        <div className="container py-16">
          <h2 className="text-center font-display text-3xl">What you can do</h2>
          <div className="mx-auto mt-10 grid max-w-5xl gap-6 sm:grid-cols-3">
            {services.map((s) => (
              <div key={s.title} className="rounded-xl border bg-background p-6">
                <h3 className="font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="container flex flex-col items-center justify-between gap-2 py-8 text-sm text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} CENROWATCH · CENRO Cabuyao</span>
          <span>Pamantasan ng Cabuyao — BSIT Capstone</span>
        </div>
      </footer>
    </div>
  );
}
