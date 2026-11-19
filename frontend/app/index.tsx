import { Redirect, useRouter } from "expo-router";
import { Image, Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useAuth } from "@/src/auth";
import { Loading, Screen } from "@/src/components/ui";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function Welcome() {
  const { user, booted } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const s = useStyles();

  if (!booted) return <Loading label="BELMONTE MOBI" />;

  if (user) {
    if (user.role === "driver") return <Redirect href="/driver" />;
    if (user.role === "admin") return <Redirect href="/admin" />;
    return <Redirect href="/(client)" />;
  }

  return (
    <Screen scroll style={s.wrap}>
      <View style={s.hero}>
        <Image source={require("../assets/images/icon.png")} style={s.logo} />
        <Text style={s.brandName}>BELMONTE MOBI</Text>
        <Text style={s.slogan}>Transporte, Turismo e Entregas na palma da sua mão.</Text>
        <View style={s.badge}>
          <Ionicons name="location" size={14} color={colors.onBrandTertiary} />
          <Text style={s.badgeText}>Belmonte · Bahia · Brasil</Text>
        </View>
      </View>

      <View style={{ gap: 12, paddingBottom: 32 }}>
        <Pressable
          testID="welcome-client-cta"
          style={({ pressed }) => [s.mainCta, { opacity: pressed ? 0.9 : 1 }]}
          onPress={() => router.push("/auth/login")}
        >
          <Text style={s.mainCtaText}>Sou cliente</Text>
          <Text style={s.mainCtaSub}>Transporte, encomendas, turismo e viagens</Text>
        </Pressable>
        <Pressable testID="welcome-driver-cta" style={s.secondaryCta} onPress={() => router.push("/driver/register")}>
          <Ionicons name="car-sport" size={22} color={colors.brandSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={s.secondaryCtaText}>Sou motorista</Text>
            <Text style={s.secondaryCtaSub}>Cadastre-se e receba serviços na região</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
        <Pressable testID="welcome-login-link" style={s.linkRow} onPress={() => router.push("/auth/login")}>
          <Ionicons name="person-circle" size={20} color={colors.brandSecondary} />
          <Text style={s.linkText}>Já tenho conta · Painel do administrador</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { padding: 24 },
  hero: { alignItems: "center", paddingVertical: 40, gap: 10 },
  logo: { width: 96, height: 96, borderRadius: 24 },
  brandName: { fontSize: 30, fontFamily: fonts.brand, color: colors.onSurface, letterSpacing: 1 },
  slogan: { fontSize: 15, color: colors.onSurfaceTertiary, fontFamily: fonts.text, textAlign: "center", maxWidth: 280 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandTertiary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 6,
  },
  badgeText: { color: colors.onBrandTertiary, fontFamily: fonts.semi, fontSize: 12 },
  mainCta: {
    backgroundColor: colors.brandPrimary,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 4,
    minHeight: 76,
    justifyContent: "center",
  },
  mainCtaText: { color: colors.onBrandPrimary, fontFamily: fonts.brand, fontSize: 20 },
  mainCtaSub: { color: "#BAE6FD", fontFamily: fonts.text, fontSize: 13 },
  secondaryCta: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 72,
  },
  secondaryCtaText: { color: colors.onSurface, fontFamily: fonts.semi, fontSize: 17 },
  secondaryCtaSub: { color: colors.muted, fontFamily: fonts.text, fontSize: 12, marginTop: 2 },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, minHeight: 48 },
  linkText: { color: colors.brandSecondary, fontFamily: fonts.semi, fontSize: 15 },
}));
