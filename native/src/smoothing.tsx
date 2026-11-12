import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeSmoothing, smoothingDefaults, type Smoothing } from "./core";

const key = "glow-slider-smoothing";
const SmoothingContext = createContext<{
  smoothing: Smoothing;
  setSmoothing: (next: Smoothing) => void;
}>({ smoothing: smoothingDefaults, setSmoothing: () => {} });

// How much sliders smooth light changes is a preference of this device.
export function SmoothingProvider({ children }: { children: ReactNode }) {
  const [smoothing, setState] = useState<Smoothing>(smoothingDefaults);
  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (raw) setState(normalizeSmoothing(JSON.parse(raw)));
      })
      .catch(() => {});
  }, []);
  const value = useMemo(
    () => ({
      smoothing,
      setSmoothing(next: Smoothing) {
        const normalized = normalizeSmoothing(next);
        setState(normalized);
        AsyncStorage.setItem(key, JSON.stringify(normalized)).catch(() => {
          // Without storage, the choice still lasts until Glow restarts.
        });
      },
    }),
    [smoothing],
  );
  return (
    <SmoothingContext.Provider value={value}>
      {children}
    </SmoothingContext.Provider>
  );
}

export const useSmoothing = () => useContext(SmoothingContext);
