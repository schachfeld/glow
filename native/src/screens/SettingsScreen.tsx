import { Linking, StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import {
  ExternalLink,
  House,
  LogOut,
  Palette,
  Radio,
} from "lucide-react-native";
import { useGlow } from "../glow";
import { useSession } from "../session";
import { themes, useColors, useTheme } from "../theme";
import { Choices } from "../components/LightGroupSettings";
import { RouteSettings } from "../components/RouteSettings";
import { Page } from "../components/Overlays";
import { Button, Card, FieldLabel, Title, Txt } from "../components/ui";

export function SettingsScreen() {
  const colors = useColors();
  const { theme, setTheme } = useTheme();
  const { home, mode } = useGlow();
  const session = useSession();
  const demo = mode === "demo";
  const routes = session.client?.routes;
  const host = (() => {
    try {
      return session.saved ? new URL(session.saved.url).host : null;
    } catch {
      return null;
    }
  })();
  return (
    <Page>
      <Title>Settings & help</Title>
      <Card
        style={[
          styles.status,
          !demo &&
            home?.connected && {
              backgroundColor: colors.okBg,
              borderColor: colors.okBorder,
            },
        ]}
      >
        <Radio
          size={23}
          color={!demo && home?.connected ? colors.okInk : colors.muted}
        />
        <View style={{ flex: 1, gap: 3 }}>
          <Txt size={15} weight="semibold">
            {demo
              ? "You’re exploring a demo home"
              : home?.connected
                ? "Connected to Home Assistant"
                : "Waiting for Home Assistant"}
          </Txt>
          <Txt size={13} tone="textSecondary" style={{ lineHeight: 19 }}>
            {demo
              ? "Everything here is interactive. Your real lights are not connected."
              : `Rooms, lights, and existing scenes sync automatically.${host ? ` Signed in to ${host} on this device.` : ""}`}
          </Txt>
        </View>
      </Card>

      {!demo && routes && <RouteSettings control={routes} />}

      <View style={styles.section}>
        <FieldLabel>Appearance</FieldLabel>
        <Choices
          value={theme}
          onChange={setTheme}
          options={themes.map((option) => ({
            id: option.id,
            title: option.name,
            description: option.description,
            preview: option.colors.bg,
          }))}
        />
      </View>

      {demo && (
        <View style={styles.section}>
          <FieldLabel>Connect to Home Assistant</FieldLabel>
          <Txt size={14} tone="textSecondary" style={{ lineHeight: 20 }}>
            Leave the demo and sign in with your Home Assistant account. Glow
            connects to it directly; no add-on, token, dashboard, or YAML setup
            is needed.
          </Txt>
        </View>
      )}

      <View style={styles.section}>
        <FieldLabel>How it works</FieldLabel>
        <Card style={styles.details}>
          <View style={styles.detail}>
            <House size={18} color={colors.leaf} />
            <Txt size={14} tone="textSecondary" style={styles.detailText}>
              <Txt size={14} weight="semibold">
                Your rooms come from Home Assistant Areas.
              </Txt>{" "}
              Lights without an Area appear in “Other lights”.
            </Txt>
          </View>
          <View style={styles.detail}>
            <Palette size={18} color={colors.leaf} />
            {demo ? (
              <Txt size={14} tone="textSecondary" style={styles.detailText}>
                <Txt size={14} weight="semibold">
                  Demo scenes stay in Glow.
                </Txt>{" "}
                Connect to Home Assistant to save scenes for your home.
              </Txt>
            ) : (
              <Txt size={14} tone="textSecondary" style={styles.detailText}>
                <Txt size={14} weight="semibold">
                  Scenes are saved in Home Assistant.
                </Txt>{" "}
                New scenes are available on all devices and in automations. Save
                an older Glow scene to publish it. Favorites and Glow editor
                settings stay on this device.
              </Txt>
            )}
          </View>
        </Card>
        <Button
          kind="text"
          label="About rooms and Areas"
          iconRight={ExternalLink}
          style={{ alignSelf: "flex-start" }}
          onPress={() =>
            Linking.openURL("https://www.home-assistant.io/docs/organizing/")
          }
        />
      </View>

      <Button
        icon={LogOut}
        label={demo ? "Leave demo" : "Disconnect"}
        onPress={session.disconnect}
      />
      <Button
        kind="text"
        label="Imprint"
        style={{ alignSelf: "center" }}
        onPress={() => router.navigate("/settings/imprint")}
      />
      <Txt size={12} tone="faint" style={{ textAlign: "center" }}>
        Glow {Constants.expoConfig?.version}
      </Txt>
    </Page>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: "row", gap: 14, padding: 16 },
  section: { gap: 10 },
  details: { padding: 16, gap: 14 },
  detail: { flexDirection: "row", gap: 12 },
  detailText: { flex: 1, lineHeight: 20 },
});
