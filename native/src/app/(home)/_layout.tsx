import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import {
  CalendarClock,
  LayoutGrid,
  Palette,
  Settings2,
} from "lucide-react-native";
import { GlowProvider } from "../../glow";
import { useSession } from "../../session";
import { fonts, useColors } from "../../theme";
import { Overlays, ToastView } from "../../components/Overlays";

export default function HomeLayout() {
  const { client } = useSession();
  if (!client) return null;
  return (
    <GlowProvider client={client}>
      {Platform.OS === "ios" ? <GlassTabs /> : <BarTabs />}
      <Overlays />
      <ToastView />
    </GlowProvider>
  );
}

// iOS uses the system tab bar, which is Liquid Glass on iOS 26 and later.
// The system draws its background and adapts it to the content behind it.
function GlassTabs() {
  const colors = useColors();
  return (
    <NativeTabs
      tintColor={colors.accentDark}
      labelStyle={{ fontFamily: fonts.medium }}
      minimizeBehavior="never"
    >
      <NativeTabs.Trigger
        name="(rooms)"
        contentStyle={{ backgroundColor: colors.bg }}
      >
        <NativeTabs.Trigger.Label>Rooms</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="scenes"
        contentStyle={{ backgroundColor: colors.bg }}
      >
        <NativeTabs.Trigger.Label>Scenes</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "paintpalette", selected: "paintpalette.fill" }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="automations"
        contentStyle={{ backgroundColor: colors.bg }}
      >
        <NativeTabs.Trigger.Label>Automations</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{
            default: "calendar.badge.clock",
            selected: "calendar.badge.clock",
          }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="settings"
        accessibilityLabel="Settings & help"
        contentStyle={{ backgroundColor: colors.bg }}
      >
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "gearshape", selected: "gearshape.fill" }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

// Android keeps the JavaScript tab bar in the app's own colors.
function BarTabs() {
  const colors = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentDark,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.bar,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="(rooms)"
        options={{
          title: "Rooms",
          tabBarIcon: ({ color, size }) => (
            <LayoutGrid color={color} size={size - 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="scenes"
        options={{
          title: "Scenes",
          tabBarIcon: ({ color, size }) => (
            <Palette color={color} size={size - 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="automations"
        options={{
          title: "Automations",
          tabBarIcon: ({ color, size }) => (
            <CalendarClock color={color} size={size - 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarAccessibilityLabel: "Settings & help",
          tabBarIcon: ({ color, size }) => (
            <Settings2 color={color} size={size - 2} />
          ),
        }}
      />
    </Tabs>
  );
}
