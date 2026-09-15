import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, type } from '@/constants/theme';
import { Application, loadEmployerApplications, loadStudentApplications, updateApplication } from '@/lib/api';
import { getProfileId } from '@/lib/storage';

export default function ApplicationsScreen() {
  const { role = 'student' } = useLocalSearchParams<{ role?: string }>();
  const isStudent = role !== 'employer';
  const [applications, setApplications] = useState<Application[]>([]);
  const [state, setState] = useState<'loading' | 'content' | 'error'>('loading');
  const [message, setMessage] = useState('Loading applications...');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setState('loading');
    try {
      const id = await getProfileId(isStudent ? 'student' : 'employer');
      if (!id) throw new Error('Your profile is not available yet.');
      const result = isStudent ? await loadStudentApplications(id) : await loadEmployerApplications(id);
      setApplications(result.applications);
      setState('content');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load applications.');
      setState('error');
    } finally {
      setRefreshing(false);
    }
  }, [isStudent]);

  useEffect(() => { void load(); }, [load]);

  const changeStatus = async (application: Application, status: string) => {
    try {
      const result = await updateApplication(application.id, status);
      setApplications((current) => current.map((item) => item.id === application.id ? { ...item, ...result.application } : item));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update application.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.blue} />}
      >
        <Pressable onPress={() => router.back()}><Text style={styles.back}>Back to dashboard</Text></Pressable>
        <Text style={styles.badge}>{isStudent ? 'YOUR CAREER JOURNEY' : 'RECRUITING WORKSPACE'}</Text>
        <Text style={styles.title}>{isStudent ? 'Your applications.' : 'Candidate applications.'}</Text>
        <Text style={styles.intro}>{isStudent ? 'Track every opportunity from submission to decision.' : 'Review candidates and keep each application moving.'}</Text>
        {state === 'loading' && <View style={styles.center}><ActivityIndicator color={colors.blue} /><Text style={styles.muted}>{message}</Text></View>}
        {state === 'error' && <View style={styles.empty}><Text style={styles.error}>{message}</Text><Pressable style={styles.primary} onPress={() => load()}><Text style={styles.primaryText}>Try again</Text></Pressable></View>}
        {state === 'content' && applications.length === 0 && <View style={styles.empty}><Text style={styles.sectionTitle}>No applications yet</Text><Text style={styles.muted}>{isStudent ? 'Explore matching opportunities to get started.' : 'Applications will appear when graduates apply to your jobs.'}</Text></View>}
        {state === 'content' && applications.map((application) => {
          const title = application.opportunities?.title || 'Opportunity';
          const person = application.students?.full_name || 'Graduate';
          return (
            <View style={styles.card} key={application.id}>
              <View style={styles.cardTop}><View style={styles.flex}><Text style={styles.cardTitle}>{isStudent ? title : person}</Text><Text style={styles.muted}>{isStudent ? application.opportunities?.employers?.company_name || 'Employer' : title}</Text></View><Text style={styles.status}>{application.status}</Text></View>
              {!!application.created_at && <Text style={styles.muted}>Submitted {new Date(application.created_at).toLocaleDateString()}</Text>}
              {!isStudent && <View style={styles.statusActions}>{['reviewing', 'shortlisted', 'rejected'].map((status) => <Pressable key={status} onPress={() => changeStatus(application, status)}><Text style={styles.link}>{status}</Text></Pressable>)}</View>}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { padding: 24, paddingTop: 35, gap: 17, backgroundColor: colors.background, flexGrow: 1 },
  back: { color: '#7daeff', fontWeight: '700' },
  badge: { color: '#7daeff', fontSize: 12, fontWeight: '800', letterSpacing: 1.4, marginTop: 15 },
  title: { ...type.title, color: colors.text },
  intro: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  card: { padding: 18, gap: 10, borderColor: colors.border, borderWidth: 1, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  cardTop: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  status: { color: colors.green, fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  statusActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 15, paddingTop: 5 },
  link: { color: '#7daeff', fontWeight: '700', textTransform: 'capitalize' },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  center: { alignItems: 'center', gap: 12, paddingVertical: 35 },
  empty: { padding: 20, gap: 14, borderColor: colors.border, borderWidth: 1, borderRadius: 12 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  error: { color: colors.danger, lineHeight: 20 },
  primary: { alignSelf: 'flex-start', backgroundColor: colors.blue, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 13 },
  primaryText: { color: colors.text, fontWeight: '800' },
});
