import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { loadEmployerDashboard, loadFypQueue, submitFypSwipe } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { getActiveProfileRole, getProfileId } from '@/lib/storage';

type SwipeMode = 'student' | 'peer' | 'employer';
type CardData = Record<string, any>;

export default function FypScreen() {
  const { colors } = useTheme();
  const styles = { ...makeStyles(colors), back: { display: 'none' as const } };
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [resolvedMode, setResolvedMode] = useState<SwipeMode>('student');
  const [roleReady, setRoleReady] = useState(false);
  const isEmployer = resolvedMode === 'employer';
  const [activeMode, setActiveMode] = useState<SwipeMode>('student');
  const [cards, setCards] = useState<CardData[]>([]);
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState('Loading recommendations...');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [matchAdvice, setMatchAdvice] = useState<CardData | null>(null);
  const [employerOpportunityId, setEmployerOpportunityId] = useState<string | null>(null);
  const translateX = useSharedValue(0);
  const card = cards[index];

  const load = async (nextMode: SwipeMode = activeMode) => {
    try {
      setMessage('');
      let opportunityId: string | undefined;
      if (nextMode === 'employer') {
        const employerId = await getProfileId('employer');
        if (!employerId) throw new Error('Register an employer profile before matching candidates.');
        const dashboard = await loadEmployerDashboard(employerId);
        opportunityId = dashboard.opportunities[0]?.id;
        if (!opportunityId) throw new Error('Create an opportunity before matching candidates.');
        setEmployerOpportunityId(opportunityId);
      }
      const result = await loadFypQueue(nextMode, { limit: 15, opportunityId });
      setCards(result.cards || []);
      setIndex(0);
      translateX.value = 0;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load recommendations.');
      setCards([]);
    }
  };

  useEffect(() => {
    getActiveProfileRole().then((role) => {
      const nextMode: SwipeMode = mode === 'peer' && role !== 'employer' ? 'peer' : role === 'employer' || mode === 'employer' ? 'employer' : 'student';
      setResolvedMode(nextMode);
      setActiveMode(nextMode);
      setRoleReady(true);
    });
  }, [mode]);
  useEffect(() => { if (roleReady) load(activeMode); }, [activeMode, roleReady]);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const decide = async (decision: 'like' | 'pass', direction: number) => {
    if (!card || busy) return;
    setBusy(true);
    translateX.value = withTiming(direction * 500, { duration: 260 });
    try {
      const payload = activeMode === 'peer'
        ? { mode: 'peer', target_student_id: card.id, decision }
        : { opportunity_id: activeMode === 'employer' ? card.opportunity_id : card.id, student_id: activeMode === 'employer' ? card.id : undefined, decision };
      const result = await submitFypSwipe(payload);
      if (result.matched) setMatchAdvice(result.match?.connection_advice || { summary: 'It is a mutual match. Open Matches to connect.' });
      setTimeout(() => {
        setIndex((value) => value + 1);
        translateX.value = 0;
        setBusy(false);
      }, 280);
    } catch (error) {
      translateX.value = withSpring(0);
      setBusy(false);
      Alert.alert('Could not save decision', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const pan = Gesture.Pan().onEnd((event) => {
    if (Math.abs(event.translationX) > 90) runOnJS(decide)(event.translationX > 0 ? 'like' : 'pass', event.translationX > 0 ? 1 : -1);
    else translateX.value = withSpring(0);
  });
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }, { rotate: `${translateX.value / 18}deg` }] }));
  const switchMode = (nextMode: SwipeMode) => { if (!busy && nextMode !== activeMode) setActiveMode(nextMode); };

  return <SafeAreaView style={styles.safe}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.blue} />} contentContainerStyle={styles.page}><Pressable onPress={() => router.back()}><Text style={styles.back}>← Back</Text></Pressable><Text style={styles.eyebrow}>FIND YOUR PEOPLE</Text><Text style={styles.title}>{isEmployer ? 'Find candidates' : activeMode === 'peer' ? 'Meet peers' : 'Explore opportunities'}</Text>{!isEmployer && <View style={styles.switcher}><Pressable onPress={() => switchMode('student')} style={[styles.switchButton, activeMode === 'student' && styles.switchActive]}><Text style={[styles.switchText, activeMode === 'student' && styles.switchTextActive]}>Jobs</Text></Pressable><Pressable onPress={() => switchMode('peer')} style={[styles.switchButton, activeMode === 'peer' && styles.switchActive]}><Text style={[styles.switchText, activeMode === 'peer' && styles.switchTextActive]}>People</Text></Pressable></View>}{card ? <GestureDetector gesture={pan}><Animated.View style={[styles.card, animatedStyle]}><CardContent card={card} mode={activeMode} styles={styles} colors={colors} /><View style={styles.actions}><Pressable disabled={busy} style={styles.pass} onPress={() => decide('pass', -1)}><Text style={styles.passText}>Pass</Text></Pressable><Pressable disabled={busy} style={styles.like} onPress={() => decide('like', 1)}><Text style={styles.likeText}>Interested</Text></Pressable></View></Animated.View></GestureDetector> : <View style={styles.empty}><ActivityIndicator color={colors.blue} /><Text style={styles.muted}>{index ? 'You have reached the end of this queue.' : message}</Text></View>}</ScrollView><Modal visible={Boolean(matchAdvice)} transparent animationType="fade" onRequestClose={() => setMatchAdvice(null)}><Pressable style={styles.modalBackdrop} onPress={() => setMatchAdvice(null)}><View style={styles.modal}><Text style={styles.modalEyebrow}>MUTUAL MATCH</Text><Text style={styles.modalTitle}>You both showed interest.</Text><Text style={styles.modalBody}>{matchAdvice?.summary || 'A professional connection is ready to grow.'}</Text>{(matchAdvice?.benefits || []).map((item: string) => <Text key={item} style={styles.modalItem}>• {item}</Text>)}{(matchAdvice?.prompts || []).length ? <Text style={styles.modalHeading}>Conversation starters</Text> : null}{(matchAdvice?.prompts || []).map((item: string) => <Text key={item} style={styles.modalItem}>• {item}</Text>)}<Pressable style={styles.primary} onPress={() => setMatchAdvice(null)}><Text style={styles.primaryText}>Continue</Text></Pressable></View></Pressable></Modal></SafeAreaView>;
}

function CardContent({ card, mode, styles, colors }: { card: CardData; mode: SwipeMode; styles: ReturnType<typeof makeStyles>; colors: ReturnType<typeof useTheme>['colors'] }) {
  const isPerson = mode !== 'student';
  const title = isPerson ? card.full_name || 'Graduate' : card.title || 'Opportunity';
  const subtitle = isPerson ? card.qualification || card.preferred_industry || card.location || 'Graduate profile' : card.employers?.company_name || 'Employer';
  const details = isPerson ? [card.work_experience_summary, card.preferred_industry || card.location, card.preferred_opportunity_type].filter(Boolean) : [card.industry, card.location, card.work_arrangement || card.interests, card.qualification_requirement].filter(Boolean);
  const skills = card.skills || card.required_skills || card.preferred_skills || [];
  return <View style={styles.cardContent}>{card.profile_picture_url ? <Animated.Image source={{ uri: card.profile_picture_url }} style={styles.cardImage} /> : null}<Text style={styles.heading}>{title}</Text><Text style={styles.cardSubtitle}>{subtitle}</Text>{card.match_score != null || card.peer_match_score != null ? <Text style={styles.score}>{card.match_score ?? card.peer_match_score}% Match</Text> : null}<Text style={styles.description}>{card.description || card.work_experience_summary || card.company_description || 'A potential GraduRat match.'}</Text>{details.map((detail: any) => <Text key={String(detail)} style={styles.detail}>{String(detail)}</Text>)}<View style={styles.tags}>{skills.map((skill: string) => <Text key={skill} style={styles.tag}>{skill}</Text>)}</View>{isPerson && (card.projects || card.certifications) ? <Text style={styles.detail}>Projects / certifications: {String(card.projects || card.certifications)}</Text> : null}<Text style={[styles.cardHint, { color: colors.subtle }]}>{isPerson ? 'Profile details and CV access depend on a mutual match.' : 'Swipe right to show interest.'}</Text></View>;
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, page: { flexGrow: 1, padding: 20, gap: 16 }, back: { color: colors.muted, fontWeight: '700' }, eyebrow: { color: colors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 }, title: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: '800' }, switcher: { flexDirection: 'row', gap: 8 }, switchButton: { flex: 1, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingVertical: 11, alignItems: 'center' }, switchActive: { borderColor: colors.blue, backgroundColor: colors.blueDark }, switchText: { color: colors.muted, fontWeight: '700' }, switchTextActive: { color: colors.text }, card: { padding: 20, gap: 12, borderColor: colors.border, borderWidth: 1, borderRadius: 18, backgroundColor: colors.surfaceRaised }, cardContent: { gap: 9 }, cardImage: { width: '100%', height: 180, borderRadius: 12, backgroundColor: colors.surface }, heading: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: '800' }, cardSubtitle: { color: colors.blue, fontWeight: '800' }, score: { color: colors.green, fontSize: 20, fontWeight: '800' }, description: { color: colors.text, lineHeight: 22 }, detail: { color: colors.muted, lineHeight: 20 }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, tag: { color: colors.blue, backgroundColor: colors.blueDark, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 5, fontSize: 11 }, cardHint: { fontSize: 12, lineHeight: 18 }, actions: { flexDirection: 'row', gap: 12, marginTop: 6 }, pass: { flex: 1, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingVertical: 14, alignItems: 'center' }, passText: { color: colors.muted, fontWeight: '800' }, like: { flex: 1, backgroundColor: colors.blue, borderRadius: 8, paddingVertical: 14, alignItems: 'center' }, likeText: { color: colors.text, fontWeight: '800' }, empty: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 12 }, muted: { color: colors.muted, lineHeight: 21 }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 22 }, modal: { width: '100%', gap: 12, padding: 22, borderRadius: 16, backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong, borderWidth: 1 }, modalEyebrow: { color: colors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 }, modalTitle: { color: colors.text, fontSize: 23, fontWeight: '800' }, modalBody: { color: colors.muted, lineHeight: 21 }, modalHeading: { color: colors.text, fontWeight: '800', marginTop: 4 }, modalItem: { color: colors.muted, lineHeight: 20 }, primary: { backgroundColor: colors.blue, borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 6 }, primaryText: { color: colors.text, fontWeight: '800' } });
