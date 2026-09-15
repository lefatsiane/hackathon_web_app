import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Application, loadEmployerApplications, loadStudentApplications, updateApplication } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { getProfileId } from '@/lib/storage';

type Role = 'student' | 'employer';
const statuses = ['submitted', 'reviewing', 'shortlisted', 'rejected'];

export default function ApplicationsScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const params = useLocalSearchParams<{ role?: string }>();
  const [role, setRole] = useState<Role>(params.role === 'employer' ? 'employer' : 'student');
  const [items, setItems] = useState<Application[]>([]);
  const [message, setMessage] = useState('Loading applications...');
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      setMessage('');
      const preferredRole = params.role === 'employer' || params.role === 'student' ? params.role : null;
      const employerId = await getProfileId('employer');
      const studentId = await getProfileId('student');
      const nextRole: Role = preferredRole === 'employer' || (!studentId && Boolean(employerId)) ? 'employer' : 'student';
      const id = nextRole === 'employer' ? employerId : studentId;
      if (!id) throw new Error('Register a profile before viewing applications.');
      const result = nextRole === 'employer' ? await loadEmployerApplications(id) : await loadStudentApplications(id);
      setRole(nextRole);
      setItems(result.applications || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load applications.');
    }
  };

  useEffect(() => { load(); }, [params.role]);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const changeStatus = async (item: Application, status: string) => {
    setBusyId(item.id);
    try {
      const result = await updateApplication(item.id, status);
      setItems((current) => current.map((application) => application.id === item.id ? { ...application, ...result.application } : application));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update application.');
    } finally { setBusyId(null); }
  };

  return <SafeAreaView style={styles.safe}><FlatList data={items} keyExtractor={(item) => item.id} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.blue} />} contentContainerStyle={styles.page} ListHeaderComponent={<><Pressable onPress={() => router.back()}><Text style={styles.back}>← Back</Text></Pressable><Text style={styles.eyebrow}>APPLICATIONS</Text><Text style={styles.title}>{role === 'student' ? 'Companies you applied to' : 'Candidate applications'}</Text><Text style={styles.muted}>{role === 'student' ? 'Track the opportunities and companies receiving your applications.' : 'Review applicants and update their application status.'}</Text></>} ListEmptyComponent={<View style={styles.empty}>{message ? <><ActivityIndicator color={colors.blue} /><Text style={styles.muted}>{message}</Text></> : <Text style={styles.muted}>No applications yet.</Text>}</View>} renderItem={({ item }) => <View style={styles.card}><Text style={styles.heading}>{role === 'student' ? item.opportunities?.employers?.company_name || 'Employer' : item.students?.full_name || 'Candidate'}</Text><Text style={styles.muted}>{role === 'student' ? item.opportunities?.title || 'Opportunity' : item.opportunities?.title || 'Opportunity'}</Text><Text style={styles.status}>{item.status}</Text>{role === 'employer' && <View style={styles.statuses}>{statuses.map((status) => <Pressable key={status} disabled={busyId === item.id} onPress={() => changeStatus(item, status)} style={[styles.statusButton, item.status === status && styles.statusButtonActive]}><Text style={[styles.statusButtonText, item.status === status && styles.statusButtonTextActive]}>{status}</Text></Pressable>)}</View>}</View>} /></SafeAreaView>;
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, page: { padding: 20, gap: 14 }, back: { color: colors.muted, fontWeight: '700' }, eyebrow: { color: colors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 }, title: { color: colors.text, fontSize: 29, lineHeight: 35, fontWeight: '800' }, muted: { color: colors.muted, lineHeight: 21 }, card: { gap: 8, padding: 18, borderColor: colors.border, borderWidth: 1, borderRadius: 14, backgroundColor: colors.surfaceRaised }, heading: { color: colors.text, fontSize: 17, fontWeight: '800' }, status: { color: colors.blue, fontWeight: '800', textTransform: 'capitalize' }, statuses: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 5 }, statusButton: { borderColor: colors.border, borderWidth: 1, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 8 }, statusButtonActive: { borderColor: colors.blue, backgroundColor: colors.blueDark }, statusButtonText: { color: colors.muted, fontSize: 11 }, statusButtonTextActive: { color: colors.text, fontWeight: '800' }, empty: { alignItems: 'center', paddingVertical: 50, gap: 12 } });
