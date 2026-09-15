import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar } from '@/components/avatar';
import { loadProfile, updateProfile } from '@/lib/api';
import { industries } from '@/constants/industries';
import { useTheme } from '@/lib/theme';
import { getProfileId } from '@/lib/storage';

type Form = Record<string, string>;
const studentFields = [
  ['name', 'Full name'], ['email', 'Email'], ['phone', 'Phone'], ['qualification', 'Qualification'], ['institution', 'Institution'], ['field', 'Field of study'], ['graduation_year', 'Graduation year'], ['location', 'Location'], ['skills', 'Skills separated by commas'], ['experience', 'Work experience'], ['projects', 'Projects separated by commas'], ['certifications', 'Certifications separated by commas'], ['preferred_opportunity_type', 'Preferred opportunity type'], ['preferred_industry', 'Preferred industry'], ['preferred_location', 'Preferred location'], ['remote_work_preference', 'Remote preference'], ['linkedin_url', 'LinkedIn URL'], ['portfolio_url', 'Portfolio URL'],
] as const;
const employerFields = [
  ['name', 'Company name'], ['email', 'Email'], ['location', 'Location'], ['industry', 'Industry'], ['website', 'Website'], ['contact_person_name', 'Contact person'], ['contact_email', 'Contact email'], ['contact_phone', 'Contact phone'], ['company_size', 'Company size'], ['description', 'Company description'], ['benefits', 'Benefits separated by commas'],
] as const;

export default function ProfileScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { role = 'student' } = useLocalSearchParams<{ role?: string }>();
  const isStudent = role !== 'employer';
  const profileType = isStudent ? 'students' : 'employers';
  const [id, setId] = useState<string | null>(null);
  const [picture, setPicture] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({});
  const [message, setMessage] = useState('Loading profile...');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const fields = isStudent ? studentFields : employerFields;
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const load = async () => {
    try {
      setMessage('');
      const profileId = await getProfileId(isStudent ? 'student' : 'employer');
      if (!profileId) throw new Error('Register a profile before editing it.');
      const result = await loadProfile(profileType, profileId);
      const profile = (result[isStudent ? 'student' : 'employer'] || {}) as Record<string, any>;
      const next: Form = {};
      fields.forEach(([key]) => { next[key] = String(profile[key] ?? (key === 'name' ? profile.full_name || profile.company_name || '' : '')); });
      setId(profileId);
      setPicture(typeof profile.profile_picture_url === 'string' ? profile.profile_picture_url : null);
      setForm(next);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load profile.'); }
  };

  useEffect(() => { load(); }, [isStudent, profileType]);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const save = async () => {
    if (!id) return;
    setBusy(true); setMessage('Saving profile...');
    try {
      const payload: Record<string, unknown> = { ...form };
      if (isStudent) {
        payload.full_name = form.name;
        payload.skills = form.skills?.split(',').map((item) => item.trim()).filter(Boolean);
        payload.projects = form.projects?.split(',').map((item) => item.trim()).filter(Boolean);
        payload.certifications = form.certifications?.split(',').map((item) => item.trim()).filter(Boolean);
      } else {
        payload.company_name = form.name;
        payload.benefits = form.benefits?.split(',').map((item) => item.trim()).filter(Boolean);
      }
      await updateProfile(profileType, id, payload);
      setMessage('Profile saved. Refresh dashboards to see the updated details everywhere.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save profile.'); }
    finally { setBusy(false); }
  };

  return <SafeAreaView style={styles.safe}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.blue} />} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"><Pressable onPress={() => router.back()}><Text style={styles.back}>← Back</Text></Pressable><View style={styles.avatar}><Avatar name={form.name || (isStudent ? 'Graduate' : 'Employer')} profileId={id || ''} profileType={profileType} url={picture} size={96} editable={Boolean(id)} onChange={setPicture} /></View><Text style={styles.eyebrow}>PROFILE</Text><Text style={styles.title}>{isStudent ? 'Complete your profile' : 'Company profile'}</Text><Text style={styles.muted}>These details are used by the same matching and profile rules as the web app.</Text><View style={styles.card}>{fields.map(([key, label]) => <Field key={key} label={label} value={form[key] || ''} update={(value) => update(key, value)} multiline={['experience', 'projects', 'certifications', 'description', 'benefits'].includes(key)} />)}{isStudent && <ChoiceRow label="Preferred industry" value={form.preferred_industry || ''} values={['', ...industries]} update={(value) => update('preferred_industry', value)} />}<Pressable style={styles.primary} onPress={save} disabled={busy}>{busy ? <ActivityIndicator color={colors.text} /> : <Text style={styles.primaryText}>Save profile</Text>}</Pressable></View>{!!message && <Text style={styles.message}>{message}</Text>}</ScrollView></SafeAreaView>;
}

function Field({ label, value, update, multiline = false }: { label: string; value: string; update: (value: string) => void; multiline?: boolean }) { const { colors } = useTheme(); const styles = makeStyles(colors); return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={[styles.input, multiline && styles.textarea]} value={value} onChangeText={update} placeholder={label} placeholderTextColor={colors.subtle} multiline={multiline} /></View>; }
function ChoiceRow({ label, values, value, update }: { label: string; values: readonly string[]; value: string; update: (value: string) => void }) { const { colors } = useTheme(); const styles = makeStyles(colors); return <View style={styles.field}><Text style={styles.label}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>{values.map((item) => <Pressable key={item || 'all'} onPress={() => update(item)} style={[styles.choice, value === item && styles.choiceActive]}><Text style={[styles.choiceText, value === item && styles.choiceTextActive]}>{item || 'Select industry'}</Text></Pressable>)}</ScrollView></View>; }
const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, page: { flexGrow: 1, padding: 20, gap: 14 }, back: { color: colors.muted, fontWeight: '700' }, avatar: { alignItems: 'center', marginVertical: 4 }, eyebrow: { color: colors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 }, title: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: '800' }, muted: { color: colors.muted, lineHeight: 21 }, card: { gap: 15, padding: 18, borderColor: colors.border, borderWidth: 1, borderRadius: 14, backgroundColor: colors.surfaceRaised }, field: { gap: 7 }, label: { color: colors.muted, fontSize: 12, fontWeight: '700' }, input: { color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 8, backgroundColor: colors.surface, paddingHorizontal: 13, paddingVertical: 12 }, textarea: { minHeight: 100, textAlignVertical: 'top' }, choices: { flexDirection: 'row', gap: 7 }, choice: { borderColor: colors.border, borderWidth: 1, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 9 }, choiceActive: { borderColor: colors.blue, backgroundColor: colors.blueDark }, choiceText: { color: colors.muted, fontSize: 12 }, choiceTextActive: { color: colors.text, fontWeight: '800' }, primary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue, borderRadius: 8, paddingVertical: 14 }, primaryText: { color: colors.text, fontWeight: '800' }, message: { color: colors.muted, lineHeight: 21 } });
