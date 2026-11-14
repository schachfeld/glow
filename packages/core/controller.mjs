import {
  mapHome,
  palettes,
  validateSettings,
  serviceSettings,
} from "./model.mjs";
import { expandSceneLights, lightTargets } from "./groups.mjs";
import {
  helperDays,
  mapSchedules,
  scheduleAutomation,
  scheduleAutomationId,
  scheduleInput,
} from "./schedules.mjs";

// All lighting and scene behavior lives here. Storage and transport are supplied
// by the host; no Node, browser, or Tauri APIs are needed in this module.
export function createCore({
  ha = null,
  store,
  randomUUID = () => globalThis.crypto.randomUUID(),
  broadcastDelayMs = 16,
}) {
  const demo = !ha;
  const subscribers = new Set();
  const handlers = new Map();
  const state = () => ({
    ...(demo
      ? {
          rooms: store.data.rooms,
          lights: store.data.lights,
          scenes: store.data.scenes,
          schedules: store.data.schedules ?? [],
        }
      : {
          ...mapHome(
            ha.states,
            ha.areas,
            ha.devices,
            ha.entities,
            store.data.scenes,
            store.data.favorites,
            store.data.groupDisplay,
          ),
          schedules: mapSchedules(
            ha.schedules ?? [],
            ha.scheduleAutomations ?? [],
            ha.states,
            ha.entities,
          ),
        }),
    mode: demo ? "demo" : "live",
    connected: demo || ha.connected,
    error: ha?.error ?? null,
    palettes,
  });
  let broadcastTimer = null;
  const broadcast = () => {
    clearTimeout(broadcastTimer);
    broadcastTimer = null;
    if (!subscribers.size) return;
    const home = state();
    for (const callback of subscribers) callback(home);
  };
  // A room command produces one state_changed event per bulb. Coalesce bursts
  // into a single update instead of remapping the whole home for every event.
  const scheduleBroadcast = () => {
    broadcastTimer ??= setTimeout(broadcast, broadcastDelayMs);
  };
  ha?.on("change", scheduleBroadcast);
  const findScene = (id) => {
    const scene = state().scenes.find((s) => s.id === id);
    if (!scene)
      throw Object.assign(new Error("This scene no longer exists."), {
        status: 404,
      });
    return scene;
  };
  const requireConnection = () => {
    if (!demo && !ha.connected)
      throw Object.assign(
        new Error(
          "Home Assistant is disconnected. Try again when it reconnects.",
        ),
        { status: 503 },
      );
  };
  handlers.set("POST lights", async (body, id) => {
    requireConnection();
    const { ids, settings: rawSettings } = body;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 500 ||
      ids.some((id) => typeof id !== "string")
    )
      throw new Error("Choose at least one light.");
    const settings = validateSettings(rawSettings);
    const home = state();
    const lights = lightTargets(home, ids);
    if (lights.length > 500) throw new Error("Choose no more than 500 lights.");
    for (const light of lights) {
      if (!light.available)
        throw new Error(
          `${light.name} is unavailable. Check its power and connection.`,
        );
    }
    if (demo) {
      await store.save({
        ...store.data,
        lights: store.data.lights.map((l) =>
          ids.includes(l.id)
            ? { ...l, ...settings, on: settings.on ?? true }
            : l,
        ),
      });
      broadcast();
    } else {
      // Group equal settings into one service call, without assuming every bulb has the same capabilities.
      const groups = new Map();
      for (const light of lights) {
        const data =
          settings.on === false ? {} : serviceSettings(settings, light);
        const key = JSON.stringify(data);
        const group = groups.get(key) ?? { data, ids: [] };
        group.ids.push(light.id);
        groups.set(key, group);
      }
      // Send every call in the same tick, so commands reach Home Assistant in
      // the order they were issued even while earlier ones are still running.
      await Promise.all(
        [...groups.values()].map((group) =>
          ha.call(
            "light",
            settings.on === false ? "turn_off" : "turn_on",
            group.data,
            { entity_id: group.ids },
          ),
        ),
      );
    }
    return { ok: true };
  });

  handlers.set("PUT group-display", async ({ groupId, display }) => {
    if (!["group", "individual"].includes(display))
      throw new Error("Choose grouped or individual lights.");
    if (!state().groups?.some((group) => group.id === groupId))
      throw new Error(
        "This light group is no longer available. Refresh and try again.",
      );
    await store.save({
      ...store.data,
      groupDisplay: { ...store.data.groupDisplay, [groupId]: display },
    });
    broadcast();
    return { ok: true };
  });

  function sceneInput(body, existing) {
    const home = state();
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.trim().length > 60
    )
      throw new Error("Give your scene a name of 1–60 characters.");
    const room = home.rooms.find((r) => r.id === body.roomId);
    if (!room) throw new Error("Choose a room for this scene.");
    if (!palettes.some((p) => p.id === body.palette))
      throw new Error("Choose a scene palette.");
    if (
      !body.lights ||
      typeof body.lights !== "object" ||
      Array.isArray(body.lights) ||
      !Object.keys(body.lights).length
    )
      throw new Error("Add at least one light to the scene.");
    const lights = {};
    for (const [id, settings] of Object.entries(
      expandSceneLights(home, body.lights),
    )) {
      if (!home.lights.some((l) => l.id === id && l.roomId === room.id))
        throw new Error("Scenes can only contain lights in their room.");
      lights[id] = validateSettings(settings);
    }
    const id = existing?.id ?? randomUUID();
    return {
      id,
      ...(!demo ? { haSceneId: existing?.haSceneId ?? `glow_${id}` } : {}),
      name: body.name.trim(),
      roomId: room.id,
      palette: body.palette,
      lights,
      favorite: existing?.favorite ?? false,
      source: "glow",
    };
  }
  function sceneEntities(scene) {
    const home = state();
    return Object.fromEntries(
      Object.entries(scene.lights).map(([id, settings]) => [
        id,
        {
          state: settings.on === false ? "off" : "on",
          ...(settings.on === false
            ? {}
            : serviceSettings(
                settings,
                home.lights.find((light) => light.id === id),
              )),
        },
      ]),
    );
  }

  // Keep the editor metadata durable before writing to HA. A rejected remote
  // write restores the previous local scene, and never falls back to scene.apply.
  async function saveSceneChange(data, remoteWrite) {
    const previous = store.data;
    await store.save(data);
    try {
      if (!demo) await remoteWrite();
    } catch (error) {
      try {
        await store.save(previous);
      } catch {
        throw new Error(
          `${error.message} Glow could not restore its local scene data. Check available storage before retrying.`,
        );
      }
      broadcast();
      throw error;
    }
    broadcast();
  }
  const publishScene = (scene) =>
    ha.sceneConfig("POST", scene.haSceneId, {
      name: scene.name,
      entities: sceneEntities(scene),
    });
  handlers.set("POST scenes", async (body, id) => {
    requireConnection();
    const scene = sceneInput(body);
    await saveSceneChange(
      { ...store.data, scenes: [...store.data.scenes, scene] },
      () => publishScene(scene),
    );
    return scene;
  });
  handlers.set("PUT scenes/:id", async (body, id) => {
    requireConnection();
    const existing = findScene(id);
    if (existing.source !== "glow")
      throw new Error("Edit this scene in Home Assistant.");
    const scene = sceneInput(body, existing);
    await saveSceneChange(
      {
        ...store.data,
        scenes: store.data.scenes.map((s) => (s.id === scene.id ? scene : s)),
      },
      () => publishScene(scene),
    );
    return scene;
  });
  handlers.set("DELETE scenes/:id", async (body, id) => {
    const scene = findScene(id);
    if (scene.source !== "glow")
      throw new Error("Delete this scene in Home Assistant.");
    if (scene.haSceneId) requireConnection();
    await saveSceneChange(
      {
        ...store.data,
        scenes: store.data.scenes.filter((s) => s.id !== scene.id),
      },
      async () => {
        if (scene.haSceneId) await ha.sceneConfig("DELETE", scene.haSceneId);
      },
    );
    return { ok: true };
  });
  handlers.set("POST scenes/:id/favorite", async (body, id) => {
    const scene = findScene(id);
    if (typeof body.favorite !== "boolean")
      throw new Error("Choose whether to favorite this scene.");
    if (scene.source === "glow")
      await store.save({
        ...store.data,
        scenes: store.data.scenes.map((s) =>
          s.id === scene.id ? { ...s, favorite: body.favorite } : s,
        ),
      });
    else
      await store.save({
        ...store.data,
        favorites: { ...store.data.favorites, [scene.id]: body.favorite },
      });
    broadcast();
    return { ok: true };
  });
  handlers.set("POST scenes/:id/activate", async (body, id) => {
    requireConnection();
    const scene = findScene(id);
    if (scene.haSceneId) {
      const native = Object.values(ha.states).find(
        (s) =>
          s.entity_id.startsWith("scene.") &&
          s.attributes?.id === scene.haSceneId,
      );
      if (!native)
        throw new Error(
          "This scene is not loaded in Home Assistant yet. Check that scenes.yaml is included in your configuration, then reload scenes and try again.",
        );
      await ha.call("scene", "turn_on", {}, { entity_id: native.entity_id });
    } else if (scene.source === "home-assistant")
      await ha.call("scene", "turn_on", {}, { entity_id: scene.entityId });
    else {
      const home = state();
      const entries = Object.entries(scene.lights);
      if (
        entries.some(
          ([id]) => !home.lights.some((l) => l.id === id && l.available),
        )
      )
        throw new Error(
          "A light in this scene is unavailable or was removed. Edit the scene or reconnect the light.",
        );
      if (demo) {
        await store.save({
          ...store.data,
          lights: store.data.lights.map((l) =>
            scene.lights[l.id]
              ? {
                  ...l,
                  ...scene.lights[l.id],
                  on: scene.lights[l.id].on ?? true,
                }
              : l,
          ),
        });
        broadcast();
      } else {
        const entities = Object.fromEntries(
          entries.map(([id, settings]) => [
            id,
            {
              state: settings.on === false ? "off" : "on",
              ...(settings.on === false
                ? {}
                : serviceSettings(
                    settings,
                    home.lights.find((l) => l.id === id),
                  )),
            },
          ]),
        );
        await ha.call("scene", "apply", { entities });
      }
    }
    return { ok: true };
  });

  const findSchedule = (id) => {
    const schedule = state().schedules.find((s) => s.id === id);
    if (!schedule)
      throw Object.assign(new Error("This schedule no longer exists."), {
        status: 404,
      });
    return schedule;
  };
  const saveDemoSchedules = async (schedules) => {
    await store.save({ ...store.data, schedules });
    broadcast();
  };
  // Shows a saved schedule at once. Home Assistant's own events follow and
  // confirm it.
  const rememberSchedule = (helper, automation) => {
    ha.schedules = [
      ...ha.schedules.filter((item) => item.id !== helper.id),
      helper,
    ];
    ha.scheduleAutomations = [
      ...ha.scheduleAutomations.filter((item) => item.id !== automation.id),
      automation,
    ];
    broadcast();
  };
  handlers.set("POST schedules", async (body) => {
    requireConnection();
    const input = scheduleInput(body, state());
    if (demo) {
      const schedule = {
        ...input,
        id: randomUUID(),
        enabled: true,
        active: false,
        nextEvent: null,
      };
      await saveDemoSchedules([...(store.data.schedules ?? []), schedule]);
      return schedule;
    }
    const helper = await ha
      .request("schedule/create", {
        name: input.name,
        icon: "mdi:lightbulb-auto",
        ...helperDays(input.days),
      })
      .catch((error) => {
        if (/unknown command/i.test(error.message))
          throw new Error(
            "Home Assistant's schedule integration is not enabled. Add “schedule:” to its configuration, restart it and try again.",
          );
        throw error;
      });
    let automation;
    try {
      // The automation watches the helper's entity, which is new.
      await ha.loadRegistries();
      const entity = ha.entities.find(
        (item) => item.platform === "schedule" && item.unique_id === helper.id,
      );
      if (!entity)
        throw new Error(
          "Home Assistant did not create the schedule. Please try again.",
        );
      automation = scheduleAutomation(input, helper.id, entity.entity_id);
      await ha.automationConfig("POST", automation.id, automation);
      // A schedule made during one of its own times is already on, which the
      // new automation did not see happen.
      if (ha.states[entity.entity_id]?.state === "on")
        await ha
          .call("light", "turn_on", {}, automation.actions[0].target)
          .catch(() => {});
    } catch (error) {
      // A schedule helper that switches nothing would only be clutter.
      await ha
        .request("schedule/delete", { schedule_id: helper.id })
        .catch(() => {});
      throw error;
    }
    rememberSchedule(helper, automation);
    return findSchedule(helper.id);
  });
  handlers.set("PUT schedules/:id", async (body, id) => {
    requireConnection();
    const existing = findSchedule(id);
    const input = scheduleInput(body, state());
    if (demo) {
      const schedule = { ...existing, ...input };
      await saveDemoSchedules(
        store.data.schedules.map((s) => (s.id === id ? schedule : s)),
      );
      return schedule;
    }
    if (!existing.entityId)
      throw new Error(
        "This schedule's helper is missing in Home Assistant. Delete the schedule and create it again.",
      );
    const automation = scheduleAutomation(input, id, existing.entityId);
    // Saving an automation reloads it, and it would miss a schedule that
    // starts or ends at that moment. So it is only saved when its name or
    // lights changed, and before the times are.
    const saved = ha.scheduleAutomations.find(
      (item) => item.id === automation.id,
    );
    if (
      !saved ||
      Object.keys(automation).some(
        (key) => JSON.stringify(saved[key]) !== JSON.stringify(automation[key]),
      )
    )
      await ha.automationConfig("POST", automation.id, automation);
    const helper = await ha.request("schedule/update", {
      schedule_id: id,
      name: input.name,
      icon:
        ha.schedules.find((item) => item.id === id)?.icon ??
        "mdi:lightbulb-auto",
      ...helperDays(input.days),
    });
    rememberSchedule(helper, automation);
    return findSchedule(id);
  });
  handlers.set("DELETE schedules/:id", async (body, id) => {
    findSchedule(id);
    if (demo) {
      await saveDemoSchedules(store.data.schedules.filter((s) => s.id !== id));
      return { ok: true };
    }
    requireConnection();
    // The automation goes first, so it never watches a missing helper.
    await ha.automationConfig("DELETE", scheduleAutomationId(id));
    await ha.request("schedule/delete", { schedule_id: id });
    ha.schedules = ha.schedules.filter((item) => item.id !== id);
    ha.scheduleAutomations = ha.scheduleAutomations.filter(
      (item) => item.id !== scheduleAutomationId(id),
    );
    broadcast();
    return { ok: true };
  });
  // A paused schedule keeps its times but no longer switches the lights.
  handlers.set("POST schedules/:id/enabled", async (body, id) => {
    requireConnection();
    findSchedule(id);
    if (typeof body.enabled !== "boolean")
      throw new Error("Choose whether this schedule is on.");
    if (demo) {
      await saveDemoSchedules(
        store.data.schedules.map((s) =>
          s.id === id ? { ...s, enabled: body.enabled } : s,
        ),
      );
      return { ok: true };
    }
    const automation = Object.values(ha.states).find(
      (s) =>
        s.entity_id.startsWith("automation.") &&
        s.attributes?.id === scheduleAutomationId(id),
    );
    if (!automation)
      throw new Error(
        "This schedule is not loaded in Home Assistant yet. Try again in a moment.",
      );
    await ha.call(
      "automation",
      body.enabled ? "turn_on" : "turn_off",
      {},
      { entity_id: automation.entity_id },
    );
    return { ok: true };
  });

  // Serialize writes so asynchronous mobile persistence cannot lose an edit.
  // Live light commands do not touch storage. They skip the queue so a slow
  // scene save or bulb never delays the next slider movement.
  let queue = Promise.resolve();
  const immediate = new Set(demo ? [] : ["POST lights"]);
  return {
    state,
    subscribe(callback) {
      subscribers.add(callback);
      callback(state());
      return () => subscribers.delete(callback);
    },
    execute(method, path, body = {}) {
      const parts = path.split("/");
      const id =
        ["scenes", "schedules"].includes(parts[0]) && parts.length > 1
          ? decodeURIComponent(parts[1])
          : undefined;
      const key =
        id === undefined
          ? path
          : [parts[0], ":id", ...parts.slice(2)].join("/");
      const handler = handlers.get(`${method} ${key}`);
      if (!handler)
        return Promise.reject(
          Object.assign(new Error("This action does not exist."), {
            status: 404,
          }),
        );
      if (immediate.has(`${method} ${key}`))
        return Promise.resolve().then(() => handler(body, id));
      const task = queue.then(() => handler(body, id));
      queue = task.catch(() => {});
      return task;
    },
    close() {
      clearTimeout(broadcastTimer);
      ha?.off("change", scheduleBroadcast);
      subscribers.clear();
    },
  };
}
