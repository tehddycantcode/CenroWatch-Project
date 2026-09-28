import { Link } from 'react-router-dom';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { IconChip } from '@/components/ui/icon-chip';

function SuccessCard({ trackingId, anonymous }) {
  // WHERE THIS LINKS IS NOT COSMETIC. /resident/track/:id calls
  // getMyComplaintByTracking, which throws 403 when complaint.user_id !== the
  // caller - and an anonymous report has user_id NULL, so it 403s for everyone
  // including the person who just filed it. Sending them there would make the
  // last screen of a successful submission a permission error. The public
  // lookup takes the same reference and needs no account.
  const trackTo = anonymous ? `/track?id=${trackingId}` : `/resident/track/${trackingId}`;

  return (
    <div className="mx-auto max-w-xl">
      <Card className="space-y-4 p-8 text-center">
        <div className="flex justify-center">
          <IconChip icon={CircleCheck} tone="forest" size="lg" />
        </div>
        <h2 className="font-display text-2xl">
          {anonymous ? 'Anonymous report submitted' : 'Report submitted'}
        </h2>
        <p className="text-muted-foreground">
          {anonymous ? 'Write this reference down before you leave this page.' : 'Your tracking number is'}
        </p>
        <div className="text-2xl font-bold tracking-wide text-primary">{trackingId}</div>
        {anonymous && (
          // Deliberately specific about what tracking will and will not show.
          // getPublicComplaintStatus returns the status, type, barangay and
          // dates only - no photo and no status history - so promising "track
          // this report" without qualification would overstate it.
          <p className="text-sm text-muted-foreground">
            It is the only way to check this report, and it shows the status only, not the
            photo or CENRO&apos;s notes. This report is not in My Reports and we cannot email
            you about it.
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link to={trackTo}>
            <Button>{anonymous ? 'Check its status' : 'Track this report'}</Button>
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
  // Set by the complaint form when the resident ticked "file anonymously".
  // Only affects the success screen; the submission itself is the caller's job.
  anonymous = false,
  children,
}) {
  if (success) return <SuccessCard trackingId={success} anonymous={anonymous} />;

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
