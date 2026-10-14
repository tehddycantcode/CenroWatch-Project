import { useEffect, useState } from 'react';
import { Star, CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

// How the resident rates the service once their case is closed.
//
// WHETHER IT SHOWS AT ALL IS THE SERVER'S DECISION. The endpoint answers
// can_submit, which is true only when the caller owns the case, the case is in
// a terminal state, and no feedback exists yet. Re-deriving any of that here
// would mean two places that can disagree - and the one in the browser is the
// one that would quietly drift.
//
// THREE SCORES, NOT ONE. "It was slow but the staff were kind" is a real answer
// and a single star rating destroys it. The comment stays optional: forcing
// prose is how a dataset fills up with "ok".

const QUESTIONS = [
  { key: 'rating_staff', label: 'Staff response', hint: 'How CENRO staff treated you.' },
  { key: 'rating_speed', label: 'Speed', hint: 'How quickly it was dealt with.' },
  { key: 'rating_overall', label: 'Overall experience', hint: 'Everything taken together.' },
];

const SCALE = ['', 'Very poor', 'Poor', 'Fair', 'Good', 'Very good'];

function Stars({ value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          // A star alone is unreadable to a screen reader and to anyone who
          // cannot see colour, so each carries its meaning in words.
          aria-label={`${n} of 5 - ${SCALE[n]}`}
          title={SCALE[n]}
          onClick={() => onChange(n)}
          className="rounded p-0.5 transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <Star
            className={`h-6 w-6 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`}
            aria-hidden="true"
          />
        </button>
      ))}
      <span className="ml-2 min-w-[5.5rem] text-xs text-muted-foreground">{SCALE[value] || ''}</span>
    </div>
  );
}

export default function FeedbackForm({ api, reference }) {
  const [state, setState] = useState(null); // { can_submit, submitted, feedback }
  const [scores, setScores] = useState({ rating_staff: 0, rating_speed: 0, rating_overall: 0 });
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get(reference)
      .then((r) => { if (!cancelled) setState(r.data); })
      // Silent: feedback is an extra, and a failed probe must not put an error
      // banner on a page whose actual job is showing the report.
      .catch(() => { if (!cancelled) setState(null); });
    return () => { cancelled = true; };
  }, [api, reference]);

  if (!state) return null;

  if (state.submitted) {
    return (
      <div className="mt-6 flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-foreground">Thank you for your feedback.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You rated this {state.feedback?.rating_overall} out of 5 overall. CENRO uses this to
            see where the service is slow.
          </p>
        </div>
      </div>
    );
  }

  if (!state.can_submit) return null;

  const complete = QUESTIONS.every((q) => scores[q.key] > 0);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!complete) {
      setError('Please give a rating for all three.');
      return;
    }
    setBusy(true);
    try {
      await api.submit(reference, { ...scores, comment: comment.trim() || undefined });
      setState({ submitted: true, can_submit: false, feedback: { ...scores } });
    } catch (err) {
      setError(err.message || 'Could not send your feedback. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 rounded-lg border bg-muted/30 p-5">
      <h3 className="font-display text-lg">How did we do?</h3>
      {/* No promise about what happens next. Nothing in the system replies to
          feedback, so saying "we will get back to you" would be the failure
          CLAUDE.md records across five separate confirmation dialogs. */}
      <p className="mt-1 text-sm text-muted-foreground">
        This report is closed. Your rating helps CENRO Cabuyao see where the service is slow.
        It takes a few seconds and you can only leave it once.
      </p>

      <div className="mt-4 space-y-4">
        {QUESTIONS.map((q) => (
          <div key={q.key} className="sm:flex sm:items-center sm:justify-between sm:gap-4">
            <div>
              <div className="text-sm font-medium text-foreground">{q.label}</div>
              <div className="text-xs text-muted-foreground">{q.hint}</div>
            </div>
            <div className="mt-1.5 sm:mt-0">
              <Stars
                label={q.label}
                value={scores[q.key]}
                onChange={(n) => setScores((s) => ({ ...s, [q.key]: n }))}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <label htmlFor="feedback-comment" className="text-sm font-medium text-foreground">
          Anything else? <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="feedback-comment"
          rows={3}
          maxLength={2000}
          className="mt-1.5"
          placeholder="What went well, or what could be better?"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <Button type="submit" className="mt-4" loading={busy} disabled={!complete}>
        Send feedback
      </Button>
    </form>
  );
}
