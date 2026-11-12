import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import {
  Bookmark,
  Check,
  ChevronDown,
  Lightbulb,
  Plus,
  Trash2,
} from "lucide-react-native";
import {
  plural,
  whiteToHex,
  type Home,
  type Light,
  type LightSettings,
  type Scene,
} from "../core";
import { fonts, useColors } from "../theme";
import { SceneOrb } from "./art";
import { ColorWheel } from "./ColorWheel";
import { Sheet } from "./Sheet";
import { Brightness, WhiteSlider } from "./Slider";
import { Button, FieldLabel, IconButton, Notice, Toggle, Txt } from "./ui";

export function snapshot(light: Light): LightSettings {
  return {
    on: light.on,
    brightness: light.brightness,
    color: light.color,
    kelvin: light.kelvin,
    colorMode: light.colorMode,
  };
}

export function SceneEditor({
  home,
  roomId,
  scene,
  onClose,
  onSave,
  onDelete,
  onPreview,
  busy,
  errorMessage,
}: {
  home: Home;
  roomId: string;
  scene?: Scene;
  onClose: () => void;
  // Shows settings on the room's lights while the scene is being designed.
  onPreview: (lights: Record<string, LightSettings>) => void;
  onSave: (data: object, id?: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  busy: boolean;
  errorMessage?: string;
}) {
  const colors = useColors();
  const room = home.rooms.find((r) => r.id === roomId)!;
  const roomLights = home.lights.filter((l) => l.roomId === roomId);
  const [name, setName] = useState(scene?.name ?? "");
  const [palette, setPalette] = useState(scene?.palette ?? "warm");
  const [selectedMood, setSelectedMood] = useState<string | null>(
    scene?.palette ?? null,
  );
  const [settings, setSettings] = useState<Record<string, LightSettings>>(() =>
    Object.fromEntries(
      roomLights.map((l) => [l.id, scene?.lights[l.id] ?? snapshot(l)]),
    ),
  );
  const [confirm, setConfirm] = useState<"delete" | "discard" | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState("");

  // The lights show the scene as it is designed. Only lights whose settings
  // changed are sent. Leaving without saving puts the room back as it was.
  const [original] = useState(() =>
    Object.fromEntries(roomLights.map((l) => [l.id, snapshot(l)])),
  );
  const shown = useRef<Record<string, LightSettings>>(original);
  const show = (next: Record<string, LightSettings>) => {
    const changes = Object.fromEntries(
      Object.entries(next).filter(
        ([id, value]) =>
          JSON.stringify(value) !== JSON.stringify(shown.current[id]),
      ),
    );
    shown.current = next;
    if (Object.keys(changes).length) onPreview(changes);
  };
  useEffect(() => show(settings), [settings]);
  const leave = () => {
    show(original);
    onClose();
  };

  // Closing by accident, with the back gesture or the backdrop, should not
  // throw away a scene someone has been designing.
  const [initial] = useState(() => JSON.stringify({ name, palette, settings }));
  const dirty = JSON.stringify({ name, palette, settings }) !== initial;
  const requestClose = () => (dirty ? setConfirm("discard") : leave());
  async function remove() {
    if (scene && (await onDelete(scene.id))) leave();
    else setError("The scene could not be deleted. Please try again.");
  }
  const setLight = (id: string, patch: Partial<LightSettings>) =>
    setSettings((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  function usePalette(id: string) {
    const p = home.palettes.find((p) => p.id === id)!;
    setPalette(id);
    setSelectedMood(id);
    setSettings(
      Object.fromEntries(
        roomLights.map((l, index) => [
          l.id,
          {
            on: true,
            brightness: p.brightness,
            color: p.colors[index % p.colors.length],
            kelvin: Math.max(
              l.minKelvin,
              Math.min(l.maxKelvin, p.kelvin ?? 2700),
            ),
            colorMode:
              p.kelvin && l.temperatureSupported ? "color_temp" : "rgb",
          },
        ]),
      ),
    );
    if (!name) setName(p.name);
  }
  async function save() {
    setError("");
    if (!name.trim()) return;
    if (await onSave({ name, roomId, palette, lights: settings }, scene?.id))
      onClose();
    else setError("The scene could not be saved. Please try again.");
  }

  const footer = confirm ? (
    <View style={styles.confirm} accessibilityRole="alert">
      <Txt size={14} style={{ lineHeight: 20 }}>
        {confirm === "delete"
          ? `Delete “${scene?.name}”${scene?.haSceneId ? " from Home Assistant" : ""}? This cannot be undone.`
          : "Discard your changes to this scene?"}
      </Txt>
      <View style={styles.footerRow}>
        <Button
          kind="text"
          label={confirm === "delete" ? "Keep scene" : "Keep editing"}
          onPress={() => setConfirm(null)}
        />
        <Button
          kind="danger"
          label={confirm === "delete" ? "Delete scene" : "Discard changes"}
          disabled={busy}
          loading={busy && confirm === "delete"}
          onPress={confirm === "delete" ? remove : leave}
        />
      </View>
    </View>
  ) : (
    <>
      {scene && (
        <IconButton
          icon={Trash2}
          label="Delete scene"
          color={colors.dangerInk}
          disabled={busy}
          onPress={() => setConfirm("delete")}
          style={{ marginRight: "auto" }}
        />
      )}
      <Button label="Cancel" onPress={requestClose} />
      <Button
        kind="primary"
        icon={scene ? Bookmark : Plus}
        label={busy ? "Saving…" : "Save scene"}
        accessibilityLabel="Save scene"
        disabled={busy || !name.trim()}
        onPress={save}
      />
    </>
  );

  return (
    <Sheet
      title={scene ? "Edit scene" : "Create scene"}
      subtitle={`${room.name} · ${plural(roomLights.length, "light")}`}
      onClose={requestClose}
      footer={footer}
    >
      {home.mode === "live" && (
        <Notice>
          Saved to Home Assistant and available in your automations.
        </Notice>
      )}
      <View style={{ gap: 8 }}>
        <FieldLabel>Scene name</FieldLabel>
        <TextInput
          accessibilityLabel="Scene name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Movie night"
          placeholderTextColor={colors.faint}
          maxLength={60}
          returnKeyType="done"
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
      </View>
      <View style={styles.heading}>
        <FieldLabel>Color presets</FieldLabel>
        <Button
          kind="text"
          label="Use current lights"
          onPress={() => {
            // How the room looked before the editor opened.
            setSelectedMood(null);
            setSettings(original);
          }}
        />
      </View>
      <View style={styles.palettes}>
        {home.palettes.map((p) => {
          const selected = selectedMood === p.id;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`Use ${p.name} palette`}
              accessibilityState={{ selected }}
              onPress={() => usePalette(p.id)}
              style={[
                styles.palette,
                {
                  backgroundColor: selected ? colors.selected : colors.surface,
                  borderColor: selected ? colors.borderSelected : colors.border,
                },
              ]}
            >
              <SceneOrb palette={p.id} size={34} />
              <Txt
                size={13}
                weight="medium"
                style={{ flex: 1 }}
                numberOfLines={1}
                color={selected ? colors.selectedInk : undefined}
              >
                {p.name}
              </Txt>
              {selected && <Check size={14} color={colors.selectedInk} />}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.heading}>
        <FieldLabel>Lights</FieldLabel>
        <Txt
          size={12}
          tone="muted"
          style={{ flexShrink: 1, textAlign: "right" }}
        >
          Your lights show changes as you make them
        </Txt>
      </View>
      <View style={{ gap: 10 }}>
        {roomLights.map((light) => {
          const current = settings[light.id];
          const white =
            current.colorMode === "color_temp" && light.temperatureSupported;
          const kelvin = Math.max(
            light.minKelvin,
            Math.min(light.maxKelvin, current.kelvin),
          );
          const open = picking === light.id;
          return (
            <View
              key={light.id}
              style={[
                styles.light,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.lightHeading}>
                <Lightbulb size={18} color={colors.muted} />
                <Txt size={15} weight="medium" style={{ flex: 1 }}>
                  {light.name}
                </Txt>
                <Toggle
                  label={`Include ${light.name} as on`}
                  on={current.on}
                  onChange={() => setLight(light.id, { on: !current.on })}
                />
              </View>
              {current.on && (
                <View style={styles.lightSettings}>
                  {light.dimmable && (
                    <Brightness
                      value={current.brightness}
                      label={`${light.name} scene brightness`}
                      onChange={(brightness) =>
                        setLight(light.id, { brightness })
                      }
                      compact
                    />
                  )}
                  {(light.colorSupported || light.temperatureSupported) && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${light.name} scene color`}
                      accessibilityState={{ expanded: open }}
                      onPress={() => setPicking(open ? null : light.id)}
                      style={[
                        styles.colorButton,
                        {
                          borderColor: open
                            ? colors.borderSelected
                            : colors.borderStrong,
                          backgroundColor: open ? colors.selected : colors.bg,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.dot,
                          {
                            backgroundColor: white
                              ? whiteToHex(kelvin)
                              : current.color,
                          },
                        ]}
                      />
                      <Txt size={12} weight="medium" tone="textSecondary">
                        {white ? `${kelvin} K` : "Color"}
                      </Txt>
                      <ChevronDown size={13} color={colors.muted} />
                    </Pressable>
                  )}
                </View>
              )}
              {current.on && open && (
                <View style={{ gap: 14, paddingTop: 4 }}>
                  {light.colorSupported && (
                    <ColorWheel
                      compact
                      color={current.color}
                      white={white}
                      label={`${light.name} scene color wheel`}
                      onChange={(color) =>
                        setLight(light.id, { color, colorMode: "rgb" })
                      }
                    />
                  )}
                  {light.temperatureSupported && (
                    <WhiteSlider
                      compact
                      value={kelvin}
                      min={light.minKelvin}
                      max={light.maxKelvin}
                      inactive={!white}
                      label={`${light.name} scene white temperature`}
                      onChange={(value) =>
                        setLight(light.id, {
                          kelvin: value,
                          colorMode: "color_temp",
                        })
                      }
                    />
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>
      {error ? <Notice kind="error">{errorMessage || error}</Notice> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 6,
  },
  palettes: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  palette: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    paddingRight: 12,
    borderRadius: 14,
    borderWidth: 1,
    width: "48.5%",
  },
  light: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  lightHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  // The brightness slider gets the full width, with the color button below it.
  lightSettings: { gap: 8 },
  colorButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  dot: { width: 16, height: 16, borderRadius: 8 },
  confirm: { flex: 1, gap: 10 },
  footerRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
  },
});
