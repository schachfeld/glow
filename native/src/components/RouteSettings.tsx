import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Plus,
  Route,
  Trash2,
} from "lucide-react-native";
import { moveRoute, removeRoute } from "../core";
import type { RouteControl, Routes } from "../platform/client";
import { useSession } from "../session";
import { fonts, useColors } from "../theme";
import { Button, Card, IconButton, Notice, Txt } from "./ui";

const label = (url: string) => {
  try {
    const { host, pathname } = new URL(url);
    return pathname === "/" ? host : `${host}${pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
};

function useRoutes(control: RouteControl) {
  const [state, setState] = useState<Routes>(control.get);
  useEffect(() => {
    setState(control.get());
    return control.subscribe(setState);
  }, [control]);
  return state;
}

// The Settings row that opens the routes screen.
export function RoutesLink({ control }: { control: RouteControl }) {
  const colors = useColors();
  const { routes, current } = useRoutes(control);
  const summary =
    routes.length === 1
      ? `1 route: ${label(current)}`
      : `${routes.length} routes, using ${label(current)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Routes"
      accessibilityHint={summary}
      onPress={() => router.navigate("/settings/routes")}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
    >
      <Card style={styles.link}>
        <Route size={20} color={colors.leaf} strokeWidth={1.8} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={15} weight="semibold">
            Routes
          </Txt>
          <Txt size={13} tone="textSecondary" numberOfLines={1}>
            {summary}
          </Txt>
        </View>
        <ChevronRight size={18} color={colors.muted} strokeWidth={1.8} />
      </Card>
    </Pressable>
  );
}

// The routes Glow can reach Home Assistant over, such as the home network
// and Tailscale or another VPN. One sign-in works at all of them.
export function RouteSettings({ control }: { control: RouteControl }) {
  const colors = useColors();
  const session = useSession();
  const state = useRoutes(control);
  const [error, setError] = useState("");

  const change = async (next: string[]) => {
    setError("");
    try {
      await session.updateRoutes(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again.");
    }
  };

  const { routes, current } = state;
  return (
    <View style={styles.section}>
      <Txt size={13} tone="textSecondary" style={styles.hint}>
        Glow connects over the first route in this list that answers, and moves
        back up when an earlier one works again. It adds the routes Home
        Assistant knows, such as its Tailscale address. Add others, such as
        another VPN, yourself. Your sign-in works on every route.
      </Txt>
      <Card>
        {routes.map((route, index) => {
          const name = label(route);
          return (
            <View
              key={route}
              style={[
                styles.row,
                index > 0 && {
                  borderTopColor: colors.border,
                  borderTopWidth: StyleSheet.hairlineWidth * 2,
                },
              ]}
            >
              <View style={styles.name}>
                <Txt
                  size={15}
                  weight="medium"
                  numberOfLines={1}
                  style={{ flexShrink: 1 }}
                >
                  {name}
                </Txt>
                {route === current && (
                  <Txt
                    size={11}
                    weight="medium"
                    tone="okInk"
                    style={[
                      styles.badge,
                      {
                        borderColor: colors.okBorder,
                        backgroundColor: colors.okBg,
                      },
                    ]}
                  >
                    In use
                  </Txt>
                )}
              </View>
              {routes.length > 1 && (
                <View style={styles.tools}>
                  <IconButton
                    icon={ArrowUp}
                    label={`Try ${name} earlier`}
                    disabled={index === 0}
                    onPress={() => change(moveRoute(routes, route, -1))}
                    style={styles.tool}
                  />
                  <IconButton
                    icon={ArrowDown}
                    label={`Try ${name} later`}
                    disabled={index === routes.length - 1}
                    onPress={() => change(moveRoute(routes, route, 1))}
                    style={styles.tool}
                  />
                  <IconButton
                    icon={Trash2}
                    label={`Remove ${name}`}
                    onPress={() => change(removeRoute(routes, route))}
                    style={styles.tool}
                  />
                </View>
              )}
            </View>
          );
        })}
      </Card>
      <AddAddress
        onAdd={async (address) => {
          await session.updateRoutes(await control.add(address));
        }}
      />
      {error ? <Notice kind="error">{error}</Notice> : null}
    </View>
  );
}

// A button that opens a field for another Home Assistant address. `onAdd`
// checks and adds it, and throws a message to show when it cannot.
export function AddAddress({
  onAdd,
  label = "Add a route",
  submitLabel = "Add route",
  hint,
  center = false,
}: {
  onAdd: (address: string) => Promise<void>;
  label?: string;
  submitLabel?: string;
  hint?: string;
  center?: boolean;
}) {
  const colors = useColors();
  const [adding, setAdding] = useState(false);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const add = async () => {
    setError("");
    setBusy(true);
    try {
      await onAdd(address);
      setAddress("");
      setAdding(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add the route.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!adding)
    return (
      <Button
        kind="text"
        icon={Plus}
        label={label}
        style={{ alignSelf: center ? "center" : "flex-start" }}
        onPress={() => {
          setError("");
          setAdding(true);
        }}
      />
    );
  return (
    <View style={styles.form}>
      {hint ? (
        <Txt size={13} tone="textSecondary" style={styles.hint}>
          {hint}
        </Txt>
      ) : null}
      <TextInput
        accessibilityLabel="Address for the new route"
        value={address}
        onChangeText={setAddress}
        placeholder="http://100.64.0.1:8123"
        placeholderTextColor={colors.faint}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        editable={!busy}
        onSubmitEditing={add}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            fontFamily: fonts.regular,
          },
        ]}
      />
      <View style={styles.buttons}>
        <Button
          kind="primary"
          label={submitLabel}
          loading={busy}
          disabled={busy || !address.trim()}
          onPress={add}
          style={{ flex: 1 }}
        />
        <Button
          label="Cancel"
          disabled={busy}
          onPress={() => {
            setAdding(false);
            setAddress("");
            setError("");
          }}
        />
      </View>
      {error ? <Notice kind="error">{error}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    minHeight: 64,
  },
  hint: { lineHeight: 19 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 56,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
  },
  name: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: "hidden",
  },
  tools: { flexDirection: "row" },
  tool: { width: 44, height: 44 },
  form: { gap: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  buttons: { flexDirection: "row", gap: 10 },
});
