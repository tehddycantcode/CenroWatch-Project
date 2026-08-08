import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { IconChip } from '@/components/ui/icon-chip';
import PublicHeader from '@/components/public/PublicHeader';
import { PrivacyNoticeBody } from '@/components/PrivacyNotice';
import { PRIVACY_SUMMARY } from '@/lib/privacy';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <section className="border-b bg-eco-soft">
        <div className="container py-12">
          <div className="mx-auto max-w-3xl text-center">
            <div className="flex justify-center">
              <IconChip icon={ShieldCheck} tone="primary" size="lg" />
            </div>
            <h1 className="mt-4 font-display text-3xl">Privacy Notice</h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">{PRIVACY_SUMMARY}</p>
          </div>
        </div>
      </section>

      <section className="container py-12">
        <Card className="mx-auto max-w-3xl p-6 sm:p-8">
          <PrivacyNoticeBody />
        </Card>

        <p className="mx-auto mt-6 max-w-3xl text-center text-sm text-muted-foreground">
          Prefer not to give your details?{' '}
          <Link to="/report-anonymous" className="font-semibold text-primary hover:underline">
            Report anonymously
          </Link>{' '}
          instead. No identity is collected.
        </p>
      </section>
    </div>
  );
}
