import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { loadEmployerOpportunities, Opportunity } from '@/lib/api';
import { getProfileId } from '@/lib/storage';
import { useTheme } from '@/lib/theme';

export default function OpportunitiesScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [items, setItems] = useState<Opportunity[]>([]);
  const [message, setMessage] = useState('Loading opportunities...');
  const [refreshing, setRefreshing] = useState(false);
  const load = async () => { try { const id = await getProfileId('employer'); if (!id) throw new Error('Register an employer profile first.'); const result = await loadEmployerOpportunities(id); setItems(result.opportunities || []); setMessage(''); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load opportunities.'); } };
  useEffect(() => { load(); }, []);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  return <SafeAreaView style={styles.safe}><FlatList data={items} keyExtractor={(item) => item.id} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.blue} />} contentContainerStyle={styles.page} ListHeaderComponent={<><Text style={styles.eyebrow}>OPPORTUNITIES</Text><Text style={styles.title}>Your opportunities</Text><Pressable style={styles.primary} onPress={() => router.push('/post-job')}><Text style={styles.primaryText}>Post opportunity</Text></Pressable></>} ListEmptyComponent={<View style={styles.empty}>{message ? <><ActivityIndicator color={colors.blue} /><Text style={styles.muted}>{message}</Text></> : <Text style={styles.muted}>No opportunities yet.</Text>}</View>} renderItem={({ item }) => <Pressable style={styles.card} onPress={() => router.push({ pathname: '/opportunity/[id]', params: { id: item.id } })}><Text style={styles.heading}>{item.title}</Text><Text style={styles.muted}>{item.type || 'Opportunity'} · {item.status || 'published'}</Text><Text style={styles.muted}>{item.description || 'No description provided.'}</Text><Text style={styles.link}>View applicants →</Text></Pressable>} /></SafeAreaView>;
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, page: { padding: 20, gap: 14 }, eyebrow: { color: colors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 }, title: { color: colors.text, fontSize: 30, fontWeight: '800' }, primary: { alignSelf: 'flex-start', backgroundColor: colors.blue, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 13 }, primaryText: { color: colors.text, fontWeight: '800' }, card: { gap: 8, padding: 18, borderColor: colors.border, borderWidth: 1, borderRadius: 14, backgroundColor: colors.surfaceRaised }, heading: { color: colors.text, fontSize: 18, fontWeight: '800' }, muted: { color: colors.muted, lineHeight: 21 }, link: { color: colors.blue, fontWeight: '800' }, empty: { alignItems: 'center', paddingVertical: 50, gap: 12 } });