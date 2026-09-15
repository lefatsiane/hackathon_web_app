import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { applyToOpportunity, loadOpportunity, loadOpportunityCandidates, loadStudentApplications, Opportunity, OpportunityCandidate } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { getActiveProfileRole, getProfileId } from '@/lib/storage';

export default function OpportunityScreen() {
  const { colors } = useTheme();
  const styles = { ...makeStyles(colors), back: { display: 'none' as const } };
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<Opportunity | null>(null);
  const [message, setMessage] = useState('Loading opportunity...');
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [candidates, setCandidates] = useState<OpportunityCandidate[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      setMessage('');
      const role = await getActiveProfileRole();
      const result = await loadOpportunity(id);
      setItem(result.opportunity);
      setIsOwner(Boolean(result.isOwner));
      if (role === 'employer' && result.isOwner) {
        const applicants = await loadOpportunityCandidates(id);
        setCandidates(applicants.candidates || []);
        return;
      }
      const studentId = await getProfileId('student');
      const applications = studentId ? await loadStudentApplications(studentId) : { applications: [] };
      setApplied(applications.applications.some((application) => application.opportunities?.id === id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load opportunity.');
    }
  };

  useEffect(() => { load(); }, [id]);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const shareOpportunity = () => item && Share.share({ title: item.title, message: `${item.title} at ${item.employers?.company_name || 'Employer'}` });
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

  if (!item) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.blue} /><Text style={styles.body}>{message}</Text></View></SafeAreaView>;
  return <SafeAreaView style={styles.safe}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.blue} />} contentContainerStyle={styles.page}>
    <Text style={styles.eyebrow}>{item.type || 'OPPORTUNITY'}</Text>
    <Text style={styles.title}>{item.title}</Text>
    <Text style={styles.company}>{item.employers?.company_name || 'Employer'}</Text>
    <View style={styles.card}><Text style={styles.heading}>About this opportunity</Text><Text style={styles.body}>{item.description || 'No description provided.'}</Text></View>
    <View style={styles.card}><Text style={styles.heading}>Required skills</Text><View style={styles.tags}>{(item.required_skills || []).map((skill) => <Text key={skill} style={styles.tag}>{skill}</Text>)}</View></View>
    {isOwner ? <View style={styles.card}><Text style={styles.heading}>Applicants</Text>{candidates.length ? candidates.map((candidate) => <Pressable key={candidate.applicationId || candidate.id} style={styles.candidate} onPress={() => router.push({ pathname: '/candidate/[id]', params: { id: candidate.id } })}><Text style={styles.candidateName}>{candidate.name}</Text><Text style={styles.body}>{candidate.qualification || 'Graduate profile'}{candidate.location ? ` · ${candidate.location}` : ''}</Text><Text style={styles.link}>View full applicant →</Text></Pressable>) : <Text style={styles.body}>No applicants yet.</Text>}</View> : null}
    {!!message && <Text style={styles.message}>{message}</Text>}
    <View style={styles.actions}><Pressable style={styles.secondary} onPress={shareOpportunity}><Text style={styles.secondaryText}>Share</Text></Pressable>{!isOwner ? <Pressable style={[styles.primary, applied && styles.primaryDisabled]} onPress={apply} disabled={busy || applied}>{busy ? <ActivityIndicator color={colors.text} /> : <Text style={styles.primaryText}>{applied ? 'Application submitted' : 'Apply'}</Text>}</Pressable> : null}</View>
  </ScrollView></SafeAreaView>;
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, page: { padding: 20, gap: 16 }, eyebrow: { color: colors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 }, title: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: '800' }, company: { color: colors.blue, fontSize: 16, fontWeight: '800' }, card: { gap: 10, padding: 18, borderColor: colors.border, borderWidth: 1, borderRadius: 14, backgroundColor: colors.surfaceRaised }, heading: { color: colors.text, fontSize: 18, fontWeight: '800' }, body: { color: colors.muted, lineHeight: 22 }, candidate: { gap: 5, paddingTop: 10, borderTopColor: colors.border, borderTopWidth: 1 }, candidateName: { color: colors.text, fontWeight: '800' }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, tag: { color: colors.blue, backgroundColor: colors.blueDark, borderRadius: 5, paddingHorizontal: 9, paddingVertical: 6, fontSize: 12 }, link: { color: colors.blue, fontWeight: '800' }, message: { color: colors.muted, lineHeight: 21 }, actions: { flexDirection: 'row', gap: 10 }, secondary: { flex: 1, borderColor: colors.border, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 }, secondaryText: { color: colors.muted, fontWeight: '800' }, primary: { flex: 2, backgroundColor: colors.blue, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 }, primaryDisabled: { backgroundColor: colors.subtle }, primaryText: { color: colors.text, fontWeight: '800' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
