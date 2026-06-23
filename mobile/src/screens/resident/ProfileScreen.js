import { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator, StyleSheet, SafeAreaView } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import useBarangays from '../../lib/useBarangays';
import { colors, radius } from '../../theme';
import BarangayPicker from '../../components/BarangayPicker';

function Btn({ label, onPress, loading, disabled }) {
  return (
    <Pressable
      style={[styles.btn, (loading || disabled) && { opacity: 0.6 }]}
      onPress={loading || disabled ? undefined : onPress}
    >
      {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.btnText}>{label}</Text>}
    </Pressable>
  );
}

function ProfileSection() {
  const { user, token, updateUser } = useAuth();
  const barangays = useBarangays();
  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    contact_number: user?.contact_number || '',
    barangay_id: user?.barangay_id ? String(user.barangay_id) : '',
  });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function onSave() {
    setMsg('');
    setError('');
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First and last name are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.updateProfile({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        contact_number: form.contact_number.trim(),
        barangay_id: form.barangay_id === '' ? '' : Number(form.barangay_id),
      }, token);
      updateUser(res.data.user);
      setMsg('Profile updated.');
    } catch (e) {
      setError(e.message || 'Could not update your profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Profile</Text>
      <Text style={styles.cardHint}>Your email ({user?.email}) is used to sign in and can&apos;t be changed here.</Text>

      <Field label="First name">
        <TextInput style={styles.input} value={form.first_name} onChangeText={set('first_name')} placeholderTextColor={colors.placeholder} />
      </Field>
      <Field label="Last name">
        <TextInput style={styles.input} value={form.last_name} onChangeText={set('last_name')} placeholderTextColor={colors.placeholder} />
      </Field>
      <Field label="Contact number (optional)">
        <TextInput style={styles.input} value={form.contact_number} onChangeText={set('contact_number')} keyboardType="phone-pad" placeholderTextColor={colors.placeholder} />
      </Field>
      <BarangayPicker items={barangays} value={form.barangay_id} onChange={set('barangay_id')} />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {msg ? <Text style={styles.success}>{msg}</Text> : null}
      <Btn label="Save changes" onPress={onSave} loading={saving} />
    </View>
  );
}

function PasswordSection() {
  const { token } = useAuth();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function onSave() {
    setMsg('');
    setError('');
    if (form.new_password.length < 8 || !/[A-Za-z]/.test(form.new_password) || !/[0-9]/.test(form.new_password)) {
      setError('New password must be at least 8 characters and include a letter and a number.');
      return;
    }
    if (form.new_password !== form.confirm) {
      setError('New passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await api.changePassword({ current_password: form.current_password, new_password: form.new_password }, token);
      setForm({ current_password: '', new_password: '', confirm: '' });
      setMsg('Password changed.');
    } catch (e) {
      setError(e.message || 'Could not change your password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Change password</Text>
      <Field label="Current password">
        <TextInput style={styles.input} value={form.current_password} onChangeText={set('current_password')} secureTextEntry placeholderTextColor={colors.placeholder} />
      </Field>
      <Field label="New password" hint="≥ 8 chars, a letter and a number">
        <TextInput style={styles.input} value={form.new_password} onChangeText={set('new_password')} secureTextEntry placeholderTextColor={colors.placeholder} />
      </Field>
      <Field label="Confirm new password">
        <TextInput style={styles.input} value={form.confirm} onChangeText={set('confirm')} secureTextEntry placeholderTextColor={colors.placeholder} />
      </Field>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {msg ? <Text style={styles.success}>{msg}</Text> : null}
      <Btn label="Update password" onPress={onSave} loading={saving} />
    </View>
  );
}

function Field({ label, hint, children }) {
  return (
    <View style={{ gap: 6, marginTop: 14 }}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

export default function ProfileScreen() {
  const { logout } = useAuth();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Account</Text>
        <Pressable onPress={logout} hitSlop={8}>
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ProfileSection />
        <PasswordSection />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.forest,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  headerTitle: { color: colors.white, fontSize: 18, fontWeight: '800' },
  logout: { color: colors.light, fontSize: 13, fontWeight: '700' },

  scroll: { padding: 20, paddingBottom: 32, gap: 16 },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  cardHint: { fontSize: 13, color: colors.muted, marginTop: 4 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.text },
  fieldHint: { fontSize: 12, color: colors.muted },
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
  error: { fontSize: 13, color: colors.danger, marginTop: 12, fontWeight: '500' },
  success: { fontSize: 13, color: colors.primary, marginTop: 12, fontWeight: '600' },
  btn: {
    marginTop: 16,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
});
