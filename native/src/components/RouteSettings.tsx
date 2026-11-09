import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react-native";
import { moveRoute, removeRoute } from "../core";
import type { RouteControl, Routes } from "../platform/client";
import { useSession } from "../session";
import { fonts, useColors } from "../theme";
import { Button, Card, FieldLabel, IconButton, Notice, Txt } from "./ui";

const label = (url: string) => {
  try {
    const { host, pathname } = new URL(url);
    return pathname === "/" ? host : `${host}${pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
};

// The addresses Glow can reach Home Assistant at, such as the home network
// and Tailscale or another VPN. One sign-in works at all of them.
export function RouteSettings({ control }: { control: RouteControl }) {
  const colors = useColors();
  const session = useSession();
  const [state, setState] = useState<Routes>(control.get);
  const [adding, setAdding] = useState(false);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setState(control.get());
    return control.subscribe(setState);
  }, [control]);

  const change = async (next: string[]) => {
    setError("");
    try {
      await session.updateRoutes(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again.");
    }
  };

  const add = async () => {
    setError("");
    setBusy(true);
    try {
      await change(await control.add(address));
      setAddress("");
      setAdding(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add the address.",
      );
    } finally {
      setBusy(false);
    }
  };

  const { routes, current } = state;
  return (
    <View style={styles.section}>
      <FieldLabel>Home Assistant addresses</FieldLabel>
      <Txt size={13} tone="textSecondary" style={styles.hint}>
        Add every address your Home Assistant answers at, such as your home
        network and Tailscale or another VPN. Glow uses the first one in this
        list that answers, and moves back up when an earlier one works again.
        Your sign-in works at all of them.
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
      {adding ? (
        <View style={styles.form}>
          <TextInput
            accessibilityLabel="New Home Assistant address"
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
              label="Add address"
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
        </View>
      ) : (
        <Button
          kind="text"
          icon={Plus}
          label="Add an address"
          style={{ alignSelf: "flex-start" }}
          onPress={() => {
            setError("");
            setAdding(true);
          }}
        />
      )}
      {error ? <Notice kind="error">{error}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
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
