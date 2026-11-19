// Componentes de UI compartilhados do BELMONTE MOBI.
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme, fonts, ThemeColors } from "@/src/theme";

// ------------------------------------------------------------------ Screen
export function Screen({
  children,
  scroll = false,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <SafeAreaView style={[s.flex, { backgroundColor: colors.surface }]} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView style={s.flex} contentContainerStyle={[style, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[s.flex, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

// ------------------------------------------------------------------ Header
export function Header({
  title,
  onBack,
  right,
  subtitle,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  subtitle?: string;
}) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <View style={s.header}>
      {onBack ? (
        <Pressable testID="header-back-button" onPress={onBack} hitSlop={12} style={s.headerBack}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle}>{title}</Text>
        {subtitle ? <Text style={s.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

// ------------------------------------------------------------------ Button
export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
  testID,
  style,
  small = false,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger" | "success" | "whatsapp";
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  testID?: string;
  style?: ViewStyle;
  small?: boolean;
}) {
  const { colors } = useTheme();
  const s = useStyles();
  const bg = {
    primary: colors.brandPrimary,
    secondary: colors.brandTertiary,
    danger: colors.error,
    success: colors.success,
    whatsapp: "#25D366",
  }[variant];
  const fg = {
    primary: colors.onBrandPrimary,
    secondary: colors.onBrandTertiary,
    danger: colors.onError,
    success: colors.onSuccess,
    whatsapp: "#FFFFFF",
  }[variant];
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.button,
        small && s.buttonSmall,
        { backgroundColor: bg, opacity: disabled || loading ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon ? <Ionicons name={icon as any} size={small ? 16 : 20} color={fg} style={{ marginRight: 8 }} /> : null}
          <Text style={[s.buttonLabel, { color: fg }, small && s.buttonLabelSmall]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

// ------------------------------------------------------------------ Inputs
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const s = useStyles();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

export function Input({
  label,
  testID,
  ...props
}: {
  label?: string;
  testID?: string;
} & React.ComponentProps<typeof TextInput>) {
  const s = useStyles();
  const el = <TextInput testID={testID} style={s.input} placeholderTextColor="#94A3B8" {...props} />;
  return label ? <Field label={label}>{el}</Field> : el;
}

// ------------------------------------------------------------------ Card
export function Card({ children, style, testID }: { children: ReactNode; style?: ViewStyle; testID?: string }) {
  const s = useStyles();
  return (
    <View testID={testID} style={[s.card, style]}>
      {children}
    </View>
  );
}

// ------------------------------------------------------------------ Pill / Badge
export function Pill({ text, tone = "info", testID }: { text: string; tone?: "info" | "success" | "warning" | "error" | "muted"; testID?: string }) {
  const { colors } = useTheme();
  const s = useStyles();
  const map = {
    info: { bg: colors.brandTertiary, fg: colors.onBrandTertiary },
    success: { bg: "#D1FAE5", fg: "#047857" },
    warning: { bg: "#FEF3C7", fg: "#B45309" },
    error: { bg: "#FEE2E2", fg: "#B91C1C" },
    muted: { bg: colors.surfaceTertiary, fg: colors.onSurfaceTertiary },
  }[tone];
  return (
    <View testID={testID} style={[s.pill, { backgroundColor: map.bg }]}>
      <Text style={[s.pillText, { color: map.fg }]}>{text}</Text>
    </View>
  );
}

// ------------------------------------------------------------------ Chip (filtro) — nunca quebra linha
export function Chip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[
        s.chip,
        { backgroundColor: active ? colors.brandPrimary : colors.surfaceSecondary, borderColor: active ? colors.brandPrimary : colors.border },
      ]}
    >
      <Text style={[s.chipText, { color: active ? colors.onBrandPrimary : colors.onSurfaceSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// ------------------------------------------------------------------ Estados
export function Loading({ label = "Carregando..." }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
      <ActivityIndicator size="large" color={colors.brandPrimary} testID="loading-indicator" />
      <Text style={{ color: colors.muted, fontFamily: fonts.text }}>{label}</Text>
    </View>
  );
}

export function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <View style={s.empty} testID="empty-state">
      <Ionicons name={icon as any} size={44} color={colors.borderStrong} />
      <Text style={s.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={s.emptySubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <View style={s.empty} testID="error-state">
      <Ionicons name="cloud-offline" size={44} color={colors.error} />
      <Text style={s.emptyTitle}>{message}</Text>
      {onRetry ? (
        <Button label="Tentar novamente" onPress={onRetry} variant="secondary" small testID="error-retry-button" />
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------ Estrelas
export function Stars({
  value,
  onChange,
  size = 24,
  testIDPrefix = "star",
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  testIDPrefix?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} onPress={onChange ? () => onChange(i) : undefined} disabled={!onChange} testID={onChange ? `${testIDPrefix}-${i}` : undefined}>
          <Ionicons
            name={i <= Math.round(value) ? "star" : "star-outline"}
            size={size}
            color={i <= Math.round(value) ? colors.warning : colors.borderStrong}
          />
        </Pressable>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ Timeline de status
export function Timeline({
  steps,
  currentStep,
  cancelled = false,
  testIDPrefix = "timeline-step",
}: {
  steps: string[];
  currentStep: number;
  cancelled?: boolean;
  testIDPrefix?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 0 }}>
      {steps.map((label, i) => {
        const done = !cancelled && i < currentStep;
        const current = !cancelled && i === currentStep;
        const color = done || current ? colors.success : colors.border;
        return (
          <View key={label} style={{ flexDirection: "row", gap: 12 }} testID={`${testIDPrefix}-${i}`}>
            <View style={{ alignItems: "center" }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: done || current ? color : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {done ? <Ionicons name="checkmark" size={14} color={colors.onSuccess} /> : null}
                {current ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.onSuccess }} /> : null}
              </View>
              {i < steps.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 18, backgroundColor: done ? colors.success : colors.border }} /> : null}
            </View>
            <Text
              style={{
                color: done || current ? colors.onSurface : colors.muted,
                fontFamily: current ? fonts.textBold : fonts.text,
                fontSize: 14,
                paddingBottom: 18,
                flex: 1,
              }}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ Toast
type ToastTone = "info" | "success" | "error";
type ToastCtx = { show: (msg: string, tone?: ToastTone) => void };
const ToastContext = createContext<ToastCtx>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; tone: ToastTone } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;

  const show = (text: string, tone: ToastTone = "info") => {
    setMsg({ text, tone });
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2400),
      Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setMsg(null));
  };

  const { colors } = useTheme();
  const bg = msg?.tone === "error" ? colors.error : msg?.tone === "success" ? colors.success : colors.surfaceInverse;
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {msg ? (
        <Animated.View
          testID="toast"
          style={{
            position: "absolute",
            bottom: 110,
            left: 24,
            right: 24,
            backgroundColor: bg,
            borderRadius: 12,
            paddingVertical: 14,
            paddingHorizontal: 18,
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
          }}
        >
          <Text style={{ color: "#FFFFFF", fontFamily: fonts.textMedium, textAlign: "center" }}>{msg.text}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ------------------------------------------------------------------ styles
const useStyles = makeStyles((colors: ThemeColors) => ({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  headerBack: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  headerTitle: { fontSize: 20, color: colors.onSurface, fontFamily: fonts.display },
  headerSubtitle: { fontSize: 13, color: colors.muted, fontFamily: fonts.text },
  button: {
    minHeight: 48,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonSmall: { minHeight: 40, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  buttonLabel: { fontSize: 16, fontFamily: fonts.semi },
  buttonLabelSmall: { fontSize: 14 },
  fieldLabel: { fontSize: 13, color: colors.onSurfaceTertiary, fontFamily: fonts.textSemi, marginBottom: 6 },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 15,
    color: colors.onSurface,
    fontFamily: fonts.text,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  pillText: { fontSize: 12, fontFamily: fonts.textSemi },
  chip: {
    flexShrink: 0,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: { fontSize: 13, fontFamily: fonts.textSemi },
  empty: { alignItems: "center", justifyContent: "center", padding: 32, gap: 10, flex: 1 },
  emptyTitle: { fontSize: 16, color: colors.onSurfaceSecondary, fontFamily: fonts.semi, textAlign: "center" },
  emptySubtitle: { fontSize: 14, color: colors.muted, fontFamily: fonts.text, textAlign: "center" },
}));
