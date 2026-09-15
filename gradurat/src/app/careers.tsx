import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { loadCandidates, loadOpportunities, Opportunity, Student } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { industries } from '@/constants/industries';
import { getActiveProfileRole } from '@/lib/storage';

export default function CareersScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [items, setItems] = useState<Opportunity[]>([]);
  const [candidates, setCandidates] = useState<Student[]>([]);
  const [employerMode, setEmployerMode] = useState(false);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [industry, setIndustry] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('Loading opportunities...');

  const load = async () => {
    try {
      setMessage('');
      const isEmployer = await getActiveProfileRole() === 'employer';
      setEmployerMode(isEmployer);
      if (isEmployer) {
        const params = new URLSearchParams();
        if (query.trim()) params.set('keyword', query.trim());
        if (industry !== 'all') params.set('industry', industry);
        if (type !== 'all') params.set('opportunity_type', type);
        const result = await loadCandidates(params.toString() ? `?${params.toString()}` : '');
        setCandidates(result.candidates || []);
        setItems([]);
        return;
      }
      const params = new URLSearchParams();
      if (query.trim()) params.set('keyword', query.trim());
      if (type !== 'all') params.set('type', type);
      if (industry !== 'all') params.set('industry', industry);
      const result = await loadOpportunities(params.toString() ? `?${params.toString()}` : '');
      setItems(result.opportunities || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load opportunities.');
    }
  };

  useEffect(() => { load(); }, [type, industry]);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const types = ['all', 'Full Time', 'Part Time', 'Internship', 'Graduate Programme', 'Contract'];

  const employerView = employerMode;
  const data = employerView ? candidates : items;
  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.blue} />}
        contentContainerStyle={styles.page}
        ListHeaderComponent={<>
          <Text style={styles.eyebrow}>{employerView ? 'CANDIDATE EXPLORER' : 'CAREER EXPLORER'}</Text>
          <Text style={styles.title}>{employerView ? 'Find your next candidate.' : 'Find your next opportunity.'}</Text>
          <Text style={styles.muted}>{employerView ? 'Search students and potential employees by fit.' : 'Search the same published opportunities available on the web app.'}</Text>
          <TextInput value={query} onChangeText={setQuery} onSubmitEditing={load} placeholder={employerView ? 'Search candidates, skills, or qualifications' : 'Search roles, skills, or companies'} placeholderTextColor={colors.subtle} style={styles.input} returnKeyType="search" />
          <Text style={styles.filterLabel}>Industry</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{['all', ...industries].map((item) => <Pressable key={item} onPress={() => setIndustry(item)} style={[styles.filter, industry === item && styles.filterActive]}><Text style={[styles.filterText, industry === item && styles.filterTextActive]}>{item === 'all' ? 'All industries' : item}</Text></Pressable>)}</ScrollView>
          <Text style={styles.filterLabel}>Opportunity type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{types.map((item) => <Pressable key={item} onPress={() => setType(item)} style={[styles.filter, type === item && styles.filterActive]}><Text style={[styles.filterText, type === item && styles.filterTextActive]}>{item === 'all' ? 'All types' : item}</Text></Pressable>)}</ScrollView>
        </>}
        ListEmptyComponent={<View style={styles.empty}>{message ? <><ActivityIndicator color={colors.blue} /><Text style={styles.muted}>{message}</Text></> : <Text style={styles.muted}>{employerView ? 'No candidates match these filters.' : 'No opportunities match these filters.'}</Text>}</View>}
        renderItem={({ item }) => employerView ? <View style={styles.card}><Text style={styles.cardTitle}>{(item as Student).full_name}</Text><Text style={styles.muted}>{(item as Student).qualification || 'Graduate profile'} · {(item as Student).location || 'Location flexible'}</Text><View style={styles.tags}>{((item as Student).skills || []).map((skill) => <Text key={skill} style={styles.tag}>{skill}</Text>)}</View><Text style={styles.reason}>{(item as Student).bio || (item as Student).work_experience_summary || 'Potential candidate on GraduRat.'}</Text><Text style={styles.link}>View candidate →</Text></View> : <Pressable style={styles.card} onPress={() => router.push({ pathname: '/opportunity/[id]', params: { id: (item as Opportunity).id } })}><Text style={styles.cardTitle}>{(item as Opportunity).title}</Text><Text style={styles.muted}>{(item as Opportunity).employers?.company_name || 'Employer'} · {(item as Opportunity).type || 'Opportunity'}</Text><View style={styles.tags}>{((item as Opportunity).required_skills || []).map((skill) => <Text key={skill} style={styles.tag}>{skill}</Text>)}</View><Text style={styles.reason}>{(item as Opportunity).reasoning || (item as Opportunity).description || 'Explore this opportunity.'}</Text><Text style={styles.link}>View opportunity →</Text></Pressable>}
      />
    </SafeAreaView>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, page: { padding: 20, gap: 14 }, eyebrow: { color: colors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 }, title: { color: colors.text, fontSize: 29, lineHeight: 35, fontWeight: '800' }, muted: { color: colors.muted, lineHeight: 21 }, input: { color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 9, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 13 }, filterLabel: { color: colors.muted, fontSize: 12, fontWeight: '800' }, filters: { flexDirection: 'row', gap: 8 }, filter: { borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 9 }, filterActive: { borderColor: colors.blue, backgroundColor: colors.blueDark }, filterText: { color: colors.muted, fontSize: 12 }, filterTextActive: { color: colors.text, fontWeight: '700' }, card: { gap: 9, padding: 18, borderColor: colors.border, borderWidth: 1, borderRadius: 14, backgroundColor: colors.surfaceRaised }, cardTitle: { color: colors.text, fontSize: 18, fontWeight: '800' }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, tag: { color: colors.blue, backgroundColor: colors.blueDark, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 5, fontSize: 11 }, reason: { color: colors.muted, lineHeight: 20 }, link: { color: colors.blue, fontWeight: '800' }, empty: { alignItems: 'center', gap: 12, paddingVertical: 50 } });