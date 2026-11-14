import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
// Gesture Handler's scroll view gives way to a slider or the color wheel that
// holds the touch.
import { RefreshControl, ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "expo-router/tabs";
import { Check, CircleHelp, RotateCcw, WifiOff, X } from "lucide-react-native";
import { lightTargets } from "../core";
import { useGlow } from "../glow";
import { useColors } from "../theme";
import { HoldContext } from "./hold";
import { LightEditor } from "./LightEditor";
import { LightGroupSettings } from "./LightGroupSettings";
import { SceneEditor } from "./SceneEditor";
import { ScheduleEditor } from "./ScheduleEditor";
import { Notice, Txt } from "./ui";

// The dialogs and notifications that sit above every tab.
export function Overlays() {
  const glow = useGlow();
  const { home, toast } = glow;
  const errorMessage = toast?.error ? toast.message : undefined;
  const currentGroup = home?.groups?.find(
    (group) => group.id === glow.lightEditor,
  );
  const currentLight =
    home?.lights.find((l) => l.id === glow.lightEditor) ?? currentGroup;
  return (
    <>
      {home && glow.customizeRoom && (
        <LightGroupSettings
          groups={
            home.groups?.filter(
              (group) => group.roomId === glow.customizeRoom,
            ) ?? []
          }
          lights={home.lights}
          roomName={
            home.rooms.find((item) => item.id === glow.customizeRoom)?.name ??
            ""
          }
          busy={glow.busy}
          onClose={glow.closeCustomizeRoom}
          onChange={(groupId, display) =>
            glow.action("group-display", { groupId, display }, "PUT")
          }
        />
      )}
      {home &&
        glow.sceneEditor &&
        home.rooms.some((r) => r.id === glow.sceneEditor!.roomId) && (
          <SceneEditor
            home={home}
            roomId={glow.sceneEditor.roomId}
            scene={glow.sceneEditor.scene}
            busy={glow.busy}
            errorMessage={errorMessage}
            onClose={glow.closeSceneEditor}
            onPreview={glow.previewLights}
            onSave={(body, id) =>
              glow.action(
                id ? `scenes/${encodeURIComponent(id)}` : "scenes",
                body,
                id ? "PUT" : "POST",
                id ? "Scene updated" : "Scene saved",
              )
            }
            onDelete={(id) =>
              glow.action(
                `scenes/${encodeURIComponent(id)}`,
                {},
                "DELETE",
                "Scene deleted",
              )
            }
          />
        )}
      {home && glow.scheduleEditor && (
        <ScheduleEditor
          home={home}
          schedule={glow.scheduleEditor.schedule}
          busy={glow.busy}
          errorMessage={errorMessage}
          onClose={glow.closeScheduleEditor}
          onSave={(body, id) =>
            glow.action(
              id ? `schedules/${encodeURIComponent(id)}` : "schedules",
              body,
              id ? "PUT" : "POST",
              id ? "Schedule updated" : "Schedule saved",
            )
          }
          onDelete={(id) =>
            glow.action(
              `schedules/${encodeURIComponent(id)}`,
              {},
              "DELETE",
              "Schedule deleted",
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
          disabled={glow.disabled}
          error={errorMessage}
          onChange={glow.lightsAction}
          onClose={glow.closeLightEditor}
        />
      )}
    </>
  );
}

// The iOS system tab bar (Liquid Glass) floats over the page and cannot be
// measured, so estimate it there. Android measures the JavaScript tab bar.
function useEstimatedTabBarHeight() {
  return useSafeAreaInsets().bottom + 64;
}
const glassTabs = Platform.OS === "ios";
const useTabBarHeight = glassTabs
  ? useEstimatedTabBarHeight
  : useBottomTabBarHeight;

// Toasts appear above the tab bar, and inside open dialogs as notices.
export function ToastView() {
  const colors = useColors();
  const { toast, setToast, busy } = useGlow();
  // Rendered beside the tabs rather than in one, so estimate the tab bar.
  const tabBar = useEstimatedTabBarHeight();
  if (!toast && !busy) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, { justifyContent: "flex-end" }]}
    >
      {busy && !toast && (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Saving changes"
          style={[
            styles.toast,
            {
              bottom: tabBar + 12,
              alignSelf: "center",
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.border,
            },
          ]}
        >
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      )}
      {toast && (
        <View
          accessibilityRole={toast.error ? "alert" : "summary"}
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            {
              bottom: tabBar + 12,
              left: 16,
              right: 16,
              backgroundColor: toast.error ? colors.dangerBg : colors.text,
              borderColor: toast.error ? colors.dangerBorder : colors.text,
            },
          ]}
        >
          {toast.error ? (
            <CircleHelp size={18} color={colors.dangerInk} />
          ) : (
            <Check size={18} color={colors.bg} />
          )}
          <Txt
            size={14}
            weight="medium"
            color={toast.error ? colors.dangerInk : colors.bg}
            style={{ flex: 1 }}
          >
            {toast.message}
          </Txt>
          {toast.action && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={toast.action.label}
              onPress={toast.action.run}
              hitSlop={8}
              style={[styles.toastAction, { borderColor: colors.bg }]}
            >
              <RotateCcw size={14} color={colors.bg} />
              <Txt size={13} weight="semibold" color={colors.bg}>
                {toast.action.label}
              </Txt>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss notification"
            onPress={() => setToast(null)}
            hitSlop={10}
          >
            <X size={18} color={toast.error ? colors.dangerInk : colors.bg} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

// A scrolling page under the tab bar, with the reconnection banner. A header
// stays fixed at the top while the rest of the page scrolls beneath it. The
// page holds still while a slider on it is dragged, and onHold tells the
// screen, for example to pause its back gesture.
export function Page({
  children,
  header,
  onRefresh,
  onHold,
}: {
  children: ReactNode;
  header?: ReactNode;
  onRefresh?: () => void;
  onHold?: (held: boolean) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tabBar = useTabBarHeight();
  const { home } = useGlow();
  const [held, setHeld] = useState(false);
  const hold = (next: boolean) => {
    setHeld(next);
    onHold?.(next);
  };
  const page = (
    <ScrollView
      scrollEnabled={!held}
      style={{ flex: 1, backgroundColor: colors.bg }}
      // On iOS the system adds the status bar and tab bar to the insets, so the
      // page scrolls under the Liquid Glass bar.
      contentInsetAdjustmentBehavior={glassTabs ? "automatic" : "never"}
      contentContainerStyle={{
        paddingTop: (header || glassTabs ? 0 : insets.top) + 12,
        paddingBottom: (glassTabs ? 0 : tabBar) + 90,
        paddingHorizontal: 18,
        gap: 18,
        width: "100%",
        maxWidth: 900,
        alignSelf: "center",
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={false}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        ) : undefined
      }
    >
      {home && !home.connected && (
        <Notice kind="warn" icon={WifiOff}>
          <Txt size={14} weight="semibold" tone="warnInkStrong">
            Reconnecting to your home
          </Txt>
          <Txt size={13} tone="warnInk" style={{ marginTop: 2 }}>
            {home.error ||
              "Controls will be available as soon as the connection is restored."}
          </Txt>
        </Notice>
      )}
      {children}
    </ScrollView>
  );
  if (!header)
    return <HoldContext.Provider value={hold}>{page}</HoldContext.Provider>;
  return (
    <HoldContext.Provider value={hold}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + 8,
              backgroundColor: colors.bg,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.headerContent}>{header}</View>
        </View>
        {page}
      </View>
    </HoldContext.Provider>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 1,
  },
  headerContent: {
    gap: 8,
    width: "100%",
    maxWidth: 864,
    alignSelf: "center",
  },
  toast: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    maxWidth: 640,
  },
  toastAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
});
