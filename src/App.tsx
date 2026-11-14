import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ChevronRight,
  CircleHelp,
  House,
  LayoutGrid,
  LoaderCircle,
  Palette,
  RotateCcw,
  Settings2,
  Sun,
  WifiOff,
  X,
} from "lucide-react";
import { lightTargets } from "../packages/core/groups.mjs";
import { lightCommand } from "../packages/core/transition.mjs";
import { ConnectionHelp } from "./ConnectionHelp";
import { dialogsSettled } from "./dialogs";
import { plural } from "./format";
import { LightEditor } from "./LightEditor";
import { LightGroupSettings } from "./LightGroupSettings";
import { RoomPage } from "./RoomPage";
import { RoomsPage, type RoomFilter } from "./RoomsPage";
import { SceneCard } from "./SceneCard";
import { SceneEditor } from "./SceneEditor";
import { ScenesPage, type SceneFilter } from "./ScenesPage";
import type { Home, Light, LightSettings, Scene } from "./types";

import { serverClient, type GlowClient } from "./platform/client";
import { useLiveLights } from "./live";
import { lightTransition } from "./transition";
// The add-on build has no src-tauri/, so use the copy of the app icon in public/.
const glowIcon = `${import.meta.env.BASE_URL}favicon.svg`;

type Toast = {
  message: string;
  error: boolean;
  action?: { label: string; run: () => void };
};

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

function readRoute(): { page: "rooms" | "scenes"; roomId: string | null } {
  const [, page, id] = window.location.hash.slice(1).split("/");
  try {
    return {
      page: page === "scenes" ? "scenes" : "rooms",
      roomId: page === "rooms" && id ? decodeURIComponent(id) : null,
    };
  } catch {
    return { page: "rooms", roomId: null };
  }
}

export default function App({
  client = serverClient,
  onDisconnect,
}: {
  client?: GlowClient;
  onDisconnect?: () => void;
}) {
  const [liveHome, setHome] = useState<Home | null>(null);
  const [streamOnline, setStreamOnline] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState<"rooms" | "scenes">(() => readRoute().page);
  const [roomId, setRoomId] = useState<string | null>(() => readRoute().roomId);
  const [filter, setFilter] = useState<RoomFilter>("all");
  const [sceneFilter, setSceneFilter] = useState<SceneFilter>("all");
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [editor, setEditor] = useState<{
    roomId: string;
    scene?: Scene;
  } | null>(null);
  const [lightEditor, setLightEditor] = useState<string | null>(null);
  const [customizeRoom, setCustomizeRoom] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  // Only saving scenes and preferences blocks input. Light controls stay live.
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const updateRoute = () => {
      const next = readRoute();
      setPage(next.page);
      setRoomId(next.roomId);
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", updateRoute);
    return () => window.removeEventListener("hashchange", updateRoute);
  }, []);
  useEffect(() => {
    return client.subscribe(
      (next) => {
        setHome(next);
        setStreamOnline(true);
        setLoadError("");
      },
      (message) => {
        setStreamOnline(false);
        setLoadError(message);
      },
    );
  }, [client]);
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
      client.execute(
        "POST",
        "lights",
        lightCommand(ids, settings, lightTransition()),
      ),
    [client],
  );
  const { home, control, predict } = useLiveLights(
    liveHome,
    sendLights,
    showError,
  );
  const lightsAction = (lights: Light[], settings: Partial<LightSettings>) => {
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
  function navigate(next: "rooms" | "scenes", nextRoom: string | null = null) {
    const hash = `/${next}${nextRoom ? `/${encodeURIComponent(nextRoom)}` : ""}`;
    // A dialog that just closed may still be stepping back through history.
    dialogsSettled().then(() => {
      window.location.hash = hash;
    });
    setPage(next);
    setRoomId(nextRoom);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const room = home?.rooms.find((r) => r.id === roomId);
  useEffect(() => {
    document.title = room
      ? `${room.name} · Glow`
      : page === "scenes"
        ? "Scenes · Glow"
        : "Glow · Your home, in a good light";
  }, [room?.name, page]);
  const disabled = !home?.connected || !streamOnline;
  const currentGroup = home?.groups?.find((group) => group.id === lightEditor);
  const currentLight =
    home?.lights.find((l) => l.id === lightEditor) ?? currentGroup;

  function renderScene(scene: Scene) {
    return (
      <SceneCard
        key={scene.id}
        scene={scene}
        home={home!}
        inRoom={Boolean(room)}
        disabled={disabled}
        onActivate={activateScene}
        onFavorite={(scene) =>
          action(
            `scenes/${encodeURIComponent(scene.id)}/favorite`,
            { favorite: !scene.favorite },
            "POST",
            undefined,
            false,
          )
        }
        onEdit={(scene) => setEditor({ roomId: scene.roomId!, scene })}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => navigate("rooms")}
          aria-label="Glow home"
        >
          <img className="brand-mark" src={glowIcon} alt="" />
          <span>
            glow<span className="brand-period">.</span>
          </span>
        </button>
        <div className="home-label">
          <span className="home-mini-icon">
            <House size={16} />
          </span>
          <div>My home</div>
        </div>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${page === "rooms" ? "selected" : ""}`}
            aria-current={page === "rooms" ? "page" : undefined}
            onClick={() => navigate("rooms")}
          >
            <LayoutGrid size={19} />
            <span>Rooms</span>
            {home && <span className="nav-count">{home.rooms.length}</span>}
          </button>
          <button
            className={`nav-item ${page === "scenes" ? "selected" : ""}`}
            aria-current={page === "scenes" ? "page" : undefined}
            onClick={() => navigate("scenes")}
          >
            <Palette size={19} />
            <span>All scenes</span>
          </button>
          {/* Phones hide the sidebar footer, so settings get their own button here. */}
          <button
            className="nav-item phone-settings"
            aria-label="Settings & help"
            onClick={() => setConnectionOpen(true)}
          >
            <Settings2 size={19} />
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setConnectionOpen(true)}>
            <Settings2 size={18} />
            <span>Settings & help</span>
          </button>
          <div className="powered-by">
            <span
              className={`status-dot ${home?.connected && streamOnline ? "" : "offline"}`}
            />
            <span>Home Assistant</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <House size={15} />
            <span>My home</span>
            <ChevronRight size={13} />
            <span>
              {room ? room.name : page === "rooms" ? "Rooms" : "Scenes"}
            </span>
          </div>
          <button
            className={`connection-pill ${!home?.connected || !streamOnline ? "disconnected" : ""}`}
            onClick={() => setConnectionOpen(true)}
          >
            <span className="status-dot" />
            {home?.mode === "demo"
              ? "Demo home"
              : home?.connected && streamOnline
                ? "Home Assistant connected"
                : "Connecting…"}
            <ChevronRight size={12} />
          </button>
        </header>
        <main>
          {!home ? (
            <div className="loading-state">
              <Sun className="loading-sun" size={42} />
              <h1>Loading lights</h1>
              <p>{loadError || "Connecting to your home…"}</p>
              {loadError && (
                <button
                  className="button secondary"
                  onClick={() => location.reload()}
                >
                  Try again
                </button>
              )}
            </div>
          ) : (
            <>
              {(!home.connected || !streamOnline) && (
                <div className="connection-warning" role="status">
                  <WifiOff size={19} />
                  <div>
                    <strong>Reconnecting to your home</strong>
                    <p>
                      {home.error ||
                        loadError ||
                        "Controls will be available as soon as the connection is restored."}
                    </p>
                  </div>
                </div>
              )}
              {room ? (
                <RoomPage
                  home={home}
                  room={room}
                  disabled={disabled}
                  onBack={() => navigate("rooms")}
                  onLightsChange={lightsAction}
                  onAdjustLight={setLightEditor}
                  onCustomize={() => setCustomizeRoom(room.id)}
                  onCreateScene={() => setEditor({ roomId: room.id })}
                  renderScene={renderScene}
                />
              ) : page === "rooms" ? (
                <RoomsPage
                  home={home}
                  disabled={disabled}
                  filter={filter}
                  onFilterChange={setFilter}
                  onOpenRoom={(id) => navigate("rooms", id)}
                  onHelp={() => setConnectionOpen(true)}
                  onLightsChange={lightsAction}
                  onAllOff={allLightsOff}
                />
              ) : (
                <ScenesPage
                  home={home}
                  filter={sceneFilter}
                  onFilterChange={setSceneFilter}
                  onShowRooms={() => navigate("rooms")}
                  renderScene={renderScene}
                />
              )}
            </>
          )}
        </main>
      </div>
      {home && customizeRoom && (
        <LightGroupSettings
          groups={
            home.groups?.filter((group) => group.roomId === customizeRoom) ?? []
          }
          lights={home.lights}
          roomName={
            home.rooms.find((item) => item.id === customizeRoom)?.name ?? ""
          }
          busy={busy}
          deviceLocal={client.sceneStorage === "device"}
          onClose={() => setCustomizeRoom(null)}
          onChange={(groupId, display) =>
            action("group-display", { groupId, display }, "PUT")
          }
        />
      )}
      {connectionOpen && (
        <ConnectionHelp
          home={home}
          sceneStorage={client.sceneStorage}
          onDisconnect={onDisconnect}
          onClose={() => setConnectionOpen(false)}
        />
      )}
      {home && editor && home.rooms.some((r) => r.id === editor.roomId) && (
        <SceneEditor
          home={home}
          roomId={editor.roomId}
          scene={editor.scene}
          busy={busy}
          errorMessage={toast?.error ? toast.message : undefined}
          onClose={() => setEditor(null)}
          onPreview={previewLights}
          onSave={(body, id) =>
            action(
              id ? `scenes/${encodeURIComponent(id)}` : "scenes",
              body,
              id ? "PUT" : "POST",
              id ? "Scene updated" : "Scene saved",
            )
          }
          onDelete={(id) =>
            action(
              `scenes/${encodeURIComponent(id)}`,
              {},
              "DELETE",
              "Scene deleted",
            )
          }
        />
      )}
      {currentLight && (
        <LightEditor
          light={currentLight}
          members={
            home && currentGroup
              ? lightTargets(home, currentGroup.memberIds)
              : undefined
          }
          roomName={home?.rooms.find((r) => r.id === currentLight.roomId)?.name}
          disabled={disabled}
          error={toast?.error ? toast.message : undefined}
          onChange={lightsAction}
          onClose={() => setLightEditor(null)}
        />
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <CircleHelp size={18} /> : <Check size={18} />}
          <span>{toast.message}</span>
          {toast.action && (
            <button className="toast-action" onClick={toast.action.run}>
              <RotateCcw size={13} />
              {toast.action.label}
            </button>
          )}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {busy && (
        <div className="busy-indicator" role="status">
          <LoaderCircle size={16} aria-hidden="true" />
          <span className="visually-hidden">Saving changes</span>
        </div>
      )}
    </div>
  );
}
