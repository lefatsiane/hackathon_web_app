import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { loadCandidate, loadCandidateReview, CandidateReview, Student } from '@/lib/api';
import { useTheme } from '@/lib/theme';

export default function CandidateScreen() {
  const { colors } = useTheme();
  const styles = { ...makeStyles(colors), back: { display: 'none' as const } };
  const { id } = useLocalSearchParams<{ id: string }>();
  const [candidate, setCandidate] = useState<Student | null>(null);
  const [review, setReview] = useState<CandidateReview | null>(null);
  const [message, setMessage] = useState('Loading candidate...');
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      setMessage('');
      const [profileResult, reviewResult] = await Promise.all([loadCandidate(id), loadCandidateReview(id)]);
      setCandidate(profileResult.candidate);
      setReview(reviewResult);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load candidate details.');
    }
  };

  useEffect(() => { load(); }, [id]);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (!candidate) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.blue} /><Text style={styles.body}>{message}</Text></View></SafeAreaView>;
  }

  return <SafeAreaView style={styles.safe}>
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.blue} />} contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>CANDIDATE PROFILE</Text>
      <Text style={styles.title}>{candidate.full_name}</Text>
      <Text style={styles.company}>{candidate.qualification || 'Graduate profile'}</Text>
      <View style={styles.card}>
        <Text style={styles.heading}>Profile</Text>
        <Text style={styles.body}>{candidate.bio || candidate.experience || 'No profile summary provided.'}</Text>
        <Text style={styles.body}>{candidate.location || 'Location flexible'}</Text>
        <View style={styles.tags}>{(candidate.skills || []).map((skill) => <Text key={skill} style={styles.tag}>{skill}</Text>)}</View>
      </View>
      <View style={styles.card}>
        <Text style={styles.heading}>Application review</Text>
        <Text style={styles.body}>{review?.opportunity ? `Opportunity: ${review.opportunity.title}` : 'Connected to your opportunity'}</Text>
        {review?.assessment?.summary ? <Text style={styles.body}>{review.assessment.summary}</Text> : null}
        {(review?.assessment?.strengths || []).map((item) => <Text key={item} style={styles.body}>Strength: {item}</Text>)}
      </View>
      <View style={styles.card}>
        <Text style={styles.heading}>Sensitive contact details</Text>
        <Text style={styles.body}>Email: {review?.contact.email || 'Not provided'}</Text>
        <Text style={styles.body}>Phone: {review?.contact.phone || 'Not provided'}</Text>
        <Text style={styles.body}>LinkedIn: {review?.contact.linkedin_url || 'Not provided'}</Text>
        <Text style={styles.body}>Portfolio: {review?.contact.portfolio_url || 'Not provided'}</Text>
        {review?.cv?.downloadable && review.cv.url ? <Pressable style={styles.primary} onPress={() => Linking.openURL(review.cv.url!)}><Text style={styles.primaryText}>Download CV</Text></Pressable> : <Text style={styles.body}>CV download is unavailable for this profile.</Text>}
      </View>
      {!!message && <Text style={styles.message}>{message}</Text>}
    </ScrollView>
  </SafeAreaView>;
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { padding: 20, gap: 16 },
  eyebrow: { color: colors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  title: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: '800' },
  company: { color: colors.blue, fontSize: 16, fontWeight: '800' },
  card: { gap: 10, padding: 18, borderColor: colors.border, borderWidth: 1, borderRadius: 14, backgroundColor: colors.surfaceRaised },
  heading: { color: colors.text, fontSize: 18, fontWeight: '800' },
  body: { color: colors.muted, lineHeight: 22 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tag: { color: colors.blue, backgroundColor: colors.blueDark, borderRadius: 5, paddingHorizontal: 9, paddingVertical: 6, fontSize: 12 },
  primary: { backgroundColor: colors.blue, borderRadius: 8, alignItems: 'center', paddingVertical: 13 },
  primaryText: { color: colors.text, fontWeight: '800' },
  message: { color: colors.muted, lineHeight: 21 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
