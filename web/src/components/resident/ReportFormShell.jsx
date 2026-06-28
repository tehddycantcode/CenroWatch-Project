import { Link } from 'react-router-dom';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { IconChip } from '@/components/ui/icon-chip';

function SuccessCard({ trackingId }) {
  return (
    <div className="mx-auto max-w-xl">
      <Card className="space-y-4 p-8 text-center">
        <div className="flex justify-center">
          <IconChip icon={CircleCheck} tone="forest" size="lg" />
        </div>
        <h2 className="font-display text-2xl">Report submitted</h2>
        <p className="text-muted-foreground">Your tracking number is</p>
        <div className="text-2xl font-bold tracking-wide text-primary">{trackingId}</div>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link to={`/resident/track/${trackingId}`}>
            <Button>Track this report</Button>
          </Link>
          <Link to="/resident/dashboard">
            <Button variant="outline">Back to dashboard</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default function ReportFormShell({
  title,
  subtitle,
  icon,
  tone = 'primary',
  onSubmit,
  submitting,
  error,
  success,
  submitLabel = 'Submit',
  children,
}) {
  if (success) return <SuccessCard trackingId={success} />;

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/resident/dashboard" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Dashboard
      </Link>

      <Card className="mt-4 overflow-hidden">
        {/* Header strip */}
        <div className="flex items-center gap-4 border-b bg-eco-band p-6">
          {icon && <IconChip icon={icon} tone={tone} size="lg" />}
          <div>
            <h1 className="font-display text-2xl">{title}</h1>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 p-6" noValidate>
          {error && <Alert>{error}</Alert>}
          {children}
          <Button type="submit" className="w-full" loading={submitting}>
            {submitLabel}
          </Button>
        </form>
      </Card>
    </div>
  );
}
