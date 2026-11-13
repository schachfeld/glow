// Glow's lighting core, shared with the web app and the Home Assistant add-on.
export * from "../../packages/core/types";
export {
  averageBrightness,
  sliderTargets,
  expandSceneLights,
  lightTargets,
  roomLightLayout,
} from "../../packages/core/groups.mjs";
export {
  colorName,
  colorsClose,
  hexToHsv,
  hsvToHex,
  kelvinClose,
  whiteName,
  whiteToHex,
} from "../../packages/core/color.mjs";
export {
  defaultTransition,
  lightCommand,
  maxTransition,
  readTransition,
  transitionStep,
  transitionText,
} from "../../packages/core/transition.mjs";
export { sceneMatches } from "../../packages/core/scenes.mjs";
export { createCore } from "../../packages/core/controller.mjs";
export type {
  GlowCore,
  SceneData,
  SceneStore,
} from "../../packages/core/controller.mjs";
export { HomeAssistant } from "../../packages/core/home-assistant.mjs";
export type { SceneRequest } from "../../packages/core/home-assistant.mjs";
export {
  connectionUrl,
  websocketUrl,
} from "../../packages/core/connection.mjs";
export * from "../../packages/core/auth.mjs";
export {
  addRoute,
  connectionRoutes,
  discoverRoutes,
  moveRoute,
  pickRoute,
  removeRoute,
} from "../../packages/core/routes.mjs";
// The optimistic live-light layer and small formatting helpers are shared
// with the web interface too.
export { useLiveLights } from "../../src/live";
export { plural } from "../../src/format";
