import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowRight,
  Check,
  Lightbulb,
  LockKeyhole,
  Wifi,
} from "lucide-react-native";
import { useSession } from "../session";
import { fonts, useColors } from "../theme";
import { Button, FieldLabel, Notice, Txt } from "../components/ui";
import { AddAddress } from "../components/RouteSettings";

const icon = require("../../assets/icon.png");

const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export function ConnectScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const s = useSession();
  const returning = Boolean(s.saved);
  const locked = s.busy || s.checking;
  const input = [
    styles.input,
    {
      color: colors.text,
      backgroundColor: colors.surface,
      borderColor: colors.borderStrong,
      fontFamily: fonts.regular,
    },
  ];
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.page,
          { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 },
        ]}
      >
        <View style={styles.brand}>
          <Image source={icon} style={styles.brandMark} />
          <View>
            <Txt size={26} weight="bold" style={{ letterSpacing: -1.3 }}>
              glow
            </Txt>
            <Txt size={13} tone="leaf">
              Your home, in a good light
            </Txt>
          </View>
        </View>
        <View style={styles.art}>
          <View style={[styles.halo, { backgroundColor: colors.glowHalo }]} />
          <Lightbulb size={64} strokeWidth={1.2} color={colors.glowInk} />
        </View>
        <Txt
          accessibilityRole="header"
          size={30}
          weight="semibold"
          style={{ letterSpacing: -0.8 }}
        >
          {returning
            ? "Welcome home."
            : s.authorized
              ? "You’re signed in."
              : "A little closer to home."}
        </Txt>
        <Txt size={15} tone="textSecondary" style={{ lineHeight: 22 }}>
          {s.saved
            ? s.busy
              ? `Opening your home at ${host(s.saved.url)}…`
              : `Glow is signed in to ${host(s.saved.url)} on this device.`
            : s.authorized
              ? "Choose whether to stay signed in, then open your home."
              : "Sign in with your Home Assistant account to bring your rooms and lights into view."}
        </Txt>

        <View style={styles.form}>
          {!returning && !s.authorized && (
            <>
              <FieldLabel>Home Assistant address</FieldLabel>
              <TextInput
                accessibilityLabel="Home Assistant address"
                value={s.url}
                onChangeText={s.setUrl}
                placeholder="http://homeassistant.local:8123"
                placeholderTextColor={colors.faint}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!locked}
                style={input}
              />
              {s.method === "token" ? (
                <>
                  <FieldLabel>Long-lived access token</FieldLabel>
                  <TextInput
                    accessibilityLabel="Long-lived access token"
                    value={s.token}
                    onChangeText={s.setToken}
                    placeholder="Paste your access token"
                    placeholderTextColor={colors.faint}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!locked}
                    style={input}
                  />
                  <Txt size={13} tone="muted" style={styles.hint}>
                    Create a long-lived access token in your Home Assistant
                    profile, under Security. Use an account that can view your
                    rooms and control your lights.
                  </Txt>
                </>
              ) : (
                <Txt size={13} tone="muted" style={styles.hint}>
                  You’ll sign in securely on Home Assistant’s own page in your
                  browser. Glow never sees your password.
                </Txt>
              )}
            </>
          )}
          {s.authorized && (
            <Txt size={13} tone="muted" style={styles.hint}>
              Home Assistant: {s.authorized.connection.url}
            </Txt>
          )}
          {!returning && s.secure && (s.method === "token" || s.authorized) && (
            <>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel="Stay signed in on this device"
                accessibilityState={{ checked: s.remember, disabled: locked }}
                disabled={locked}
                onPress={() => s.setRemember(!s.remember)}
                style={styles.checkRow}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: s.remember
                        ? colors.accent
                        : colors.borderStrong,
                      backgroundColor: s.remember
                        ? colors.accent
                        : "transparent",
                    },
                  ]}
                >
                  {s.remember && (
                    <Check size={14} color={colors.onAccent} strokeWidth={3} />
                  )}
                </View>
                <Txt size={15}>Stay signed in on this device</Txt>
              </Pressable>
              {s.remember && (
                <View style={styles.lockHint}>
                  <LockKeyhole size={14} color={colors.muted} />
                  <Txt
                    size={13}
                    tone="muted"
                    style={[styles.hint, { flex: 1 }]}
                  >
                    Your sign-in is kept in this device’s secure storage, so
                    Glow opens your home straight away next time.
                  </Txt>
                </View>
              )}
            </>
          )}
          {s.authorizing && (
            <Txt
              size={13}
              tone="textSecondary"
              accessibilityLiveRegion="polite"
              style={styles.hint}
            >
              Finish signing in in your browser. You’ll return to Glow
              automatically.
            </Txt>
          )}
          {s.error ? <Notice kind="error">{s.error}</Notice> : null}
          <Button
            kind="primary"
            disabled={locked}
            loading={s.busy && !s.authorizing}
            iconRight={ArrowRight}
            onPress={s.submit}
            style={{ marginTop: 6 }}
            label={
              s.checking
                ? "Getting ready…"
                : s.authorizing
                  ? "Waiting for sign-in…"
                  : s.busy
                    ? "Connecting…"
                    : s.saved || s.authorized
                      ? "Open my home"
                      : s.method === "account"
                        ? "Sign in with Home Assistant"
                        : "Connect to my home"
            }
          />
          {s.busy && <Button label="Cancel" onPress={s.cancel} />}
          {!returning && !s.authorized && !s.busy && (
            <Button
              kind="text"
              disabled={s.checking}
              onPress={s.switchMethod}
              label={
                s.method === "account"
                  ? "Use an access token instead"
                  : "Use account sign-in"
              }
            />
          )}
          {s.authorized && !s.busy && (
            <Button
              kind="text"
              label="Use a different account"
              onPress={s.cancel}
            />
          )}
          {returning && !s.busy && !s.checking && (
            <AddAddress
              center
              label="Add another address"
              submitLabel="Add and connect"
              hint="Away from home? Add the address you reach Home Assistant at over Tailscale or another VPN. Your saved sign-in works there too."
              onAdd={s.addAddress}
            />
          )}
          {returning && !s.busy && (
            <Button
              kind="text"
              disabled={s.checking}
              label="Forget saved connection"
              onPress={s.forget}
            />
          )}
          {!s.busy && !s.authorized && (
            <Button
              kind="plain"
              disabled={s.checking}
              label="Explore a demo home"
              onPress={s.openDemo}
            />
          )}
        </View>
        <View style={[styles.footnote, { borderColor: colors.border }]}>
          <Wifi size={18} color={colors.muted} />
          <Txt size={13} tone="muted" style={{ flex: 1, lineHeight: 19 }}>
            Connect directly to your Home Assistant. No Glow add-on required.
            Save scenes to Home Assistant for use on all your devices.
          </Txt>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 24,
    gap: 12,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandMark: { width: 32, height: 32, borderRadius: 10 },
  art: {
    height: 150,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
  },
  halo: { position: "absolute", width: 120, height: 120, borderRadius: 60 },
  form: { gap: 10, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  hint: { lineHeight: 19 },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  lockHint: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  footnote: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 16,
    marginTop: 12,
    borderTopWidth: 1,
  },
});
