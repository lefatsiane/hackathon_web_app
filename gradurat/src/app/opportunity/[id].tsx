import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { applyToOpportunity, loadOpportunity, loadStudentApplications, Opportunity } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { getProfileId } from '@/lib/storage';

export default function OpportunityScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<Opportunity | null>(null);
  const [message, setMessage] = useState('Loading opportunity...');
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([loadOpportunity(id), getProfileId('student').then((studentId) => studentId ? loadStudentApplications(studentId) : { applications: [] })]).then(([opportunityResult, applicationsResult]) => {
      setItem(opportunityResult.opportunity);
      setApplied(applicationsResult.applications.some((application) => application.opportunities?.id === id));
    }).catch((error) => setMessage(error instanceof Error ? error.message : 'Could not load opportunity.'));
  }, [id]);

  const apply = async () => {
    if (!id || applied) return;
    setBusy(true);
    try {
      const studentId = await getProfileId('student');
      if (!studentId) throw new Error('Register a graduate profile before applying.');
      await applyToOpportunity(id, studentId);
      setApplied(true);
      setMessage('Application submitted.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not submit application.');
    } finally { setBusy(false); }
  };

  if (!item) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.blue} /><Text style={styles.muted}>{message}</Text></View></SafeAreaView>;
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}><Pressable onPress={() => router.back()}><Text style={styles.back}>← Back</Text></Pressable><Text style={styles.eyebrow}>{item.type || 'OPPORTUNITY'}</Text><Text style={styles.title}>{item.title}</Text><Text style={styles.company}>{item.employers?.company_name || 'Employer'}</Text><View style={styles.card}><Text style={styles.heading}>About this opportunity</Text><Text style={styles.body}>{item.description || 'No description provided.'}</Text></View><View style={styles.card}><Text style={styles.heading}>Required skills</Text><View style={styles.tags}>{(item.required_skills || []).map((skill) => <Text key={skill} style={styles.tag}>{skill}</Text>)}</View></View>{!!message && <Text style={styles.message}>{message}</Text>}<View style={styles.actions}><Pressable style={styles.secondary} onPress={() => Share.share({ title: item.title, message: `${item.title} at ${item.employers?.company_name || 'Employer'}` })}><Text style={styles.secondaryText}>Share</Text></Pressable><Pressable style={[styles.primary, applied && styles.primaryDisabled]} onPress={apply} disabled={busy || applied}>{busy ? <ActivityIndicator color={colors.text} /> : <Text style={styles.primaryText}>{applied ? 'Application submitted' : 'Apply'}</Text>}</Pressable></View></ScrollView></SafeAreaView>;
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, page: { padding: 20, gap: 16 }, back: { color: colors.muted, fontWeight: '700' }, eyebrow: { color: colors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 }, title: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: '800' }, company: { color: colors.blue, fontSize: 16, fontWeight: '800' }, card: { gap: 10, padding: 18, borderColor: colors.border, borderWidth: 1, borderRadius: 14, backgroundColor: colors.surfaceRaised }, heading: { color: colors.text, fontSize: 18, fontWeight: '800' }, body: { color: colors.muted, lineHeight: 22 }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, tag: { color: colors.blue, backgroundColor: colors.blueDark, borderRadius: 5, paddingHorizontal: 9, paddingVertical: 6, fontSize: 12 }, message: { color: colors.muted, lineHeight: 21 }, actions: { flexDirection: 'row', gap: 10 }, secondary: { flex: 1, borderColor: colors.border, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 }, secondaryText: { color: colors.muted, fontWeight: '800' }, primary: { flex: 2, backgroundColor: colors.blue, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 }, primaryDisabled: { backgroundColor: colors.subtle }, primaryText: { color: colors.text, fontWeight: '800' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, muted: { color: colors.muted } });