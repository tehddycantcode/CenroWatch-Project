import { View, Text, StyleSheet } from 'react-native';
import Icon from './Icon';
import { FORM_TL } from '../lib/tagalog';
import { radius } from '../theme';

// What a resident is told to expect before sending a service request. Keep the
// three points in step with the web twin,
// web/src/components/resident/RequestDisclaimer.jsx — the two apps cannot share
// a file. See it for why the copy states expectations ("most", "usually")
// rather than guarantees: a flat promise is a feature commitment (CLAUDE.md).
//
// Exported so the confirmation dialog can reuse the exact wording. Mobile's
// ConfirmDialog renders its body as a single string, so there it is joined into
// text rather than rendered as this box.
export const DISCLAIMER_POINTS = [
  ['Payment', 'Some requests may require payment. Any fee depends on the volume and distance, and is confirmed with you before the service is scheduled.'],
  ['Processing time', 'Most requests are completed within 3-5 working days after approval, depending on the service.'],
  ['Expected reply', 'Expect an initial response within 24-48 hours of submitting.'],
];

export default function RequestDisclaimer() {
  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <Icon name="warning-outline" size={16} color="#b45309" />
        <Text style={styles.title}>Please read before submitting</Text>
      </View>
      {DISCLAIMER_POINTS.map(([term, desc]) => (
        <Text key={term} style={styles.point}>
          <Text style={styles.term}>{term}: </Text>
          {desc}
        </Text>
      ))}
      <Text style={styles.tl}>{FORM_TL.request_disclaimer}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 5,
    borderWidth: 1,
    borderColor: '#fcd34d',
    backgroundColor: '#fffbeb',
    borderRadius: radius.md,
    padding: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 13, fontWeight: '700', color: '#78350f' },
  point: { fontSize: 12.5, color: '#78350f', lineHeight: 18 },
  term: { fontWeight: '700' },
  tl: { fontSize: 12, color: '#92400e', lineHeight: 17, marginTop: 2 },
});
