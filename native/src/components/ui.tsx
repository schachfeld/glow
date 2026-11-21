import { createContext, useContext, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { fonts, useColors, type Colors } from "../theme";

type Weight = keyof typeof fonts;
export function Txt({
  size = 14,
  weight = "regular",
  color,
  tone = "text",
  style,
  ...props
}: TextProps & {
  size?: number;
  weight?: Weight;
  color?: string;
  tone?: Exclude<keyof Colors, "rooms" | "statusBar">;
}) {
  const colors = useColors();
  return (
    <Text
      {...props}
      style={[
        {
          fontFamily: fonts[weight],
          fontSize: size,
          color: color ?? colors[tone],
        },
        style,
      ]}
    />
  );
}

export function Title({
  children,
  size = 30,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <Txt
      accessibilityRole="header"
      size={size}
      weight="semibold"
      style={{ letterSpacing: -0.8 }}
    >
      {children}
    </Txt>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderRadius: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

type ButtonKind = "primary" | "secondary" | "danger" | "text" | "plain";
export function Button({
  label,
  kind = "secondary",
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled,
  style,
  accessibilityLabel,
  ...props
}: Omit<PressableProps, "children" | "style"> & {
  label: string;
  kind?: ButtonKind;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const palette: Record<
    ButtonKind,
    { bg: string; border: string; ink: string }
  > = {
    primary: { bg: colors.accent, border: colors.accent, ink: colors.onAccent },
    secondary: {
      bg: colors.surface,
      border: colors.borderStrong,
      ink: colors.textSecondary,
    },
    danger: {
      bg: colors.dangerFill,
      border: colors.dangerFill,
      ink: colors.dangerOn,
    },
    text: { bg: "transparent", border: "transparent", ink: colors.accentDark },
    plain: { bg: "transparent", border: "transparent", ink: colors.muted },
  };
  const { bg, border, ink } = palette[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled), busy: loading }}
      disabled={disabled}
      hitSlop={kind === "text" || kind === "plain" ? 8 : 0}
      style={({ pressed }) => [
        styles.button,
        kind === "text" || kind === "plain"
          ? styles.textButton
          : { backgroundColor: bg, borderColor: border },
        { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={ink} />
      ) : (
        Icon && <Icon size={16} color={ink} strokeWidth={2} />
      )}
      <Txt size={14} weight="medium" color={ink}>
        {label}
      </Txt>
      {IconRight && <IconRight size={16} color={ink} strokeWidth={2} />}
    </Pressable>
  );
}

export function IconButton({
  icon: Icon,
  label,
  color,
  size = 20,
  filled = false,
  style,
  ...props
}: Omit<PressableProps, "children" | "style"> & {
  icon: LucideIcon;
  label: string;
  color?: string;
  size?: number;
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconButton,
        { opacity: props.disabled ? 0.45 : pressed ? 0.6 : 1 },
        style,
      ]}
      {...props}
    >
      <Icon
        size={size}
        color={color ?? colors.muted}
        fill={filled ? (color ?? colors.muted) : "none"}
        strokeWidth={1.8}
      />
    </Pressable>
  );
}

// A switch whose "on" color can follow the room it belongs to.
export const ToggleColor = createContext<string | undefined>(undefined);
export function Toggle({
  on,
  onChange,
  label,
  disabled = false,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  const colors = useColors();
  const onColor = useContext(ToggleColor) ?? colors.toggleOn;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      onPress={onChange}
      hitSlop={10}
      style={[
        styles.toggle,
        {
          backgroundColor: on ? onColor : colors.toggleOff,
          borderColor: on ? onColor : colors.toggleOffBorder,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.knob,
          {
            backgroundColor: colors.knob,
            transform: [{ translateX: on ? 20 : 0 }],
          },
        ]}
      />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon: Icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: LucideIcon;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.selected : colors.surface,
          borderColor: selected ? colors.borderSelected : colors.border,
        },
      ]}
    >
      {Icon && (
        <Icon
          size={14}
          color={selected ? colors.selectedInk : colors.muted}
          strokeWidth={2}
        />
      )}
      <Txt
        size={13}
        weight="medium"
        color={selected ? colors.selectedInk : colors.textSecondary}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

// A Settings row that opens another screen.
export function LinkCard({
  icon: Icon,
  title,
  summary,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  summary: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={summary}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
    >
      <Card style={styles.link}>
        <Icon size={20} color={colors.leaf} strokeWidth={1.8} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={15} weight="semibold">
            {title}
          </Txt>
          <Txt size={13} tone="textSecondary" numberOfLines={1}>
            {summary}
          </Txt>
        </View>
        <ChevronRight size={18} color={colors.muted} strokeWidth={1.8} />
      </Card>
    </Pressable>
  );
}

export function FieldLabel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Txt size={14} weight="semibold" tone="textSecondary" style={style}>
      {children}
    </Txt>
  );
}

export function Notice({
  children,
  kind = "info",
  icon: Icon,
}: {
  children: ReactNode;
  kind?: "info" | "warn" | "error" | "ok";
  icon?: LucideIcon;
}) {
  const colors = useColors();
  const palette = {
    info: {
      bg: colors.surfaceSunken,
      border: colors.border,
      ink: colors.textSecondary,
    },
    warn: {
      bg: colors.warnBg,
      border: colors.warnBorder,
      ink: colors.warnInkStrong,
    },
    error: {
      bg: colors.dangerBg,
      border: colors.dangerBorder,
      ink: colors.dangerInk,
    },
    ok: { bg: colors.okBg, border: colors.okBorder, ink: colors.okInk },
  }[kind];
  return (
    <View
      accessibilityRole={kind === "error" ? "alert" : undefined}
      style={[
        styles.notice,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      {Icon && <Icon size={18} color={palette.ink} strokeWidth={1.8} />}
      <View style={{ flex: 1 }}>
        {typeof children === "string" ? (
          <Txt size={13} color={palette.ink} style={{ lineHeight: 19 }}>
            {children}
          </Txt>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    minHeight: 46,
  },
  textButton: {
    paddingHorizontal: 4,
    minHeight: 36,
    borderWidth: 0,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    padding: 3,
    justifyContent: "center",
  },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 38,
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    minHeight: 64,
  },
  notice: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
});
