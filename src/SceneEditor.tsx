import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  Bookmark,
  Check,
  ChevronDown,
  Lightbulb,
  Plus,
  Trash2,
} from "lucide-react";
import { whiteToHex } from "../packages/core/color.mjs";
import { ColorWheel } from "./ColorWheel";
import { Brightness, Modal, SceneOrb, Toggle, WhiteSlider } from "./components";
import { plural } from "./format";
import type { Home, Light, LightSettings, Scene } from "./types";

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

  // Closing by accident, with Escape, the backdrop or the back gesture, should
  // not throw away a scene someone has been designing.
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
  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (await onSave({ name, roomId, palette, lights: settings }, scene?.id))
      onClose();
    else setError("The scene could not be saved. Please try again.");
  }
  return (
    <Modal
      title={scene ? "Edit scene" : "Create scene"}
      subtitle={`${room.name} · ${plural(roomLights.length, "light")}`}
      onClose={requestClose}
      wide
    >
      <form onSubmit={save}>
        {home.mode === "live" && (
          <p className="help-note">
            Saved to Home Assistant and available in your automations.
          </p>
        )}
        <label className="field-label" htmlFor="scene-name">
          Scene name
        </label>
        <input
          id="scene-name"
          className="text-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Movie night"
          required
          maxLength={60}
          autoFocus
        />
        <div className="field-heading">
          <span className="field-label">Color presets</span>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              // How the room looked before the editor opened.
              setSelectedMood(null);
              setSettings(original);
            }}
          >
            Use current lights
          </button>
        </div>
        <div className="palette-grid">
          {home.palettes.map((p) => (
            <button
              type="button"
              key={p.id}
              aria-label={`Use ${p.name} palette`}
              aria-pressed={selectedMood === p.id}
              className={`palette-option ${selectedMood === p.id ? "selected" : ""}`}
              onClick={() => usePalette(p.id)}
            >
              <SceneOrb palette={p.id} small />
              <span>{p.name}</span>
              {selectedMood === p.id && <Check size={13} />}
            </button>
          ))}
        </div>
        <div className="field-heading">
          <span className="field-label">Lights</span>
          <span className="subtle">
            Your lights show changes as you make them
          </span>
        </div>
        <div className="scene-light-list">
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
              <div className="scene-light" key={light.id}>
                <div className="scene-light-heading">
                  <Lightbulb size={18} />
                  <span>{light.name}</span>
                  <Toggle
                    label={`Include ${light.name} as on`}
                    on={current.on}
                    onChange={() => setLight(light.id, { on: !current.on })}
                  />
                </div>
                {current.on && (
                  <div className="scene-light-settings">
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
                      <button
                        type="button"
                        className={`scene-color-button ${open ? "open" : ""}`}
                        style={
                          {
                            "--swatch": white
                              ? whiteToHex(kelvin)
                              : current.color,
                          } as CSSProperties
                        }
                        aria-label={`${light.name} scene color`}
                        aria-expanded={open}
                        onClick={() => setPicking(open ? null : light.id)}
                      >
                        <span className="scene-color-dot" />
                        <span>{white ? `${kelvin} K` : "Color"}</span>
                        <ChevronDown size={13} />
                      </button>
                    )}
                  </div>
                )}
                {current.on && open && (
                  <div className="scene-light-picker">
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {errorMessage || error}
          </p>
        )}
        <div className={`modal-footer ${confirm ? "confirming" : ""}`}>
          {confirm ? (
            <div className="delete-confirm" role="alert">
              <p>
                {confirm === "delete" ? (
                  <>
                    Delete “{scene?.name}”
                    {scene?.haSceneId ? " from Home Assistant" : ""}? This
                    cannot be undone.
                  </>
                ) : (
                  "Discard your changes to this scene?"
                )}
              </p>
              <button
                type="button"
                className="text-button"
                onClick={() => setConfirm(null)}
              >
                {confirm === "delete" ? "Keep scene" : "Keep editing"}
              </button>
              <button
                type="button"
                className="button danger-button"
                disabled={busy}
                onClick={confirm === "delete" ? remove : leave}
              >
                {confirm === "delete" ? "Delete scene" : "Discard changes"}
              </button>
            </div>
          ) : (
            <>
              {scene && (
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label="Delete scene"
                  onClick={() => setConfirm("delete")}
                  disabled={busy}
                >
                  <Trash2 size={19} />
                </button>
              )}
              <button
                type="button"
                className="button secondary"
                onClick={requestClose}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy || !name.trim()}
                type="submit"
              >
                {scene ? <Bookmark size={17} /> : <Plus size={17} />}
                {busy ? "Saving…" : "Save scene"}
              </button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}
