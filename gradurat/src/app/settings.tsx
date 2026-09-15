import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { colors, type } from '@/constants/theme';
import { deleteAccount, loadSettings, updateSettings } from '@/lib/api';
import { signOut } from '@/lib/auth';

export default function SettingsScreen() {
  useLocalSearchParams<{ role?: string }>();
  const [preferences, setPreferences] = useState<Record<string, unknown>>({});
  const [theme, setTheme] = useState('dark');
  const [state, setState] = useState<'loading' | 'content' | 'error'>('loading');
  const [message, setMessage] = useState('Loading settings...');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadSettings().then((result) => {
      setTheme(result.theme);
      setPreferences(result.preferences || {});
      setState('content');
    }).catch((error) => {
      setMessage(error instanceof Error ? error.message : 'Could not load settings.');
      setState('error');
    });
  }, []);

  const toggle = (key: string) => {
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    void updateSettings({ [key]: next[key] }).catch((error) => setMessage(error instanceof Error ? error.message : 'Could not save setting.'));
  };

  const removeAccount = () => Alert.alert('Delete account?', 'This permanently removes your profile and account data.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      setBusy(true);
      try {
        await deleteAccount();
        await signOut();
        router.replace('/');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not delete account.');
      } finally {
        setBusy(false);
      }
    } },
  ]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>Back to dashboard</Text></Pressable>
        <Text style={styles.badge}>ACCOUNT</Text>
        <Text style={styles.title}>Settings.</Text>
        <Text style={styles.intro}>Manage privacy, matching, and your account preferences.</Text>
        {state === 'loading' && <View style={styles.center}><ActivityIndicator color={colors.blue} /><Text style={styles.muted}>{message}</Text></View>}
        {state === 'error' && <Text style={styles.error}>{message}</Text>}
        {state === 'content' && <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Visibility and matching</Text>
            {(['profileDiscoverable', 'appearInFYP', 'personalizedMatching', 'aiMatching'] as const).map((key) => <SettingRow key={key} label={labelFor(key)} value={Boolean(preferences[key])} onChange={() => toggle(key)} />)}
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Notifications</Text>
            {(['notifyMatches', 'notifyOpportunities', 'notifyConnections'] as const).map((key) => <SettingRow key={key} label={labelFor(key)} value={Boolean(preferences[key])} onChange={() => toggle(key)} />)}
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Appearance</Text>
            <View style={styles.row}><Text style={styles.rowLabel}>Theme</Text><Text style={styles.value}>{theme}</Text></View>
          </View>
          <Pressable style={styles.dangerButton} onPress={removeAccount} disabled={busy}><Text style={styles.dangerText}>{busy ? 'Working...' : 'Delete account'}</Text></Pressable>
          {!!message && <Text style={styles.error}>{message}</Text>}
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Switch value={value} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.blueDark }} thumbColor={value ? colors.blue : colors.subtle} /></View>;
}

const labelFor = (key: string) => key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/^./, (letter) => letter.toUpperCase());

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { flexGrow: 1, padding: 24, paddingTop: 35, gap: 17, backgroundColor: colors.background },
  back: { color: '#7daeff', fontWeight: '700' },
  badge: { color: '#7daeff', fontSize: 12, fontWeight: '800', letterSpacing: 1.4, marginTop: 15 },
  title: { ...type.title, color: colors.text },
  intro: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  card: { padding: 18, gap: 5, borderColor: colors.border, borderWidth: 1, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 8 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopColor: colors.border, borderTopWidth: 1 },
  rowLabel: { color: colors.text, fontSize: 14, flex: 1 },
  value: { color: colors.muted, textTransform: 'capitalize' },
  center: { alignItems: 'center', gap: 12, paddingVertical: 35 },
  muted: { color: colors.muted, lineHeight: 20 },
  error: { color: colors.danger, lineHeight: 20 },
  dangerButton: { borderColor: colors.danger, borderWidth: 1, borderRadius: 8, alignItems: 'center', paddingVertical: 14 },
  dangerText: { color: colors.danger, fontWeight: '800' },
});
