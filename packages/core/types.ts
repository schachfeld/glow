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
export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";
// Times are "HH:MM"; a block that runs to the end of the day ends at "24:00".
export type TimeBlock = { from: string; to: string };
export type ScheduleDays = Record<Weekday, TimeBlock[]>;
// Lights that turn on at the start of each block and off at its end. It
// controls either a whole room or chosen lights.
export type Schedule = {
  id: string;
  entityId?: string;
  name: string;
  enabled: boolean;
  // Inside one of its blocks right now, as Home Assistant reports it.
  active: boolean;
  // When it next turns on or off, in Home Assistant's time zone.
  nextEvent: string | null;
  days: ScheduleDays;
  roomId: string | null;
  lightIds: string[];
};
export type Palette = {
  id: string;
  name: string;
  colors: string[];
  brightness: number;
  kelvin?: number;
};
export type Home = {
  rooms: Room[];
  lights: Light[];
  groups?: LightGroup[];
  scenes: Scene[];
  schedules?: Schedule[];
  palettes: Palette[];
  mode: "demo" | "live";
  connected: boolean;
  error: string | null;
};
