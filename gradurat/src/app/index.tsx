import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/lib/theme';

const logo = require('@/assets/images/graduRat-logo.jpg');

const futureItems = [
  ['01', 'Discover', 'Explore opportunities built around your skills.'],
  ['02', 'Connect', 'Meet employers and graduates moving in your direction.'],
  ['03', 'Grow', 'Build the next step in your career with confidence.'],
];

export default function HomeScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.navbar}>
          <Image source={logo} contentFit="contain" style={styles.logo} accessibilityLabel="GraduRat" />
          <View style={styles.navActions}>
            <Pressable onPress={() => router.push('/login' as never)} hitSlop={10}>
              <Text style={styles.signIn}>Sign in</Text>
            </Pressable>
            <Pressable style={styles.navButton} onPress={() => router.push('/register')}>
              <Text style={styles.navButtonText}>Get started</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>A CAREER PLATFORM FOR WHAT COMES NEXT</Text>
          <Text style={styles.heroTitle}>Find your{`\n`}<Text style={styles.blue}>future.</Text></Text>
          <Text style={styles.heroCopy}>GraduRat connects graduates with employers based on their qualifications, skills, experience and career goals.</Text>
          <View style={styles.heroActions}>
            <Pressable style={styles.primaryButton} onPress={() => router.push('/register?role=student')}>
              <Text style={styles.primaryText}>I&apos;m a Graduate</Text>
              <Text style={styles.buttonArrow}>→</Text>
            </Pressable>
            <Pressable style={styles.outlineButton} onPress={() => router.push('/register?role=employer')}>
              <Text style={styles.outlineText}>I&apos;m an Employer</Text>
              <Text style={styles.buttonArrow}>→</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.futurePreview}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewLabel}>THE GRADURAT JOURNEY</Text>
            <Text style={styles.previewMark}>GR / 01</Text>
          </View>
          <View style={styles.divider} />
          {futureItems.map(([number, title, copy]) => (
            <View style={styles.futureItem} key={number}>
              <Text style={styles.itemNumber}>{number}</Text>
              <View style={styles.itemBody}>
                <Text style={styles.itemTitle}>{title}</Text>
                <Text style={styles.itemCopy}>{copy}</Text>
              </View>
              <Text style={styles.itemArrow}>↗</Text>
            </View>
          ))}
        </View>

        <View style={styles.proofRow}>
          <View style={styles.proof}><Text style={styles.proofNumber}>01</Text><Text style={styles.proofText}>Skills first matching</Text></View>
          <View style={styles.proof}><Text style={styles.proofNumber}>02</Text><Text style={styles.proofText}>Real opportunities</Text></View>
          <View style={styles.proof}><Text style={styles.proofNumber}>03</Text><Text style={styles.proofText}>Career momentum</Text></View>
        </View>

        <Text style={styles.footer}>© 2026 GraduRat. Connecting talent with opportunity.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { paddingHorizontal: 22, paddingBottom: 34 },
  navbar: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomColor: colors.border, borderBottomWidth: 1 },
  logo: { width: 118, height: 58 },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  signIn: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  navButton: { backgroundColor: colors.blue, borderRadius: 7, paddingHorizontal: 13, paddingVertical: 10 },
  navButtonText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  hero: { paddingTop: 64, paddingBottom: 46 },
  eyebrow: { color: colors.blue, fontSize: 10, fontWeight: '800', letterSpacing: 1.6, lineHeight: 16 },
  heroTitle: { fontSize: 52, lineHeight: 53, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 20 },
  blue: { color: colors.blue },
  heroCopy: { color: colors.muted, fontSize: 16, lineHeight: 26, maxWidth: 430, marginBottom: 27 },
  heroActions: { gap: 11 },
  primaryButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: colors.blue, borderRadius: 7, paddingHorizontal: 20 },
  primaryText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  outlineButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, borderColor: colors.borderStrong, borderWidth: 1, borderRadius: 7, paddingHorizontal: 20 },
  outlineText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  buttonArrow: { color: colors.text, fontSize: 20, lineHeight: 20 },
  futurePreview: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 20, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 5 },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewLabel: { color: colors.blue, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  previewMark: { color: colors.subtle, fontSize: 10, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 18 },
  futureItem: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 19 },
  itemNumber: { color: colors.blue, fontSize: 12, fontWeight: '800', width: 24 },
  itemBody: { flex: 1 },
  itemTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 4 },
  itemCopy: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  itemArrow: { color: colors.blue, fontSize: 19 },
  proofRow: { flexDirection: 'row', gap: 10, marginTop: 38, marginBottom: 34 },
  proof: { flex: 1, gap: 6 },
  proofNumber: { color: colors.blue, fontSize: 11, fontWeight: '800' },
  proofText: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  footer: { color: colors.subtle, textAlign: 'center', fontSize: 11 },
});
