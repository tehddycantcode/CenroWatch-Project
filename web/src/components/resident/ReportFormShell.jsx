import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

function SuccessCard({ trackingId }) {
  return (
    <div className="mx-auto max-w-xl">
      <Card className="space-y-4 p-8 text-center">
        <div className="text-4xl">✅</div>
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
      <div className="mb-6">
        <Link to="/resident/dashboard" className="text-sm font-medium text-primary hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-2 font-display text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      </div>

      <Card className="p-6">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
