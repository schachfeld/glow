import "../polyfills";
import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  useFonts,
} from "@expo-google-fonts/dm-sans";
import { SessionProvider, useSession } from "../session";
import { SmoothingProvider } from "../smoothing";
import { ThemeProvider, useColors } from "../theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

function Root() {
  const colors = useColors();
  const { client, checking } = useSession();
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, [colors.bg]);
  useEffect(() => {
    if (!checking || client) SplashScreen.hideAsync().catch(() => {});
  }, [checking, client]);
  return (
    <>
      <StatusBar style={colors.statusBar} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "fade",
        }}
      >
        <Stack.Protected guard={!client}>
          <Stack.Screen name="connect" />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(client)}>
          <Stack.Screen name="(home)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <SmoothingProvider>
            <SessionProvider>
              <Root />
            </SessionProvider>
          </SmoothingProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
