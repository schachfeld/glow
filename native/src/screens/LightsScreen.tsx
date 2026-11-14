import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Choices } from "../components/LightGroupSettings";
import { Page } from "../components/Overlays";
import { Button, Card, FieldLabel, Title, Toggle, Txt } from "../components/ui";
import type { HideMode } from "../core";
import { useGlow } from "../glow";
import { useSession } from "../session";
import { useColors } from "../theme";

const hiddenLabel: Record<HideMode, string> = {
  hide: "Hidden in Home Assistant",
  disable: "Disabled in Home Assistant",
  local: "Hidden on this device",
};

function Row({
  first,
  name,
  detail,
  children,
}: {
  first: boolean;
  name: string;
  detail: string;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.row,
        !first && {
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth * 2,
        },
      ]}
    >
      <View style={styles.name}>
        <Txt size={15} weight="medium" numberOfLines={1}>
          {name}
        </Txt>
        {detail ? (
          <Txt size={12} tone="muted" numberOfLines={1}>
            {detail}
          </Txt>
        ) : null}
      </View>
      {children}
    </View>
  );
}

// Which of Home Assistant's lights Glow shows, and which switches it shows
// as lights. Both are changed in Home Assistant, so every device follows.
export function LightsScreen() {
  const { home, setToast } = useGlow();
  const client = useSession().client;
  // Rows being changed, with the position their switch is moving to.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [savingMode, setSavingMode] = useState(false);
  const inventory = home?.inventory;
  const disabled = !home?.connected;
  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/settings");

  const run = async <T,>(
    id: string,
    target: boolean,
    path: string,
    body: object,
    done: (result: T) => string,
  ) => {
    if (!client) return;
    setPending((all) => ({ ...all, [id]: target }));
    try {
      const result = (await client.execute("PUT", path, body)) as T;
      setToast({ message: done(result), error: false });
    } catch (error) {
      setToast({
        message:
          error instanceof Error
            ? error.message
            : "Could not complete that action.",
        error: true,
      });
    } finally {
      setPending(({ [id]: _, ...rest }) => rest);
    }
  };

  return (
    <Page>
      <Button
        kind="plain"
        icon={ArrowLeft}
        label="Settings"
        onPress={back}
        style={styles.back}
      />
      <Title>Lights & switches</Title>
      {!inventory ? (
        <Txt size={14} tone="textSecondary">
          Lights and switches are available when you’re connected to Home
          Assistant.
        </Txt>
      ) : (
        <>
          <View style={styles.section}>
            <FieldLabel>Switches</FieldLabel>
            <Txt size={13} tone="textSecondary" style={styles.hint}>
              A lamp on a smart plug is a switch in Home Assistant. Show it as a
              light, and Glow adds a helper in Home Assistant that turns the
              switch into a light in the same room.
            </Txt>
            {inventory.switches.length ? (
              <Card>
                {inventory.switches.map((item, index) => {
                  const on = pending[item.id] ?? Boolean(item.lightId);
                  return (
                    <Row
                      key={item.id}
                      first={index === 0}
                      name={item.name}
                      detail={[item.room, item.lightId && "Shown as a light"]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      <Toggle
                        on={on}
                        label={`Show ${item.name} as a light`}
                        disabled={disabled || item.id in pending}
                        onChange={() =>
                          run(
                            item.id,
                            !on,
                            "switch-light",
                            { id: item.id, light: !on },
                            () =>
                              on
                                ? `${item.name} is a switch again`
                                : `${item.name} is now a light`,
                          )
                        }
                      />
                    </Row>
                  );
                })}
              </Card>
            ) : (
              <Txt size={13} tone="muted">
                Home Assistant has no switches to show as lights.
              </Txt>
            )}
          </View>

          <View style={styles.section}>
            <FieldLabel>Lights</FieldLabel>
            <Txt size={13} tone="textSecondary" style={styles.hint}>
              Turn a light off here to take it out of Glow’s rooms and scenes.
            </Txt>
            {inventory.lights.length ? (
              <Card>
                {inventory.lights.map((light, index) => {
                  const on = pending[light.id] ?? !light.hidden;
                  return (
                    <Row
                      key={light.id}
                      first={index === 0}
                      name={light.name}
                      detail={[
                        light.room,
                        light.hidden && hiddenLabel[light.hidden],
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      <Toggle
                        on={on}
                        label={`Show ${light.name} in Glow`}
                        disabled={
                          light.id in pending ||
                          // A light hidden only on this device comes back
                          // without Home Assistant.
                          (disabled && light.hidden !== "local")
                        }
                        onChange={() =>
                          run<{ restart?: boolean; reloadSeconds?: number }>(
                            light.id,
                            !on,
                            "light-shown",
                            { id: light.id, shown: !on },
                            (result) =>
                              on
                                ? `${light.name} is out of Glow`
                                : result.restart
                                  ? `${light.name} comes back after Home Assistant restarts`
                                  : result.reloadSeconds
                                    ? `${light.name} comes back in about ${result.reloadSeconds} seconds`
                                    : `${light.name} is back in Glow`,
                          )
                        }
                      />
                    </Row>
                  );
                })}
              </Card>
            ) : (
              <Txt size={13} tone="muted">
                Home Assistant has no lights yet.
              </Txt>
            )}
          </View>

          <View style={styles.section}>
            <FieldLabel>When you turn a light off here</FieldLabel>
            <Choices<HideMode>
              value={inventory.hideMode}
              disabled={savingMode}
              options={[
                {
                  id: "hide",
                  title: "Hide it in Home Assistant",
                  description:
                    "It leaves Glow on every device and Home Assistant’s dashboards. Automations and scenes keep working.",
                },
                {
                  id: "disable",
                  title: "Disable it in Home Assistant",
                  description:
                    "Home Assistant removes the light, so automations and scenes stop using it. It takes a moment to come back.",
                },
                {
                  id: "local",
                  title: "Hide it on this device only",
                  description:
                    "Nothing changes in Home Assistant or on your other devices.",
                },
              ]}
              onChange={async (mode) => {
                if (!client || mode === inventory.hideMode) return;
                setSavingMode(true);
                try {
                  await client.execute("PUT", "hide-mode", { mode });
                } catch (error) {
                  setToast({
                    message:
                      error instanceof Error
                        ? error.message
                        : "Could not save that setting.",
                    error: true,
                  });
                } finally {
                  setSavingMode(false);
                }
              }}
            />
          </View>
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: "flex-start", marginBottom: -8 },
  section: { gap: 10 },
  hint: { lineHeight: 19 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  name: { flex: 1, gap: 2, minWidth: 0 },
});
