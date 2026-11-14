import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  lightTargets,
  plural,
  useLiveLights,
  type Home,
  type Light,
  type LightSettings,
  type Scene,
  type Schedule,
} from "./core";
import type { GlowClient } from "./platform/client";

export type Toast = {
  message: string;
  error: boolean;
  action?: { label: string; run: () => void };
};

// Sends settings to lights, groups or a whole room. Resolves false on failure,
// after the error has already been shown.
export type LightsAction = (
  lights: Light[],
  settings: Partial<LightSettings>,
) => Promise<boolean>;

// The settings that bring a light back exactly as it was.
function restoreSettings(light: Light): Partial<LightSettings> {
  return {
    on: true,
    ...(light.dimmable ? { brightness: light.brightness } : {}),
    ...(light.colorMode === "color_temp" && light.temperatureSupported
      ? { colorMode: "color_temp", kelvin: light.kelvin }
      : light.colorSupported
        ? { colorMode: "rgb", color: light.color }
        : {}),
  };
}

// Everything the screens share: the live home, light commands with
// optimistic updates, scene actions, the open dialogs, and notifications.
function useGlowState(client: GlowClient) {
  const [liveHome, setHome] = useState<Home | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState(false);
  const [sceneEditor, setSceneEditor] = useState<{
    roomId: string;
    scene?: Scene;
  } | null>(null);
  const [scheduleEditor, setScheduleEditor] = useState<{
    schedule?: Schedule;
  } | null>(null);
  const [lightEditor, setLightEditor] = useState<string | null>(null);
  const [customizeRoom, setCustomizeRoom] = useState<string | null>(null);

  useEffect(() => client.subscribe(setHome), [client]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(
      () => setToast(null),
      toast.error ? 8000 : toast.action ? 7000 : 3500,
    );
    return () => clearTimeout(timer);
  }, [toast]);

  const showError = useCallback(
    (error: unknown) =>
      setToast({
        message:
          error instanceof Error
            ? error.message
            : "Could not complete that action.",
        error: true,
      }),
    [],
  );
  const action = useCallback(
    async (
      path: string,
      body: object = {},
      method = "POST",
      success?: string,
      lock = true,
    ) => {
      if (lock) setBusy(true);
      try {
        await client.execute(method, path, body);
        if (success) setToast({ message: success, error: false });
        return true;
      } catch (error) {
        showError(error);
        return false;
      } finally {
        if (lock) setBusy(false);
      }
    },
    [client, showError],
  );
  const sendLights = useCallback(
    (ids: string[], settings: Partial<LightSettings>) =>
      client.execute("POST", "lights", { ids, settings }),
    [client],
  );
  const { home, control, predict } = useLiveLights(
    liveHome,
    sendLights,
    showError,
  );

  const lightsAction: LightsAction = (lights, settings) => {
    if (!home) return Promise.resolve(false);
    const targets = lightTargets(
      home,
      lights.map((l) => l.id),
    ).filter((l) => l.available);
    return control(
      targets.map((l) => l.id),
      settings,
      [...targets, ...lights].map((l) => l.id),
    );
  };

  async function activateScene(scene: Scene) {
    const settle =
      scene.source === "glow"
        ? predict(Object.entries(scene.lights))
        : () => {};
    const ok = await action(
      `scenes/${encodeURIComponent(scene.id)}/activate`,
      {},
      "POST",
      `${scene.name} applied`,
      false,
    );
    settle(ok);
  }

  const favoriteScene = (scene: Scene) =>
    action(
      `scenes/${encodeURIComponent(scene.id)}/favorite`,
      { favorite: !scene.favorite },
      "POST",
      undefined,
      false,
    );

  // Turning everything off is easy to do by accident, so offer an undo that
  // restores each light's brightness and color.
  async function allLightsOff() {
    if (!home) return;
    const lit = home.lights.filter((l) => l.on && l.available);
    if (!lit.length) return;
    const previous = lit.map((l) => [l.id, restoreSettings(l)] as const);
    if (!(await lightsAction(lit, { on: false }))) return;
    setToast({
      message: `Turned off ${plural(lit.length, "light")}`,
      error: false,
      action: {
        label: "Undo",
        run: () => {
          setToast(null);
          // One command per distinct look, like a scene.
          const batches = new Map<
            string,
            { ids: string[]; settings: Partial<LightSettings> }
          >();
          for (const [id, settings] of previous) {
            const key = JSON.stringify(settings);
            const batch = batches.get(key) ?? { ids: [], settings };
            batch.ids.push(id);
            batches.set(key, batch);
          }
          for (const batch of batches.values())
            control(batch.ids, batch.settings);
        },
      },
    });
  }

  // The scene editor shows its settings on the room's lights as they change.
  // Each light gets its own command stream, so its changes arrive in order.
  function previewLights(lights: Record<string, LightSettings>) {
    for (const [id, settings] of Object.entries(lights))
      if (home?.lights.some((l) => l.id === id && l.available))
        control([id], settings.on ? { ...settings, on: true } : { on: false });
  }

  return {
    mode: client.mode,
    home,
    disabled: !home?.connected,
    busy,
    toast,
    setToast,
    action,
    lightsAction,
    activateScene,
    favoriteScene,
    allLightsOff,
    previewLights,
    sceneEditor,
    openSceneEditor: (roomId: string, scene?: Scene) =>
      setSceneEditor({ roomId, scene }),
    closeSceneEditor: () => setSceneEditor(null),
    scheduleEditor,
    openScheduleEditor: (schedule?: Schedule) =>
      setScheduleEditor({ schedule }),
    closeScheduleEditor: () => setScheduleEditor(null),
    lightEditor,
    openLightEditor: setLightEditor,
    closeLightEditor: () => setLightEditor(null),
    customizeRoom,
    openCustomizeRoom: setCustomizeRoom,
    closeCustomizeRoom: () => setCustomizeRoom(null),
  };
}

export type Glow = ReturnType<typeof useGlowState>;
const GlowContext = createContext<Glow | null>(null);

export function GlowProvider({
  client,
  children,
}: {
  client: GlowClient;
  children: ReactNode;
}) {
  const glow = useGlowState(client);
  return <GlowContext.Provider value={glow}>{children}</GlowContext.Provider>;
}

export const useGlow = () => useContext(GlowContext)!;
