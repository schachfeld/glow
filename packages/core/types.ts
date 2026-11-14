export type LightSettings = {
  on: boolean;
  brightness: number;
  color: string;
  kelvin: number;
  colorMode: "rgb" | "color_temp";
};
export type Light = LightSettings & {
  id: string;
  name: string;
  roomId: string;
  available: boolean;
  dimmable: boolean;
  colorSupported: boolean;
  temperatureSupported: boolean;
  minKelvin: number;
  maxKelvin: number;
};
export type Room = { id: string; name: string; style: string };
export type GroupDisplay = "group" | "individual";
export type LightGroup = Light & {
  memberIds: string[];
  display: GroupDisplay;
};
export type Scene = {
  id: string;
  haSceneId?: string;
  entityId?: string;
  name: string;
  roomId: string | null;
  palette: string;
  favorite: boolean;
  source: "glow" | "home-assistant";
  lights: Record<string, LightSettings>;
};
export type Palette = {
  id: string;
  name: string;
  colors: string[];
  brightness: number;
  kelvin?: number;
};
// What turning a light off in Glow's list of lights does: hide it in Home
// Assistant, disable it there, or only leave it out of Glow on this device.
export type HideMode = "hide" | "disable" | "local";
export type ListedLight = {
  id: string;
  name: string;
  room: string | null;
  // What keeps the light out of Glow, if anything.
  hidden: HideMode | null;
};
export type ListedSwitch = {
  id: string;
  name: string;
  room: string | null;
  // The light a Home Assistant helper shows this switch as.
  lightId: string | null;
};
// Every light and switch in Home Assistant, including the ones Glow leaves out.
export type Inventory = {
  hideMode: HideMode;
  lights: ListedLight[];
  switches: ListedSwitch[];
};
export type Home = {
  rooms: Room[];
  lights: Light[];
  groups?: LightGroup[];
  inventory?: Inventory;
  scenes: Scene[];
  palettes: Palette[];
  mode: "demo" | "live";
  connected: boolean;
  error: string | null;
};
