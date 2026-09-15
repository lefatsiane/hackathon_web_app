import { Drawer } from 'expo-router/drawer';
import { ThemeProvider, useTheme } from '@/lib/theme';

export default function RootLayout() {
  return <ThemeProvider><ThemedStack /></ThemeProvider>;
}

function ThemedStack() {
  const { colors } = useTheme();
  return (
    <Drawer
      screenOptions={{
        headerShown: false,
        drawerActiveTintColor: colors.blue,
        drawerInactiveTintColor: colors.muted,
        drawerStyle: { backgroundColor: colors.surface },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Drawer.Screen name="(tabs)" options={{ title: 'GraduRat' }} />
      <Drawer.Screen name="post-job" options={{ title: 'Post opportunity' }} />
      <Drawer.Screen name="applications" options={{ title: 'Applications' }} />
      <Drawer.Screen name="settings" options={{ title: 'Settings' }} />
      <Drawer.Screen name="login" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="register" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="index" options={{ drawerItemStyle: { display: 'none' } }} />
    </Drawer>
  );
}
