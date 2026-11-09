import { Events } from "./events.mjs";

// Glow only shows lights and scenes. Ignoring other entities keeps busy
// sensors from remapping and rebroadcasting the whole home every second.
const relevant = (entityId) =>
  entityId.startsWith("light.") || entityId.startsWith("scene.");

export class HomeAssistant extends Events {
  constructor({
    url,
    token,
    retryMs = 3000,
    timeoutMs = 12000,
    createSocket,
    getToken,
    apiUrl,
    sceneRequest,
    registryDelayMs = 250,
  }) {
    super();
    this.createSocket = createSocket;
    this.url = url;
    this.token = token;
    this.getToken = getToken ?? (() => this.token);
    this.apiUrl = apiUrl;
    this.sceneRequest = sceneRequest;
    this.retryMs = retryMs;
    this.timeoutMs = timeoutMs;
    this.registryDelayMs = registryDelayMs;
    this.pending = new Map();
    this.nextId = 1;
    this.states = {};
    this.areas = [];
    this.devices = [];
    this.entities = [];
    this.connected = false;
    this.stopped = false;
    this.error = null;
    // Set while a planned switch to another address opens its socket.
    this.handover = false;
    this.replacing = null;
  }

  start() {
    if (this.stopped || this.socket) return;
    clearTimeout(this.retryTimer);
    const socket = this.createSocket(this.url);
    this.socket = socket;
    const authTimer = setTimeout(() => socket.terminate(), this.timeoutMs);
    socket.on("message", async (raw) => {
      if (this.socket !== socket || this.stopped) return;
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === "auth_required") {
          const accessToken = await this.getToken();
          if (this.socket !== socket || this.stopped) return;
          await socket.send(
            JSON.stringify({ type: "auth", access_token: accessToken }),
          );
        }
        if (message.type === "auth_invalid") {
          this.error =
            "Home Assistant rejected the connection. Check the app permissions or access token.";
          this.stopped = true;
          socket.close();
        }
        if (message.type === "auth_ok") {
          clearTimeout(authTimer);
          // Subscribe first so changes during initial discovery are not lost.
          this.initialEvents = [];
          await this.request("subscribe_events", {
            event_type: "state_changed",
          });
          const [states] = await Promise.all([
            this.request("get_states"),
            this.loadRegistries(),
          ]);
          this.states = Object.fromEntries(
            states
              .filter((s) => relevant(s.entity_id))
              .map((s) => [s.entity_id, s]),
          );
          for (const data of this.initialEvents ?? []) this.updateState(data);
          this.initialEvents = null;
          for (const event_type of [
            "area_registry_updated",
            "device_registry_updated",
            "entity_registry_updated",
          ])
            await this.request("subscribe_events", { event_type });
          if (this.socket !== socket || this.stopped) return;
          this.connected = true;
          this.handover = false;
          this.error = null;
          this.heartbeat = setInterval(() => {
            this.request("ping").catch(() => socket.terminate());
          }, 30000);
          this.emit("change");
        }
        if (message.type === "result" || message.type === "pong") {
          const pending = this.pending.get(message.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(message.id);
            if (message.success === false)
              pending.reject(
                new Error(
                  message.error?.message ??
                    "Home Assistant could not complete that action.",
                ),
              );
            else pending.resolve(message.result);
          }
        }
        if (message.type === "event") {
          if (message.event.event_type === "state_changed") {
            const data = message.event.data;
            if (!relevant(data.entity_id)) return;
            if (this.initialEvents) this.initialEvents.push(data);
            else this.updateState(data);
            if (this.connected) this.emit("change");
          } else this.scheduleRegistryReload(socket);
        }
      } catch (error) {
        if (this.socket !== socket || this.stopped) return;
        this.error = error.message;
        if (error.reauthenticate) this.stopped = true;
        if (!this.connected || this.handover) socket.close();
        this.emit("change");
      }
    });
    socket.on("error", () => {
      if (this.socket !== socket) return;
      this.error =
        "Cannot reach Home Assistant. Glow will reconnect automatically.";
    });
    socket.on("close", () => {
      clearTimeout(authTimer);
      if (this.socket !== socket) return;
      clearInterval(this.heartbeat);
      clearTimeout(this.registryTimer);
      this.socket = null;
      // A planned switch to another address: stay connected while it opens.
      const replaced = this.replacing === socket && !this.stopped;
      this.replacing = null;
      this.handover = replaced;
      if (!replaced) this.connected = false;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(
          new Error(
            "Home Assistant disconnected. Please try again after it reconnects.",
          ),
        );
      }
      this.pending.clear();
      if (replaced) return this.start();
      this.emit("change");
      if (!this.stopped)
        this.retryTimer = setTimeout(() => this.start(), this.retryMs);
    });
  }

  updateState({ entity_id, new_state }) {
    if (new_state) this.states[entity_id] = new_state;
    else delete this.states[entity_id];
  }

  // Renaming or moving a device emits several registry events in a row.
  scheduleRegistryReload(socket) {
    clearTimeout(this.registryTimer);
    this.registryTimer = setTimeout(async () => {
      try {
        await this.loadRegistries();
        if (this.socket === socket && this.connected) this.emit("change");
      } catch {
        // A disconnect reloads every registry after reconnecting.
      }
    }, this.registryDelayMs);
  }

  async loadRegistries() {
    const [areas, devices, entities] = await Promise.all([
      this.request("config/area_registry/list"),
      this.request("config/device_registry/list"),
      this.request("config/entity_registry/list"),
    ]);
    this.areas = areas;
    this.devices = devices;
    this.entities = entities;
  }

  request(type, data = {}) {
    if (this.socket?.readyState !== 1)
      return Promise.reject(new Error("Home Assistant is not connected yet."));
    const socket = this.socket;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            "Home Assistant took too long to respond. Please try again.",
          ),
        );
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      Promise.resolve()
        .then(() => socket.send(JSON.stringify({ id, type, ...data })))
        .catch((error) => {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(error);
        });
    });
  }

  call(domain, service, service_data = {}, target) {
    if (!this.connected)
      throw new Error(
        "Home Assistant is disconnected. Your lights have not been changed.",
      );
    return this.request("call_service", {
      domain,
      service,
      service_data,
      ...(target ? { target } : {}),
    });
  }

  async sceneConfig(method, id, config) {
    if (!this.connected) throw new Error("Home Assistant is disconnected.");
    if (!this.apiUrl || !this.sceneRequest)
      throw new Error("This connection cannot save Home Assistant scenes.");
    const response = await this.sceneRequest({
      url: new URL(`config/scene/config/${encodeURIComponent(id)}`, this.apiUrl)
        .href,
      method,
      token: await this.getToken(),
      body: config,
      timeoutMs: this.timeoutMs,
    });
    const alreadyDeleted =
      method === "DELETE" &&
      response.status === 400 &&
      response.body?.message === "Resource not found";
    if (!alreadyDeleted && (response.status < 200 || response.status >= 300)) {
      const message =
        response.status === 401 || response.status === 403
          ? "Saving Home Assistant scenes requires an administrator connection. Check your account or app permissions."
          : response.status === 404
            ? "Home Assistant's scene configuration API is unavailable. Enable the config integration and include scenes.yaml in your configuration."
            : `Home Assistant could not ${method === "DELETE" ? "delete" : "save"} the scene. ${response.body?.message ?? "Please try again."}`;
      throw new Error(message);
    }
    if (method === "DELETE") {
      // The config endpoint removes the entity asynchronously. Do not briefly
      // rediscover the deleted scene as an unrelated native scene.
      for (const state of Object.values(this.states)) {
        if (state.entity_id.startsWith("scene.") && state.attributes?.id === id)
          delete this.states[state.entity_id];
      }
      this.emit("change");
    }
    return response.body;
  }

  reconnect() {
    if (this.stopped) return;
    if (this.socket) this.socket.terminate();
    else this.start();
  }

  // Moves to another address of the same Home Assistant, such as the home
  // network after a VPN. While connected, the home stays connected as the new
  // address opens, so the switch does not show a disconnect; only a failed
  // switch does.
  switchTo(url, apiUrl) {
    this.url = url;
    this.apiUrl = apiUrl;
    if (this.stopped) return;
    if (this.connected && this.socket && !this.handover) {
      this.replacing = this.socket;
      this.socket.terminate();
    } else this.reconnect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.heartbeat);
    clearTimeout(this.registryTimer);
    this.socket?.close();
  }
}
