import type { GroupDisplay, Home, Scene, Schedule } from "./types";
import type { HomeAssistant } from "./home-assistant.mjs";
export interface SceneData {
  scenes: Scene[];
  favorites: Record<string, boolean>;
  groupDisplay?: Record<string, GroupDisplay>;
  // Only the demo home keeps schedules here; a real home keeps them in Home
  // Assistant.
  schedules?: Schedule[];
}
export interface SceneStore {
  data: SceneData;
  save(data: SceneData): void | Promise<void>;
}
export interface GlowCore {
  state(): Home;
  subscribe(callback: (home: Home) => void): () => void;
  execute(method: string, path: string, body?: object): Promise<unknown>;
  close(): void;
}
export function createCore(options: {
  ha?: HomeAssistant | null;
  store: SceneStore;
  randomUUID?: () => string;
  broadcastDelayMs?: number;
}): GlowCore;
