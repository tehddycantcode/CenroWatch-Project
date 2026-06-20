import { Spinner } from '@/components/ui/icons';

export default function FullScreenLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <Spinner className="h-8 w-8 text-primary" />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}
