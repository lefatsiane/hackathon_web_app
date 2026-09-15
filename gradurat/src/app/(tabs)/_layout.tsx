import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useTheme } from '@/lib/theme';
import { getActiveProfileRole } from '@/lib/storage';

export default function TabsLayout() {
  const { colors } = useTheme();
  const [role, setRole] = useState<'student' | 'employer' | null>(null);

  useEffect(() => {
    getActiveProfileRole().then(setRole);
  }, []);

  const isEmployer = role === 'employer';

  const icon = (symbol: string, focused: boolean) => (
    <Text style={{ color: focused ? colors.blue : colors.muted, fontSize: 21 }}>{symbol}</Text>
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarItemStyle: { flex: 1, minWidth: 0 },
        tabBarLabelStyle: { display: 'none' },
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { height: 62, paddingTop: 7, paddingBottom: 8, backgroundColor: colors.surface, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarIcon: ({ focused }) => icon('⌂', focused) }} />
      <Tabs.Screen name="careers" options={{ title: 'Careers', href: isEmployer ? null : '/(tabs)/careers', tabBarIcon: ({ focused }) => icon('⌕', focused) }} />
      <Tabs.Screen name="post-job" options={{ title: 'Post job', href: isEmployer ? '/post-job' : null, tabBarIcon: ({ focused }) => icon('+', focused) }} />
      <Tabs.Screen name="opportunities" options={{ title: 'Opportunities', href: isEmployer ? '/opportunities' : null, tabBarIcon: ({ focused }) => icon('▤', focused) }} />
      <Tabs.Screen name="fyp" options={{ title: 'Find people', href: isEmployer ? '/(tabs)/fyp?mode=employer' : '/(tabs)/fyp', tabBarIcon: ({ focused }) => icon('✦', focused) }} />
      <Tabs.Screen name="matches" options={{ title: 'Matches', tabBarIcon: ({ focused }) => icon('♡', focused) }} />
      <Tabs.Screen name="applications" options={{ title: isEmployer ? 'Applicants' : 'Applications', tabBarIcon: ({ focused }) => icon('◎', focused) }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ focused }) => icon('◉', focused) }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ focused }) => icon('⚙', focused) }} />
    </Tabs>
  );
}