import { expandSceneLights, splitLightGroups } from "./groups.mjs";

export const palettes = [
  {
    id: "warm",
    name: "Warm glow",
    colors: ["#f5bf76", "#e59461", "#f5dfa9"],
    brightness: 65,
    kelvin: 2700,
  },
  {
    id: "sunset",
    name: "Sunset",
    colors: ["#ee947e", "#da77a2", "#f2bf79"],
    brightness: 70,
  },
  {
    id: "ocean",
    name: "Ocean",
    colors: ["#74bfc4", "#7d99d1", "#b5dfcf"],
    brightness: 60,
  },
  {
    id: "daylight",
    name: "Daylight",
    colors: ["#e2eaf0", "#c7d9e5", "#fff5dc"],
    brightness: 100,
    kelvin: 4500,
  },
  {
    id: "forest",
    name: "Forest",
    colors: ["#a9be91", "#74a59c", "#e1d3a0"],
    brightness: 55,
  },
  {
    id: "night",
    name: "Nightlight",
    colors: ["#b0a1d2", "#8f98c5", "#d7b8d1"],
    brightness: 20,
    kelvin: 2200,
  },
];

export function roomStyle(name) {
  const n = name.toLowerCase();
  if (/bed|schlaf/.test(n)) return "bedroom";
  if (/kitchen|küche/.test(n)) return "kitchen";
  if (/office|study|büro/.test(n)) return "office";
  if (/bath|bad/.test(n)) return "bathroom";
  if (/dining|essen/.test(n)) return "dining";
  if (/garden|outdoor|terrace|garten/.test(n)) return "garden";
  return "living";
}

export function createDemo() {
  const specs = [
    [
      "living-room",
      "Living room",
      ["Floor lamp", "Sofa light", "Ceiling light", "Shelf light"],
      "warm",
      true,
    ],
    [
      "bedroom",
      "Bedroom",
      ["Bedside left", "Bedside right", "Ceiling light"],
      "night",
      true,
    ],
    [
      "kitchen",
      "Kitchen",
      ["Pendant light", "Counter lights", "Ceiling spots"],
      "daylight",
      false,
    ],
    [
      "dining-room",
      "Dining room",
      ["Table pendant", "Corner lamp"],
      "sunset",
      true,
    ],
    ["office", "Office", ["Desk lamp", "Monitor light"], "ocean", false],
    [
      "bathroom",
      "Bathroom",
      ["Mirror lights", "Ceiling light"],
      "daylight",
      false,
    ],
  ];
  const rooms = specs.map(([id, name]) => ({
    id,
    name,
    style: roomStyle(name),
  }));
  const lights = specs.flatMap(([roomId, , names, paletteId, on]) =>
    names.map((name, i) => {
      const palette = palettes.find((p) => p.id === paletteId);
      return {
        id: `light.${roomId.replaceAll("-", "_")}_${i}`,
        roomId,
        name,
        on,
        available: true,
        brightness: palette.brightness,
        color: palette.colors[i % 3],
        kelvin: palette.kelvin ?? 2700,
        colorMode: palette.kelvin ? "color_temp" : "rgb",
        dimmable: true,
        colorSupported: true,
        temperatureSupported: true,
        minKelvin: 2000,
        maxKelvin: 6500,
      };
    }),
  );
  const scenes = specs.flatMap(([roomId, , , mainPalette]) =>
    [
      mainPalette,
      ...["warm", "sunset", "daylight"]
        .filter((p) => p !== mainPalette)
        .slice(0, 2),
    ].map((paletteId, index) => {
      const palette = palettes.find((p) => p.id === paletteId);
      return {
        id: `demo-${roomId}-${paletteId}`,
        name:
          index === 0 && roomId === "living-room"
            ? "Golden hour"
            : index === 0 && roomId === "bedroom"
              ? "Wind down"
              : index === 0 && roomId === "dining-room"
                ? "Dinner party"
                : palette.name,
        roomId,
        palette: paletteId,
        favorite: index === 0 && roomId !== "bathroom" && roomId !== "office",
        source: "glow",
        lights: Object.fromEntries(
          lights
            .filter((l) => l.roomId === roomId)
            .map((l, i) => [
              l.id,
              {
                on: true,
                brightness: palette.brightness,
                color: palette.colors[i % 3],
                kelvin: palette.kelvin ?? 2700,
                colorMode: palette.kelvin ? "color_temp" : "rgb",
              },
            ]),
        ),
      };
    }),
  );
  return { rooms, lights, scenes, favorites: {} };
}

export const isLight = (id) =>
  typeof id === "string" && /^light\.[a-z0-9_]+$/.test(id);
export const isColor = (color) =>
  typeof color === "string" && /^#[a-f\d]{6}$/i.test(color);

export function validateSettings(value) {
  if (!value || typeof value !== "object")
    throw new Error("Choose light settings first.");
  const result = {};
  if (typeof value.on === "boolean") result.on = value.on;
  if (value.brightness !== undefined) {
    if (
      !Number.isFinite(value.brightness) ||
      value.brightness < 1 ||
      value.brightness > 100
    )
      throw new Error("Brightness must be between 1 and 100.");
    result.brightness = Math.round(value.brightness);
  }
  if (value.color !== undefined) {
    if (!isColor(value.color)) throw new Error("Choose a valid light color.");
    result.color = value.color;
  }
  if (value.kelvin !== undefined) {
    if (
      !Number.isFinite(value.kelvin) ||
      value.kelvin < 1000 ||
      value.kelvin > 10000
    )
      throw new Error("Choose a valid color temperature.");
    result.kelvin = Math.round(value.kelvin);
  }
  if (value.colorMode !== undefined) {
    if (!["rgb", "color_temp"].includes(value.colorMode))
      throw new Error("Choose color or white light.");
    result.colorMode = value.colorMode;
  }
  if (!Object.keys(result).length)
    throw new Error("Choose light settings first.");
  return result;
}

// Send only attributes the particular bulb supports. HA converts RGB to its native color space.
export function serviceSettings(settings, light) {
  const result = {};
  if (settings.brightness !== undefined && light.dimmable)
    result.brightness = Math.round((settings.brightness * 255) / 100);
  if (
    settings.colorMode === "color_temp" &&
    settings.kelvin &&
    light.temperatureSupported
  ) {
    result.color_temp_kelvin = Math.max(
      light.minKelvin,
      Math.min(light.maxKelvin, settings.kelvin),
    );
  } else if (
    settings.color &&
    light.colorSupported &&
    settings.colorMode !== "color_temp"
  ) {
    result.rgb_color = settings.color
      .slice(1)
      .match(/.{2}/g)
      .map((v) => parseInt(v, 16));
  }
  return result;
}

export function mapHome(
  states,
  areas,
  devices,
  entities,
  savedScenes,
  favorites = {},
  groupDisplay = {},
  hiddenLights = [],
) {
  const deviceAreas = new Map(devices.map((d) => [d.id, d.area_id]));
  const registry = new Map(entities.map((e) => [e.entity_id, e]));
  const areaIds = new Set(areas.map((a) => a.area_id));
  const getArea = (id) => {
    const entity = registry.get(id);
    const areaId = entity?.area_id ?? deviceAreas.get(entity?.device_id);
    return areaIds.has(areaId) ? areaId : "unassigned";
  };
  const mappedLights = Object.values(states)
    .filter(
      (s) =>
        isLight(s.entity_id) &&
        !registry.get(s.entity_id)?.disabled_by &&
        !registry.get(s.entity_id)?.hidden_by &&
        !hiddenLights.includes(s.entity_id),
    )
    .map((s) => {
      const a = s.attributes ?? {};
      const modes = a.supported_color_modes ?? [];
      const rgb = a.rgb_color;
      return {
        id: s.entity_id,
        roomId: getArea(s.entity_id),
        name:
          a.friendly_name ??
          s.entity_id.replace("light.", "").replaceAll("_", " "),
        on: s.state === "on",
        available: !["unavailable", "unknown"].includes(s.state),
        brightness: Math.max(
          1,
          Math.round(((a.brightness ?? 255) / 255) * 100),
        ),
        color: rgb
          ? "#" +
            rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")
          : "#f5bf76",
        kelvin: a.color_temp_kelvin ?? 2700,
        colorMode: a.color_mode === "color_temp" ? "color_temp" : "rgb",
        dimmable: modes.some((m) => m !== "onoff"),
        colorSupported: modes.some((m) =>
          ["rgb", "rgbw", "rgbww", "hs", "xy"].includes(m),
        ),
        temperatureSupported: modes.includes("color_temp"),
        minKelvin: a.min_color_temp_kelvin ?? 2000,
        maxKelvin: a.max_color_temp_kelvin ?? 6500,
      };
    });
  const { lights, groups } = splitLightGroups(
    mappedLights,
    states,
    groupDisplay,
  );
  const rooms = areas
    .filter((a) => lights.some((l) => l.roomId === a.area_id))
    .map((a) => ({ id: a.area_id, name: a.name, style: roomStyle(a.name) }));
  if (lights.some((l) => l.roomId === "unassigned"))
    rooms.push({ id: "unassigned", name: "Other lights", style: "living" });
  const nativeScenes = Object.values(states)
    .filter(
      (s) =>
        s.entity_id.startsWith("scene.") &&
        !registry.get(s.entity_id)?.hidden_by &&
        !registry.get(s.entity_id)?.disabled_by,
    )
    .map((s) => {
      const sceneAreas = new Set(
        (s.attributes?.entity_id ?? []).filter(isLight).map(getArea),
      );
      const explicitArea = getArea(s.entity_id);
      return {
        id: s.entity_id,
        haSceneId: s.attributes?.id,
        entityId: s.entity_id,
        name: s.attributes?.friendly_name ?? s.entity_id.replace("scene.", ""),
        roomId:
          explicitArea !== "unassigned"
            ? explicitArea
            : sceneAreas.size === 1
              ? [...sceneAreas][0]
              : null,
        palette: "warm",
        favorite: favorites[s.entity_id] ?? false,
        source: "home-assistant",
        lights: {},
      };
    });
  return {
    rooms,
    lights,
    groups,
    scenes: [
      ...savedScenes.map((scene) => {
        const native =
          scene.haSceneId &&
          nativeScenes.find((s) => s.haSceneId === scene.haSceneId);
        return {
          ...scene,
          ...(native ? { entityId: native.entityId, name: native.name } : {}),
          lights: expandSceneLights({ groups }, scene.lights),
        };
      }),
      ...nativeScenes.filter(
        (native) =>
          !savedScenes.some(
            (scene) => scene.haSceneId && scene.haSceneId === native.haSceneId,
          ),
      ),
    ],
  };
}

// Every light and switch Home Assistant knows, for Glow's settings: lights
// with what keeps them out of Glow, and switches with the light a helper
// shows them as. Disabled entities have no state, so they come from the
// entity registry.
export function mapInventory(
  states,
  areas,
  devices,
  entities,
  hiddenLights = [],
) {
  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const registry = new Map(entities.map((e) => [e.entity_id, e]));
  const areaOrder = new Map(areas.map((a, index) => [a.name, index]));
  const areaNames = new Map(areas.map((a) => [a.area_id, a.name]));
  const describe = (id) => {
    const entity = registry.get(id);
    const device = deviceById.get(entity?.device_id);
    return {
      id,
      name:
        states[id]?.attributes?.friendly_name ??
        ([
          entity?.has_entity_name && (device?.name_by_user ?? device?.name),
          entity?.name ?? entity?.original_name,
        ]
          .filter(Boolean)
          .join(" ") ||
          id.replace(/^[a-z]+\./, "").replaceAll("_", " ")),
      room: areaNames.get(entity?.area_id ?? device?.area_id) ?? null,
    };
  };
  const list = (domain) =>
    [...new Set([...Object.keys(states), ...entities.map((e) => e.entity_id)])]
      .filter((id) => new RegExp(`^${domain}\\.[a-z0-9_]+$`).test(id))
      .map(describe)
      .sort(
        (a, b) =>
          (areaOrder.get(a.room) ?? Infinity) -
            (areaOrder.get(b.room) ?? Infinity) || a.name.localeCompare(b.name),
      );
  // The helper's light names the switch it wraps in its registry entry.
  const asLight = new Map();
  for (const entity of entities) {
    const source = entity.options?.switch_as_x?.entity_id;
    if (isLight(entity.entity_id) && typeof source === "string")
      asLight.set(source, entity.entity_id);
  }
  return {
    lights: list("light").map((light) => {
      const entity = registry.get(light.id);
      return {
        ...light,
        hidden: entity?.disabled_by
          ? "disable"
          : entity?.hidden_by
            ? "hide"
            : hiddenLights.includes(light.id)
              ? "local"
              : null,
      };
    }),
    // Settings of a device, such as a child lock, are switches too. They and
    // switches hidden or disabled in Home Assistant are left out.
    switches: list("switch")
      .map((item) => ({ ...item, lightId: asLight.get(item.id) ?? null }))
      .filter((item) => {
        const entity = registry.get(item.id);
        return (
          item.lightId ||
          (states[item.id] &&
            !entity?.disabled_by &&
            !entity?.hidden_by &&
            !entity?.entity_category)
        );
      }),
  };
}
