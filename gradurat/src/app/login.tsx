import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, type } from '@/constants/theme';
import { requestPasswordReset, signIn } from '@/lib/auth';

export default function LoginScreen() {
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
      router.replace('/dashboard?role=student');
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
      setMessage('Check your email for a password reset link.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send the reset email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.back}>Back</Text>
        </Pressable>
        <Text style={styles.logo}><Text style={styles.blue}>G</Text>radu<Text style={styles.blue}>R</Text>at</Text>
        <Text style={styles.badge}>WELCOME BACK</Text>
        <Text style={styles.title}>Sign in to your <Text style={styles.blue}>future.</Text></Text>
        <Text style={styles.intro}>Continue discovering opportunities and managing your GraduRat profile.</Text>
        <View style={styles.form}>
          <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
          {!!message && <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text>}
          <Pressable style={styles.primary} onPress={submit} disabled={busy} accessibilityRole="button">
            {busy ? <ActivityIndicator color={colors.text} /> : <Text style={styles.primaryText}>Sign in</Text>}
          </Pressable>
          <Pressable onPress={resetPassword} disabled={busy} accessibilityRole="button">
            <Text style={styles.link}>Forgot your password?</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => router.push('/register')} accessibilityRole="button">
          <Text style={styles.muted}>New to GraduRat? <Text style={styles.link}>Create an account</Text></Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, secureTextEntry = false, keyboardType = 'default', autoCapitalize = 'sentences' }: { label: string; value: string; onChangeText: (value: string) => void; secureTextEntry?: boolean; keyboardType?: 'default' | 'email-address'; autoCapitalize?: 'none' | 'sentences' }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor={colors.subtle}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1, padding: 24, paddingTop: 35, justifyContent: 'center', gap: 18 },
  back: { color: '#7daeff', fontWeight: '700' },
  logo: { color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 12 },
  blue: { color: colors.blue },
  badge: { color: '#7daeff', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginTop: 18 },
  title: { ...type.title, color: colors.text },
  intro: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  form: { gap: 15, marginTop: 10 },
  field: { gap: 7 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  input: { color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 8, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15 },
  primary: { alignItems: 'center', backgroundColor: colors.blue, borderRadius: 8, paddingVertical: 15 },
  primaryText: { color: colors.text, fontWeight: '800', fontSize: 15 },
  link: { color: '#7daeff', fontWeight: '700', textAlign: 'center' },
  muted: { color: colors.muted, textAlign: 'center', lineHeight: 21 },
  message: { color: colors.orange, lineHeight: 20 },
});
