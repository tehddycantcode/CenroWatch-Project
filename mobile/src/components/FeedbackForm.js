import { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import Icon from './Icon';
import Button from './Button';
import { colors, radius } from '../theme';

// How the resident rates the service once their case is closed.
//
// WHETHER IT SHOWS AT ALL IS THE SERVER'S DECISION. The endpoint answers
// can_submit, true only when the caller owns the case, the case is in a terminal
// state, and no feedback exists yet. Re-deriving any of that here would mean two
// places that can disagree, and the one on the phone is the one that drifts -
// an installed APK keeps its copy of the rule for as long as somebody goes
// without updating.
//
// THREE SCORES, NOT ONE. "It was slow but the staff were kind" is a real answer
// and a single star rating destroys it. The comment stays optional.
//
// Keep in step with web/src/components/resident/FeedbackForm.jsx - the two apps
// cannot share a component.

const QUESTIONS = [
  { key: 'rating_staff', label: 'Staff response', hint: 'How CENRO staff treated you.' },
  { key: 'rating_speed', label: 'Speed', hint: 'How quickly it was dealt with.' },
  { key: 'rating_overall', label: 'Overall experience', hint: 'Everything taken together.' },
];

const SCALE = ['', 'Very poor', 'Poor', 'Fair', 'Good', 'Very good'];

function Stars({ value, onChange, label }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === n }}
          // A star alone says nothing to a screen reader, so each carries its
          // meaning in words.
          accessibilityLabel={`${label}: ${n} of 5 - ${SCALE[n]}`}
          hitSlop={6}
          style={{ padding: 2 }}
        >
          <Icon
            name={n <= value ? 'star' : 'star-outline'}
            size={26}
            color={n <= value ? '#f59e0b' : colors.border}
          />
        </Pressable>
      ))}
      <Text style={styles.scaleText}>{SCALE[value] || ''}</Text>
    </View>
  );
}

export default function FeedbackForm({ api, reference, token }) {
  const [state, setState] = useState(null);
  const [scores, setScores] = useState({ rating_staff: 0, rating_speed: 0, rating_overall: 0 });
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get(reference, token)
      .then((r) => { if (!cancelled) setState(r.data); })
      // Silent: feedback is an extra, and a failed probe must not put an error
      // on a screen whose actual job is showing the report.
      .catch(() => { if (!cancelled) setState(null); });
    return () => { cancelled = true; };
  }, [api, reference, token]);

  if (!state) return null;

  if (state.submitted) {
    return (
      <View style={styles.thanks}>
        <View style={styles.thanksHead}>
          <Icon name="checkmark-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.thanksTitle}>Thank you for your feedback.</Text>
        </View>
        <Text style={styles.thanksBody}>
          You rated this {state.feedback?.rating_overall} out of 5 overall. CENRO uses this to see
          where the service is slow.
        </Text>
      </View>
    );
  }

  if (!state.can_submit) return null;

  const complete = QUESTIONS.every((q) => scores[q.key] > 0);

  async function submit() {
    setError('');
    if (!complete) {
      setError('Please give a rating for all three.');
      return;
    }
    setBusy(true);
    try {
      await api.submit(reference, token, { ...scores, comment: comment.trim() || undefined });
      setState({ submitted: true, can_submit: false, feedback: { ...scores } });
    } catch (e) {
      setError(e.message || 'Could not send your feedback. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>How did we do?</Text>
      {/* No promise about what happens next: nothing in the system replies to
          feedback, so "we will get back to you" would be a lie. */}
      <Text style={styles.intro}>
        This report is closed. Your rating helps CENRO Cabuyao see where the service is slow. You
        can only leave it once.
      </Text>

      {QUESTIONS.map((q) => (
        <View key={q.key} style={styles.question}>
          <Text style={styles.qLabel}>{q.label}</Text>
          <Text style={styles.qHint}>{q.hint}</Text>
          <Stars label={q.label} value={scores[q.key]} onChange={(n) => setScores((s) => ({ ...s, [q.key]: n }))} />
        </View>
      ))}

      <Text style={styles.qLabel}>
        Anything else? <Text style={styles.qHint}>(optional)</Text>
      </Text>
      <TextInput
        style={styles.input}
        placeholder="What went well, or what could be better?"
        placeholderTextColor={colors.muted}
        value={comment}
        onChangeText={setComment}
        maxLength={2000}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        title={busy ? 'Sending...' : 'Send feedback'}
        onPress={submit}
        disabled={busy || !complete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginTop: 16,
    gap: 10,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  intro: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  question: { gap: 2 },
  qLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  qHint: { fontSize: 12, color: colors.muted },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  scaleText: { marginLeft: 8, fontSize: 12, color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 10,
    fontSize: 14,
    color: colors.text,
    minHeight: 76,
  },
  error: { fontSize: 13, color: colors.danger },

  thanks: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    padding: 14,
    marginTop: 16,
    gap: 6,
  },
  thanksHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  thanksTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text },
  thanksBody: { fontSize: 13, color: colors.muted, lineHeight: 19 },
});
