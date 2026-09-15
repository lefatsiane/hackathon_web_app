import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import { loadCurrentUser } from '@/lib/api';
import { requestPasswordReset, signIn } from '@/lib/auth';
import { clearProfileId, saveActiveProfileRole, saveProfileId } from '@/lib/storage';

export default function LoginScreen() {
  const { colors } = useTheme();
  const styles = { ...makeStyles(colors), back: { display: 'none' as const } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setMessage('');
    try {
      const { error } = await signIn(email.trim(), password);
      if (error) throw error;
      const profile = await loadCurrentUser();
      if (profile.student) {
        await saveProfileId('student', profile.student.id);
        await clearProfileId('employer');
        await saveActiveProfileRole('student');
      }
      if (profile.employer) {
        await saveProfileId('employer', profile.employer.id);
        await clearProfileId('student');
        await saveActiveProfileRole('employer');
      }
      router.replace(`/(tabs)/dashboard?role=${profile.employer ? 'employer' : 'student'}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!email.trim()) {
      setMessage('Enter your email address first.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const { error } = await requestPasswordReset(email.trim());
      if (error) throw error;
      setMessage('Check your email for password reset instructions.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send reset email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.badge}>WELCOME BACK</Text>
        <Text style={styles.title}>Sign in to <Text style={styles.blue}>GraduRat.</Text></Text>
        <Text style={styles.intro}>Continue building your future with your saved profile, matches, and opportunities.</Text>
        <View style={styles.card}>
          <Field colors={colors} styles={styles} label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <Field colors={colors} styles={styles} label="Password" value={password} onChangeText={setPassword} secureTextEntry />
          {!!message && <Text style={styles.message}>{message}</Text>}
          <Pressable style={styles.primary} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.text} /> : <Text style={styles.primaryText}>Sign in</Text>}
          </Pressable>
          <Pressable onPress={resetPassword} disabled={busy}>
            <Text style={styles.link}>Forgot password?</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => router.push('/register')}>
          <Text style={styles.footer}>New to GraduRat? <Text style={styles.link}>Create an account</Text></Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ colors, styles, label, value, onChangeText, secureTextEntry = false, keyboardType = 'default', autoCapitalize = 'sentences' }: { colors: ReturnType<typeof useTheme>['colors']; styles: ReturnType<typeof makeStyles>; label: string; value: string; onChangeText: (value: string) => void; secureTextEntry?: boolean; keyboardType?: 'default' | 'email-address'; autoCapitalize?: 'none' | 'sentences' }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} style={styles.input} value={value} onChangeText={onChangeText} placeholder={label} placeholderTextColor={colors.subtle} secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize={autoCapitalize} />
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { flexGrow: 1, padding: 24, gap: 18, justifyContent: 'center' },
  back: { color: colors.muted, fontWeight: '700', marginBottom: 12 },
  badge: { color: '#7daeff', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '800', color: colors.text },
  blue: { color: colors.blue },
  intro: { color: colors.muted, fontSize: 15, lineHeight: 24, marginBottom: 6 },
  card: { padding: 20, gap: 16, borderColor: colors.border, borderWidth: 1, borderRadius: 14, backgroundColor: colors.surfaceRaised },
  field: { gap: 7 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  input: { color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 8, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  primary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 14 },
  primaryText: { color: colors.text, fontWeight: '800' },
  link: { color: '#7daeff', fontWeight: '700', textAlign: 'center' },
  message: { color: colors.danger, lineHeight: 20 },
  footer: { color: colors.muted, textAlign: 'center' },
});
