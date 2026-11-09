import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { Connection, SceneData, SceneStore } from "../core";

// The connection lives in the platform's secure storage: the iOS Keychain,
// readable after the first unlock and never synced or restored to another
// device, or Android preferences encrypted with a non-exportable Keystore key.
const secureKey = "home-assistant-connection";
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainService: "io.github.schachfeld.glow",
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const optionalList = (value: unknown) =>
  value === undefined ||
  (Array.isArray(value) && value.every((item) => typeof item === "string"));

function validConnection(connection: unknown): Connection {
  const value = connection as Partial<Record<string, unknown>> | null;
  if (
    !value ||
    typeof value.url !== "string" ||
    !optionalList(value.routes) ||
    !optionalList(value.dismissedRoutes) ||
    !(
      typeof value.token === "string" ||
      (typeof value.refreshToken === "string" &&
        typeof value.clientId === "string")
    )
  )
    throw new Error("Invalid saved connection.");
  return value as unknown as Connection;
}

export const secureStorageAvailable = () =>
  SecureStore.isAvailableAsync().catch(() => false);

export async function loadSecureConnection(): Promise<Connection | null> {
  const value = await SecureStore.getItemAsync(secureKey, secureOptions);
  return value ? validConnection(JSON.parse(value)) : null;
}

export const saveSecureConnection = (connection: Connection) =>
  SecureStore.setItemAsync(
    secureKey,
    JSON.stringify(connection),
    secureOptions,
  );

export const forgetConnection = () =>
  SecureStore.deleteItemAsync(secureKey, secureOptions);

// Scenes' editor settings, favorites and group display preferences, kept per
// Home Assistant address.
export async function sceneStore(
  url: string,
  key = `scenes:${url}`,
  initial: SceneData = { scenes: [], favorites: {} },
): Promise<SceneStore> {
  const raw = await AsyncStorage.getItem(key);
  let data: SceneData | null = null;
  try {
    data = raw ? JSON.parse(raw) : initial;
  } catch {
    // Reported below.
  }
  if (
    !data ||
    !Array.isArray(data.scenes) ||
    !data.favorites ||
    typeof data.favorites !== "object"
  )
    throw new Error(
      "Saved scenes could not be read. Restore your app data before continuing.",
    );
  return {
    data,
    async save(this: SceneStore, next) {
      try {
        await AsyncStorage.setItem(key, JSON.stringify(next));
        this.data = next;
      } catch {
        throw new Error(
          "Could not save your changes. Check the device’s available storage.",
        );
      }
    },
  };
}
