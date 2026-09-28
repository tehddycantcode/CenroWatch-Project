import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { useCategories } from '../lib/useCategories';
import { isOtherCategory, withOtherDetail, OTHER_DETAIL_MAX, DESCRIPTION_MAX } from '../lib/otherCategory';
import { FORM_TL, COPY_TL } from '../lib/tagalog';
// Both of these hit PUBLIC endpoints and take no token, which is what lets this
// screen work signed out.
import useBarangays from '../lib/useBarangays';
import { colors, radius } from '../theme';
import { Field } from '../components/ReportFormShell';
import Select from '../components/Select';
import BarangayPicker from '../components/BarangayPicker';
import PhotoPicker from '../components/PhotoPicker';
import LocationField from '../components/LocationField';
import Checkbox from '../components/Checkbox';
import ErrorBanner from '../components/ErrorBanner';
import Button from '../components/Button';

// Whistleblower reporting with NO ACCOUNT, mirroring the web app's
// /report-anonymous. Reached from the sign-in screen, so it is available to
// someone who has not registered and to someone who will not.
//
// THE CHROME IS HAND-ROLLED RATHER THAN USING ReportFormShell, and that is not
// laziness: the shell renders ScreenHeader, which calls useResidentNav(), and
// that hook THROWS outside the signed-in navigator's provider. Making the hook
// optional would weaken a deliberate invariant for one screen. The web app
// hand-rolls its equivalent page for the same reason. `Field` is imported from
// the shell and is safe - it is a pure component, and the hook only runs when
// the shell's default export renders.
//
// Photo is optional here, unlike the signed-in form. That is the one real
// difference and it is deliberate: a whistleblower may have no safe way to
// photograph anything.
export default function AnonymousReportScreen({ onNavigate }) {
  const { complaintTypes, error: categoriesError } = useCategories();
  const barangays = useBarangays();

  const [form, setForm] = useState({ complaint_type: '', type_other: '', description: '', barangay_id: '' });
  const [location, setLocation] = useState({ latitude: null, longitude: null });
  const photoRef = useRef(null);
  const [consent, setConsent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const needsOther = isOtherCategory(form.complaint_type);

  // Changing the type clears anything typed under "Other", so switching back to
  // a normal category cannot submit a stale detail line.
  const setType = (v) => setForm((f) => ({ ...f, complaint_type: v, type_other: '' }));

  function validate() {
    const e = {};
    if (!form.complaint_type) e.complaint_type = 'Select a complaint type.';
    if (needsOther && !form.type_other.trim()) e.type_other = 'Describe the type of complaint.';
    if (!form.barangay_id) e.barangay_id = 'Select a barangay.';
    if (form.description.trim().length < 10) e.description = 'Describe the issue (at least 10 characters).';
    if (withOtherDetail(form.description.trim(), form.type_other).length > DESCRIPTION_MAX) {
      e.description = `Description is too long (limit ${DESCRIPTION_MAX} characters).`;
    }
    if (!consent) e.consent = 'Please acknowledge the privacy notice.';
    return e;
  }

  async function onSubmit() {
    setError('');
    const e = validate();
    setFieldErrors(e);
    if (Object.keys(e).length) return;

    const fd = new FormData();
    fd.append('complaint_type', form.complaint_type);
    // complaint_type is a foreign key, so the typed detail rides in the
    // description instead - as its first line. See lib/otherCategory.js.
    fd.append('description', withOtherDetail(form.description.trim(), form.type_other));
    fd.append('barangay_id', String(form.barangay_id));
    fd.append('consent', 'true');
    if (location.latitude != null) {
      fd.append('latitude', String(location.latitude));
      fd.append('longitude', String(location.longitude));
    }
    // Optional here. Third argument is the multipart filename: the API derives
    // the stored file's extension from it.
    if (photoRef.current) fd.append('photo', photoRef.current.file, photoRef.current.name);

    setSubmitting(true);
    try {
      // No token, deliberately - see api/client.js.
      const res = await api.complaints.createAnonymous(fd);
      setSuccess(res.data.complaint.tracking_id);
    } catch (err) {
      if (Array.isArray(err.errors)) {
        const m = {};
        for (const { field, message } of err.errors) m[field] = message;
        setFieldErrors((p) => ({ ...p, ...m }));
      }
      setError(err.message || 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.successWrap}>
          <Text style={styles.successTitle}>Anonymous report submitted</Text>
          <Text style={styles.successText}>
            We did not record your identity. Write this reference down before you leave this
            screen - it is the only way to check the report, and it shows the status only.
          </Text>
          <View style={styles.idPill}>
            <Text style={styles.idText}>{success}</Text>
          </View>
          <View style={{ width: '100%', gap: 12, marginTop: 8 }}>
            <Button title="Check its status" onPress={() => onNavigate('track-public')} />
            <Button title="Back to sign in" variant="outline" onPress={() => onNavigate('login')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* `padding` on both platforms: under Expo's default edge-to-edge the
          Android window does not reliably resize for the keyboard, so leaving
          the behavior undefined lets it cover the lower fields. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.header}>
            <Pressable onPress={() => onNavigate('login')} hitSlop={8} accessibilityLabel="Back to sign in">
              <Text style={styles.back}>{'‹'}</Text>
            </Pressable>
            <Text style={styles.title}>Report anonymously</Text>
          </View>
          <Text style={styles.subtitle}>No account needed. Your identity is never recorded.</Text>

          <View style={{ gap: 18, marginTop: 18 }}>
            <ErrorBanner message={error} />

            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>
                Because this report is anonymous, CENRO cannot contact you for clarification.
                Include as much detail as you safely can, and use the reference number you
                receive to check the status later.
              </Text>
              <Text style={styles.noticeTl}>{COPY_TL.anonymousHint}</Text>
            </View>

            {/* Select and BarangayPicker render their OWN label/hint/error, so
                they are used bare rather than inside <Field> - wrapping them
                would print the label twice. Same as ComplaintFormScreen. */}
            <Select
              label="Complaint type"
              hint={FORM_TL.complaint_type}
              options={complaintTypes}
              value={form.complaint_type}
              onChange={setType}
              placeholder="Select a complaint type"
              error={fieldErrors.complaint_type || categoriesError}
            />

            {needsOther ? (
              <Field label="Please specify" hint={FORM_TL.type_other} error={fieldErrors.type_other}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Dead fish in the creek"
                  placeholderTextColor={colors.placeholder}
                  maxLength={OTHER_DETAIL_MAX}
                  value={form.type_other}
                  onChangeText={set('type_other')}
                />
              </Field>
            ) : null}

            <BarangayPicker
              items={barangays}
              value={form.barangay_id}
              onChange={set('barangay_id')}
              hint={FORM_TL.barangay}
              error={fieldErrors.barangay_id}
            />

            <Field label="Description" hint={FORM_TL.description} error={fieldErrors.description}>
              <TextInput
                style={styles.textarea}
                placeholder="What happened? Avoid including your own name."
                placeholderTextColor={colors.placeholder}
                value={form.description}
                onChangeText={set('description')}
                multiline
                textAlignVertical="top"
              />
            </Field>

            <Field label="Location" hint="Optional: pin where it happened">
              <LocationField value={location} onChange={setLocation} />
            </Field>

            <Field label="Photo" hint="Optional. Avoid photos that could identify you - they can also carry the location and the phone they were taken with.">
              <PhotoPicker onChange={(f) => { photoRef.current = f; }} />
            </Field>

            <View style={styles.consentBox}>
              <Checkbox
                checked={consent}
                onChange={setConsent}
                accessibilityLabel="I understand this report is submitted anonymously"
              >
                I understand this report is submitted anonymously under CENRO{'’'}s
                whistleblower policy, that my identity is not collected, and that the details I
                provide may be used to investigate the concern (R.A. 10173 compliant).
              </Checkbox>
              {fieldErrors.consent ? <Text style={styles.consentErr}>{fieldErrors.consent}</Text> : null}
            </View>

            <Button title="Submit anonymously" onPress={onSubmit} loading={submitting} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 16, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { fontSize: 30, color: colors.text, fontWeight: '700', marginTop: -4 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 4 },
  noticeBox: { backgroundColor: colors.tint, borderRadius: radius.md, padding: 12, gap: 6 },
  noticeText: { fontSize: 13, color: colors.text, lineHeight: 19 },
  noticeTl: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
  },
  textarea: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  consentBox: { gap: 6 },
  consentErr: { fontSize: 12, color: colors.danger, fontWeight: '500' },
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  successTitle: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  successText: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 21 },
  idPill: {
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginVertical: 4,
  },
  idText: { color: colors.white, fontSize: 16, fontWeight: '800', letterSpacing: 1 },
});
