import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useTheme } from "@/lib/theme";
import { Avatar } from "@/components/avatar";
import {
  generateAiFeedback,
  loadEmployerDashboard,
  loadStudentDashboard,
  Opportunity,
  Student,
} from "@/lib/api";
import { getProfileId } from "@/lib/storage";

const initials = (name: string, fallback = "GR") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || fallback;

const Stat = ({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: string;
  label: string;
  value: string | number;
  note: string;
  tone: string;
}) => {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: tone }]}>
        <Text style={styles.statIconText}>{icon}</Text>
      </View>
      <View style={styles.statCopy}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.muted}>{note}</Text>
      </View>
    </View>
  );
};

const OpportunityCard = ({ item }: { item: Opportunity }) => {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={styles.companyLogo}>
          <Text style={styles.companyLogoText}>
            {initials(item.employers?.company_name || "Employer")}
          </Text>
        </View>
        <View style={styles.cardMain}>
          <View style={styles.cardTitleRow}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.muted}>
                {item.employers?.company_name || "Employer"} · {item.type || "Opportunity"}
              </Text>
            </View>
            <Text style={styles.save}>♡</Text>
          </View>
          <View style={styles.tags}>
            {(item.required_skills || []).map((skill) => (
              <Text style={styles.tag} key={skill}>
                {skill}
              </Text>
            ))}
          </View>
          <Text style={styles.reason}>
            {item.reasoning || item.description || "A new opportunity on GraduRat."}
          </Text>
          <View style={styles.cardBottom}>
            <Text style={styles.muted}>{item.type || "Opportunity"}</Text>
            <Text style={styles.muted}>
              {item.description
                ?.split("\n")
                .find((line) => line.startsWith("Location:"))
                ?.replace("Location: ", "") || "Location flexible"}
            </Text>
            <Text style={styles.match}>
              {item.match_score === undefined ? "New" : `${item.match_score}% Match`}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const CandidateCard = ({
  candidate,
}: {
  candidate: Student & {
    match_score?: number;
    matching_skills?: string[];
    reasoning?: string;
  };
}) => {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Avatar
          name={candidate.full_name}
          profileId={candidate.id}
          profileType="students"
          url={candidate.profile_picture_url}
          size={42}
        />
        <View style={styles.cardMain}>
          <View style={styles.cardTitleRow}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{candidate.full_name || "Graduate"}</Text>
              <Text style={styles.muted}>
                {candidate.qualification || "Graduate profile"}
              </Text>
            </View>
            <Text style={styles.match}>{candidate.match_score}% Match</Text>
          </View>
          <View style={styles.tags}>
            {(candidate.skills || []).map((skill) => (
              <Text style={styles.tag} key={skill}>
                {skill}
              </Text>
            ))}
          </View>
          <Text style={styles.reason}>
            {candidate.reasoning || candidate.matching_skills?.join(", ") || "Skills developing"}
          </Text>
          <View style={styles.cardBottom}>
            <Text style={styles.muted}>Open to work</Text>
            <Pressable onPress={() => {}}>
              <Text style={styles.link}>View Profile →</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
};

export default function DashboardScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { role = "student" } = useLocalSearchParams<{ role?: string }>();
  const isStudent = role !== "employer";
  const { width } = useWindowDimensions();
  const compact = width < 700;

  const [name, setName] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [allOpportunities, setAllOpportunities] = useState<Opportunity[]>([]);
  const [dashboardPage, setDashboardPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [candidates, setCandidates] = useState<
    (Student & {
      match_score?: number;
      matching_skills?: string[];
      reasoning?: string;
    })[]
  >([]);
  const [stats, setStats] = useState({ first: 0, second: 0 });
  const [aiFeedback, setAiFeedback] = useState<{
    summary?: string;
    strengths?: string[];
    gaps?: string[];
    next_steps?: string[];
  } | null>(null);
  const [aiNote, setAiNote] = useState<string[]>([]);
  const [state, setState] = useState<"loading" | "error" | "content">("loading");
  const [message, setMessage] = useState("Loading your dashboard...");

  const loadDashboard = async () => {
    setRefreshing(true);
    try {
      const id = await getProfileId(isStudent ? "student" : "employer");
      if (!id) throw new Error("Register a profile before opening the dashboard.");
      setProfileId(id);

      if (isStudent) {
        const result = await loadStudentDashboard(id);
        setName(result.student.full_name);
        setProfilePictureUrl(result.student.profile_picture_url || null);
        setAllOpportunities(result.opportunities);
        setDashboardPage(1);
        setOpportunities(result.opportunities.slice(0, 3));
        setCandidates([]);
        setStats({
          first: result.stats.matches,
          second: result.stats.opportunities,
        });
        setAiFeedback(null);
        setAiNote([]);

        try {
          const feedback = await generateAiFeedback({
            subjectType: "student",
            subject: result.student,
            targetType: "opportunity",
            target: result.opportunities[0] || null,
          });
          setAiFeedback(feedback.assessment as typeof aiFeedback);
        } catch {
          setAiFeedback(null);
        }
      } else {
        const result = await loadEmployerDashboard(id);
        setName(result.employer.company_name);
        setProfilePictureUrl(result.employer.profile_picture_url || null);
        setAllOpportunities(result.opportunities);
        setDashboardPage(1);
        setOpportunities(result.opportunities.slice(0, 3));
        setCandidates(result.candidates as typeof candidates);
        setStats({
          first: result.stats.active_jobs,
          second: result.stats.candidates,
        });

        try {
          const feedback = await generateAiFeedback({
            subjectType: "employer",
            subject: result.employer,
            targetType: "employer",
            target: null,
          });
          setAiFeedback(feedback.assessment as typeof aiFeedback);
          const strengths = Array.isArray((feedback as { assessment?: { strengths?: string[] } }).assessment?.strengths)
            ? (feedback as { assessment?: { strengths?: string[] } }).assessment!.strengths!
            : [];
          setAiNote(strengths.length ? strengths.slice(0, 3) : [
            "Your company profile is already competitive.",
            "Highlight the employee experience and hiring story more clearly.",
            "Publish clearer role expectations to improve candidate response rates.",
          ]);
        } catch {
          setAiFeedback(null);
          setAiNote([
            "Your company profile is already competitive.",
            "Highlight the employee experience and hiring story more clearly.",
            "Publish clearer role expectations to improve candidate response rates.",
          ]);
        }
      }

      setState("content");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not load dashboard.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;

    (async () => {
      if (!active) return;
      setState("loading");
      setMessage("Loading your dashboard...");
      try {
        await loadDashboard();
      } finally {
        if (!active) return;
      }
    })();

    return () => {
      active = false;
    };
  }, [isStudent, refreshKey]);

  const totalDashboardPages = Math.max(1, Math.ceil(allOpportunities.length / 3));

  const setDashboardPageAndItems = (nextPage: number) => {
    const safePage = Math.max(1, Math.min(totalDashboardPages, nextPage));
    setDashboardPage(safePage);
    setOpportunities(allOpportunities.slice((safePage - 1) * 3, safePage * 3));
  };

  const refreshDashboard = () => {
    setRefreshing(true);
    setRefreshKey((value) => value + 1);
  };

  if (state === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.blue} />
        <Text style={styles.muted}>{message}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.safe, compact && styles.safeCompact]}>
      <ScrollView
        contentContainerStyle={[styles.main, compact && styles.mainCompact]}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshDashboard} tintColor={colors.blue} />}
      >
        <View style={styles.topbar}>
          <View style={styles.user}>
            {profileId ? (
              <Pressable onPress={() => router.push(`/profile?role=${isStudent ? "student" : "employer"}`)}>
                <Avatar
                  name={name || (isStudent ? "Graduate" : "Employer")}
                  profileId={profileId}
                  profileType={isStudent ? "students" : "employers"}
                  url={profilePictureUrl}
                  size={36}
                />
              </Pressable>
            ) : null}
            <View>
              <Text style={styles.userName}>{name || (isStudent ? "Graduate" : "Employer")}</Text>
              <Text style={styles.muted}>{isStudent ? "Job Seeker" : "Employer"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.welcome}>
            <View style={styles.flex}>
              <Text style={styles.smallTitle}>{isStudent ? "GRADURAT AI" : "EMPLOYER PORTAL"}</Text>
              <Text style={styles.heading}>
                {isStudent ? (
                  <>
                    Welcome back, <Text style={styles.blue}> {name || "Graduate"}.</Text>
                  </>
                ) : (
                  <>
                    Find your next <Text style={styles.blue}>great hire.</Text>
                  </>
                )}
              </Text>
              <Text style={styles.muted}>
                {isStudent
                  ? "We've found new opportunities that match your skills and career preferences."
                  : "GraduRat has found graduates whose skills match your organisation needs."}
              </Text>
            </View>
            {!isStudent && (
              <Pressable style={styles.primary} onPress={() => router.push("/post-job")}>
                <Text style={styles.primaryText}>+ Post a Job</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.stats}>
            <Stat
              icon="✦"
              label={isStudent ? "AI MATCHES" : "ACTIVE JOBS"}
              value={stats.first}
              note={isStudent ? "+6 this week" : "Current opportunities"}
              tone={colors.blueDark}
            />
            <Stat
              icon={isStudent ? "♡" : "✦"}
              label={isStudent ? "SAVED JOBS" : "AI CANDIDATE MATCHES"}
              value={isStudent ? 0 : stats.second}
              note={isStudent ? "Saved locally" : "50%+ match"}
              tone="#352060"
            />
            <Stat icon="✓" label="APPLICATIONS" value={0} note="Coming soon" tone="#064c3d" />
            <Stat
              icon="★"
              label={isStudent ? "PROFILE SCORE" : "SAVED CANDIDATES"}
              value={isStudent ? "33%" : 0}
              note={isStudent ? "Complete your profile" : "Saved locally"}
              tone="#633c12"
            />
          </View>

          {aiFeedback && (
            <View style={styles.aiPanel}>
              <Text style={styles.smallTitle}>GROQ AI FEEDBACK</Text>
              <Text style={styles.aiSummary}>{aiFeedback.summary || "Your profile has been reviewed."}</Text>
              <View style={styles.aiColumns}>
                <View style={styles.aiColumn}>
                  <Text style={styles.aiHeading}>Strengths</Text>
                  {(aiFeedback.strengths || []).map((item) => (
                    <Text key={item} style={styles.aiItem}>• {item}</Text>
                  ))}
                </View>
                <View style={styles.aiColumn}>
                  <Text style={styles.aiHeading}>Focus next</Text>
                  {[...(aiFeedback.gaps || []), ...(aiFeedback.next_steps || [])].map((item) => (
                    <Text key={item} style={styles.aiItem}>• {item}</Text>
                  ))}
                </View>
              </View>
            </View>
          )}

          {state === "error" ? (
            <View style={styles.empty}>
              <Text style={styles.error}>{message}</Text>
              <Pressable
                style={styles.primary}
                onPress={() => router.replace(`/(tabs)/dashboard?role=${isStudent ? "student" : "employer"}`)}
              >
                <Text style={styles.primaryText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.list}>
              <View style={styles.sectionHeading}>
                <View>
                  <Text style={styles.smallTitle}>{isStudent ? "AI POWERED" : "GRADURAT AI"}</Text>
                  <Text style={styles.sectionTitle}>
                    {isStudent
                      ? "Recommended for you"
                      : !aiNote.length
                        ? "Company profile review"
                        : "Company profile strengths"}
                  </Text>
                </View>
                <Text style={styles.link}>View all →</Text>
              </View>

              {!isStudent && aiNote.length > 0 && (
                <View style={styles.aiCard}>
                  {aiNote.map((item) => (
                    <Text key={item} style={styles.aiPoint}>• {item}</Text>
                  ))}
                </View>
              )}

              {isStudent
                ? opportunities.map((item) => <OpportunityCard key={item.id} item={item} />)
                : candidates
                    .filter((candidate) => (candidate.match_score || 0) >= 50)
                    .map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} />)}

              {isStudent && opportunities.length === 0 && (
                <Text style={styles.muted}>No matching opportunities yet. Check back soon.</Text>
              )}
              {!isStudent && candidates.length === 0 && (
                <Text style={styles.muted}>No candidate matches yet. Publish a job to start matching.</Text>
              )}

              {isStudent && totalDashboardPages > 1 && (
                <View style={styles.pagination}>
                  <Pressable
                    disabled={dashboardPage === 1}
                    onPress={() => setDashboardPageAndItems(dashboardPage - 1)}
                    style={[styles.pageButton, dashboardPage === 1 && styles.pageButtonDisabled]}
                  >
                    <Text style={styles.pageButtonText}>Previous</Text>
                  </Pressable>
                  <Text style={styles.pageLabel}>Page {dashboardPage} of {totalDashboardPages}</Text>
                  <Pressable
                    disabled={dashboardPage === totalDashboardPages}
                    onPress={() => setDashboardPageAndItems(dashboardPage + 1)}
                    style={[styles.pageButton, dashboardPage === totalDashboardPages && styles.pageButtonDisabled]}
                  >
                    <Text style={styles.pageButtonText}>Next</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    safeCompact: { flexDirection: 'column' },
    blue: { color: colors.blue },
    main: { flexGrow: 1, paddingBottom: 24 },
    mainCompact: { width: '100%' },
    topbar: {
      minHeight: 74,
      padding: 17,
      borderBottomColor: '#0d192c',
      borderBottomWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 16,
    },
    user: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    companyLogoText: { color: colors.text, fontWeight: '800', fontSize: 12 },
    userName: { color: colors.text, fontWeight: '700' },
    content: { padding: 28, gap: 25 },
    welcome: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 18,
    },
    flex: { flex: 1 },
    smallTitle: {
      color: '#7daeff',
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
    },
    heading: { fontSize: 32, lineHeight: 38, fontWeight: '800', color: colors.text, marginVertical: 8 },
    muted: { color: colors.muted, fontSize: 13, lineHeight: 20 },
    primary: {
      alignSelf: 'flex-start',
      backgroundColor: '#1265e9',
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 13,
    },
    primaryText: { color: colors.text, fontWeight: '800' },
    stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    stat: {
      width: '48%',
      minWidth: 0,
      padding: 15,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 10,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      gap: 9,
    },
    statIcon: {
      width: 34,
      height: 34,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statIconText: { color: colors.text, fontSize: 17 },
    statCopy: { flex: 1, minWidth: 0, gap: 2 },
    statLabel: { color: colors.subtle, fontSize: 10, lineHeight: 13, fontWeight: '800', flexShrink: 1 },
    statValue: { color: colors.text, fontSize: 24, fontWeight: '800' },
    aiPanel: { gap: 12, padding: 17, borderColor: colors.borderStrong, borderWidth: 1, borderRadius: 10, backgroundColor: colors.surfaceRaised },
    aiSummary: { color: colors.text, fontSize: 14, lineHeight: 21 },
    aiColumns: { flexDirection: 'row', gap: 14 },
    aiColumn: { flex: 1, minWidth: 0, gap: 6 },
    aiHeading: { color: colors.text, fontWeight: '800' },
    aiItem: { color: colors.muted, fontSize: 12, lineHeight: 18, flexShrink: 1 },
    aiCard: {
      padding: 14,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 10,
      backgroundColor: colors.surface,
      gap: 8,
    },
    aiPoint: { color: colors.muted, fontSize: 12, lineHeight: 19 },
    list: { gap: 14 },
    sectionHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    sectionTitle: { color: colors.text, fontSize: 21, lineHeight: 26, fontWeight: '800', marginTop: 4 },
    link: { color: '#7daeff', fontWeight: '700', fontSize: 12 },
    pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 },
    pageButton: { borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
    pageButtonDisabled: { opacity: 0.45 },
    pageButtonText: { color: colors.blue, fontSize: 12, fontWeight: '800' },
    pageLabel: { color: colors.muted, fontSize: 12 },
    card: {
      padding: 17,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 10,
      backgroundColor: colors.surface,
      gap: 12,
    },
    cardRow: { flexDirection: 'row', gap: 12 },
    companyLogo: {
      width: 42,
      height: 42,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.blueDark,
    },
    candidateAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#352060',
    },
    cardMain: { flex: 1, gap: 10 },
    cardTitleRow: { flexDirection: 'row', gap: 10 },
    cardTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
    save: { color: colors.subtle, fontSize: 22 },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tag: {
      color: '#9ac7ff',
      backgroundColor: colors.blueDark,
      borderRadius: 5,
      paddingHorizontal: 8,
      paddingVertical: 5,
      fontSize: 11,
    },
    reason: { color: colors.muted, fontSize: 12, lineHeight: 18 },
    cardBottom: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    match: { color: colors.green, fontWeight: '800', fontSize: 12 },
    empty: { padding: 24, gap: 15, borderColor: colors.border, borderWidth: 1, borderRadius: 10 },
    error: { color: colors.danger, lineHeight: 20 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.background },
  });

