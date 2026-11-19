// Gate de navegação: NativeTabs (iOS 26+) vs Tabs clássico.
import { Platform } from "react-native";

export const usesNativeTabs =
  Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;
