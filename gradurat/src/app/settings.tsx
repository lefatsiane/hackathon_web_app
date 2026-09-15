import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { deleteAccount, exportAccountData, loadSettings, saveSettings } from '@/lib/api';
import { clearSession, logoutAllDevices, requestPasswordReset, updateEmail } from '@/lib/auth';
import { clearActiveProfileRole, clearProfileId } from '@/lib/storage';
import { ThemeMode, useTheme } from '@/lib/theme';

type Preferences = Record<string, unknown>;
type Form = { email: string; phone: string; companyName: string; companyIndustry: string; theme: ThemeMode; preferences: Preferences };
const preferenceDefaults: Preferences = { profileDiscoverable: false, showPhoto: false, showInterests: false, cvVisibility: 'connection', allowCVDownload: false, workEnvironment: '', employmentPreference: '', appearInFYP: false, personalizedMatching: false, notifyMatches: false, notifyOpportunities: false, notifyConnections: false, aiMatching: false, candidateRecommendations: false };
const settingsGroups = [
  ['Profile & visibility', [['profileDiscoverable', 'Profile discoverability'], ['showPhoto', 'Show profile photo'], ['showInterests', 'Show interests']]],
  ['CV & privacy', [['cvVisibility', 'CV visibility'], ['allowCVDownload', 'Allow CV downloads']]],
  ['Career preferences', [['workEnvironment', 'Preferred work environment'], ['employmentPreference', 'Employment type']]],
  ['FYP preferences', [['appearInFYP', 'Appear in Find Your People'], ['personalizedMatching', 'Personalized matching']]],
  ['Notifications', [['notifyMatches', 'New matches'], ['notifyOpportunities', 'New opportunities'], ['notifyConnections', 'Connections']]],
] as const;

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const styles = { ...makeStyles(colors), back: { display: 'none' as const } };
  const [form, setForm] = useState<Form>({ email: '', phone: '', companyName: '', companyIndustry: '', theme: mode, preferences: preferenceDefaults });
  const [role, setRole] = useState<'student' | 'employer'>('student');
  const [status, setStatus] = useState('Loading settings...');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadSettings().then((result) => {
      const profile = result.student || result.employer;
      setRole(result.employer ? 'employer' : 'student');
      setForm({ email: profile?.email || '', phone: result.student?.phone || '', companyName: result.employer?.company_name || '', companyIndustry: result.employer?.industry || '', theme: result.theme, preferences: { ...preferenceDefaults, ...result.preferences } });
      setStatus('');
    }).catch((error) => setStatus(error instanceof Error ? error.message : 'Could not load settings.')).finally(() => setLoading(false));
  }, []);

  const updatePreference = (key: string, value: unknown) => setForm((current) => ({ ...current, preferences: { ...current.preferences, [key]: value } }));
  const chooseTheme = async (value: ThemeMode) => { setForm((current) => ({ ...current, theme: value })); try { await setMode(value, false); } catch { setStatus('Could not apply that theme.'); } };
  const save = async () => {
    setBusy(true); setStatus('Saving your changes...');
    try {
      const result = await saveSettings({ phone: form.phone, ...form.preferences, theme: form.theme, companyName: form.companyName, companyIndustry: form.companyIndustry });
      await setMode(result.theme, false);
      if (form.email) await updateEmail(form.email);
      setStatus('Your settings were saved.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save settings.'); }
    finally { setBusy(false); }
  };
  const securityReset = async () => { setBusy(true); try { await requestPasswordReset(form.email); setStatus(`Password reset instructions sent to ${form.email}.`); } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not send reset email.'); } finally { setBusy(false); } };
  const exportData = async () => { setBusy(true); try { await Share.share({ message: await exportAccountData(), title: 'GraduRat account data' }); setStatus('Your data export is ready to share.'); } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not export your data.'); } finally { setBusy(false); } };
  const clearLocalIdentity = async () => { await Promise.all([clearSession(), clearProfileId('student'), clearProfileId('employer'), clearActiveProfileRole()]); };
  const removeAccount = () => Alert.alert('Delete account', 'This permanently deletes your GraduRat account and associated data.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { setBusy(true); try { await deleteAccount(); await clearLocalIdentity(); router.replace('/'); } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not delete your account.'); } finally { setBusy(false); } } }]);
  const logoutEverywhere = async () => { setBusy(true); try { await logoutAllDevices(); await clearLocalIdentity(); router.replace('/'); } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not log out of all devices.'); } finally { setBusy(false); } };

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Pressable onPress={() => router.back()}><Text style={styles.back}>← Back</Text></Pressable><Text style={styles.eyebrow}>ACCOUNT</Text><Text style={styles.title}>Settings</Text><Text style={styles.muted}>Manage your Gradurat account, privacy and preferences.</Text>
    {loading ? <ActivityIndicator color={colors.blue} /> : <>
      <View style={styles.card}><Text style={styles.heading}>Account</Text><Field label="Email address" value={form.email} onChangeText={(value) => setForm((current) => ({ ...current, email: value }))} styles={styles} /><Field label="Phone number" value={form.phone} onChangeText={(value) => setForm((current) => ({ ...current, phone: value }))} styles={styles} /></View>
      {settingsGroups.map(([title, items]) => <View style={styles.card} key={title}><Text style={styles.heading}>{title}</Text>{items.map(([key, label]) => <SettingControl key={key} label={label} value={form.preferences[key]} update={(value) => updatePreference(key, value)} styles={styles} />)}</View>)}
      <View style={styles.card}><Text style={styles.heading}>Appearance</Text><Text style={styles.muted}>Changes apply throughout the app immediately.</Text><View style={styles.choices}>{(['dark', 'light', 'system'] as ThemeMode[]).map((item) => <Pressable key={item} style={[styles.choice, form.theme === item && styles.choiceActive]} onPress={() => chooseTheme(item)}><Text style={[styles.choiceText, form.theme === item && styles.choiceTextActive]}>{item[0].toUpperCase() + item.slice(1)}</Text></Pressable>)}</View></View>
      {role === 'employer' && <><View style={styles.card}><Text style={styles.heading}>Company settings</Text><Field label="Company name" value={form.companyName} onChangeText={(value) => setForm((current) => ({ ...current, companyName: value }))} styles={styles} /><Field label="Industry" value={form.companyIndustry} onChangeText={(value) => setForm((current) => ({ ...current, companyIndustry: value }))} styles={styles} /></View><View style={styles.card}><Text style={styles.heading}>Recruitment preferences</Text><SettingControl label="AI candidate matching" value={form.preferences.aiMatching} update={(value) => updatePreference('aiMatching', value)} styles={styles} /><SettingControl label="Candidate recommendations" value={form.preferences.candidateRecommendations} update={(value) => updatePreference('candidateRecommendations', value)} styles={styles} /></View></>}
      <Pressable style={styles.primary} onPress={save} disabled={busy}>{busy ? <ActivityIndicator color={colors.text} /> : <Text style={styles.primaryText}>Save changes</Text>}</Pressable>
      <View style={styles.card}><Text style={styles.heading}>Security</Text><Pressable style={styles.action} onPress={securityReset} disabled={busy}><Text style={styles.actionText}>Send password reset email</Text></Pressable><Pressable style={styles.action} onPress={logoutEverywhere} disabled={busy}><Text style={styles.actionText}>Log out of all devices</Text></Pressable></View>
      <View style={styles.card}><Text style={styles.heading}>Privacy & data</Text><Pressable style={styles.action} onPress={exportData} disabled={busy}><Text style={styles.actionText}>Export my data</Text></Pressable><Pressable style={styles.danger} onPress={removeAccount} disabled={busy}><Text style={styles.dangerText}>Delete account</Text></Pressable></View>
    </>}
    {!!status && <Text style={styles.message}>{status}</Text>}<Pressable style={styles.logout} onPress={async () => { await clearLocalIdentity(); router.replace('/'); }}><Text style={styles.logoutText}>Log out</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

function SettingControl({ label, value, update, styles }: { label: string; value: unknown; update: (value: string | boolean) => void; styles: ReturnType<typeof makeStyles> }) { if (typeof value === 'boolean') return <View style={styles.row}><Text style={styles.label}>{label}</Text><Switch value={value} onValueChange={update} /></View>; return <Field label={label} value={String(value || '')} onChangeText={update as (value: string) => void} styles={styles} />; }
function Field({ label, value, onChangeText, styles }: { label: string; value: string; onChangeText: (value: string) => void; styles: ReturnType<typeof makeStyles> }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={label} placeholderTextColor={styles.input.color as string} style={styles.input} /></View>; }
const makeStyles = (colors: { background: string; surface: string; surfaceRaised: string; border: string; text: string; muted: string; blue: string; blueDark: string; danger: string }) => StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, page: { flexGrow: 1, padding: 24, gap: 14 }, back: { color: colors.muted, fontWeight: '700', marginBottom: 4 }, eyebrow: { color: colors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 }, title: { color: colors.text, fontSize: 34, fontWeight: '800' }, muted: { color: colors.muted, fontSize: 14, lineHeight: 21 }, card: { gap: 12, padding: 18, borderColor: colors.border, borderWidth: 1, borderRadius: 14, backgroundColor: colors.surfaceRaised }, heading: { color: colors.text, fontSize: 18, fontWeight: '800' }, field: { gap: 7 }, label: { color: colors.muted, fontSize: 13, fontWeight: '700' }, input: { color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 8, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 11 }, row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11 }, choiceActive: { borderColor: colors.blue, backgroundColor: colors.blueDark }, choiceText: { color: colors.muted, fontWeight: '700' }, choiceTextActive: { color: colors.text }, primary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue, borderRadius: 8, paddingVertical: 14 }, primaryText: { color: colors.text, fontWeight: '800' }, action: { borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 13 }, actionText: { color: colors.blue, fontWeight: '700' }, danger: { borderColor: colors.danger, borderWidth: 1, borderRadius: 8, padding: 13 }, dangerText: { color: colors.danger, fontWeight: '800' }, message: { color: colors.muted, lineHeight: 21 }, logout: { borderColor: colors.danger, borderWidth: 1, borderRadius: 8, paddingVertical: 14, alignItems: 'center' }, logoutText: { color: colors.danger, fontWeight: '800' } });
