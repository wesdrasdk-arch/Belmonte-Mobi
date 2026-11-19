import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme";
import { usesNativeTabs } from "@/src/navigation";

const TAB_ICONS: Record<string, { active: string; inactive: string }> = {
  index: { active: "home", inactive: "home-outline" },
  history: { active: "time", inactive: "time-outline" },
  notifications: { active: "notifications", inactive: "notifications-outline" },
  profile: { active: "person", inactive: "person-outline" },
};

export default function ClientLayout() {
  const { colors } = useTheme();

  // iOS 26+: aba nativa com Liquid Glass (transparência nativa, ícones SF).
  if (usesNativeTabs) {
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="house.fill" />
          <NativeTabs.Trigger.Label>Início</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="history">
          <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" />
          <NativeTabs.Trigger.Label>Histórico</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="notifications">
          <NativeTabs.Trigger.Icon sf="bell.fill" />
          <NativeTabs.Trigger.Label>Alertas</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile">
          <NativeTabs.Trigger.Icon sf="person.fill" />
          <NativeTabs.Trigger.Label>Perfil</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandSecondary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          ...(Platform.OS === "web" ? { height: 64 } : {}),
          borderTopColor: colors.divider,
        },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Início", tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS.index.active} size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: "Histórico", tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS.history.active} size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ title: "Alertas", tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS.notifications.active} size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Perfil", tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS.profile.active} size={size} color={color} /> }}
      />
    </Tabs>
  );
}
