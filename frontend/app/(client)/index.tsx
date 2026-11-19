import { useMemo, useState } from "react";
import { Link, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, Text, View } from "react-native";
import * as Location from "expo-location";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Card, Pill, Screen, useToast } from "@/src/components/ui";
import { DELIVERY_STATUS, RIDE_STATUS, fmtBRL, SERVICE_LABELS } from "@/src/utils/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { Booking, Delivery, PublicSettings, Ride } from "@/src/types";
import { usesNativeTabs } from "@/src/navigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SERVICES = [
  { key: "transporte", label: "TRANSPORTE", icon: "car", href: "/transport/new", testID: "service-transporte-card" },
  { key: "turismo", label: "TURISMO", icon: "umbrella", href: "/tourism", testID: "service-turismo-card" },
  { key: "encomendas", label: "ENCOMENDAS", icon: "cube", href: "/deliveries/new", testID: "service-encomendas-card" },
  { key: "viagens", label: "VIAGENS", icon: "bus", href: "/trips/new", testID: "service-viagens-card" },
  { key: "agendar", label: "AGENDAR", icon: "calendar", href: "/schedule", testID: "service-agendar-card" },
  { key: "motorista", label: "MOTORISTA", icon: "person", href: "/trips/new?mode=disponivel", testID: "service-motorista-card" },
];

export default function ClientHome() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { user } = useAuth();
  const qc = useQueryClient();
  const [locLabel, setLocLabel] = useState("Belmonte, BA");

  const activeRide = useQuery({
    queryKey: ["rides", "active"],
    queryFn: () => api.get<Ride | null>("/rides/active"),
    refetchInterval: 5000,
  });
  const activeDelivery = useQuery({
    queryKey: ["deliveries", "active"],
    queryFn: () => api.get<Delivery | null>("/deliveries/active"),
    refetchInterval: 5000,
  });
  const bookings = useQuery({
    queryKey: ["bookings", "mine"],
    queryFn: () => api.get<Booking[]>("/tourism/bookings/mine"),
  });
  const settings = useQuery({ queryKey: ["settings", "public"], queryFn: () => api.get<PublicSettings>("/settings/public") });
  const rides = useQuery({
    queryKey: ["rides", "mine"],
    queryFn: () => api.get<Ride[]>("/rides/mine"),
  });

  const reverse = useMutation({
    mutationFn: async (loc: Location.LocationObject) => {
      return api.get<{ label: string }>(`/reverse?lat=${loc.coords.latitude}&lng=${loc.coords.longitude}`);
    },
    onSuccess: (data) => setLocLabel(data.label.split(",").slice(0, 2).join(",")),
    onError: () => toast.show("Não foi possível obter seu endereço", "error"),
  });

  async function locateMe() {
    const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
    let perm = { status, canAskAgain };
    if (status !== "granted") {
      if (!canAskAgain) {
        toast.show("Ative a localização nos ajustes do app", "error");
        Linking.openSettings();
        return;
      }
      perm = await Location.requestForegroundPermissionsAsync();
    }
    if (perm.status !== "granted") {
      toast.show("Precisamos da sua localização para buscar motoristas próximos", "error");
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    reverse.mutate(loc);
    toast.show("Localização atualizada", "success");
  }

  const activeBooking = useMemo(
    () => bookings.data?.find((b) => b.status === "confirmed"),
    [bookings.data],
  );

  const activeService = activeRide.data
    ? { kind: "ride", item: activeRide.data }
    : activeDelivery.data
      ? { kind: "delivery", item: activeDelivery.data }
      : activeBooking
        ? { kind: "booking", item: activeBooking }
        : null;

  const activeLabel = activeService
    ? activeService.kind === "ride"
      ? `${SERVICE_LABELS[(activeService.item as Ride).service_type]} · ${RIDE_STATUS[(activeService.item as Ride).status]?.label}`
      : activeService.kind === "delivery"
        ? `Encomenda · ${DELIVERY_STATUS[(activeService.item as Delivery).status]?.label}`
        : `Reserva · ${(activeService.item as Booking).package_title}`
    : null;

  function openTracking() {
    if (!activeService) return;
    if (activeService.kind === "ride") router.push(`/transport/${(activeService.item as Ride).id}`);
    else if (activeService.kind === "delivery") router.push(`/deliveries/${(activeService.item as Delivery).id}`);
    else router.push("/history");
  }

  function whatsappSupport() {
    const num = (settings.data?.whatsapp_support ?? "").replace(/\D/g, "");
    if (!num) {
      toast.show("Suporte temporariamente indisponível", "error");
      return;
    }
    Linking.openURL(`https://wa.me/${num}?text=${encodeURIComponent("Olá! Preciso de ajuda com o BELMONTE MOBI.")}`);
  }

  const recent = rides.data?.slice(0, 3) ?? [];

  return (
    <Screen scroll style={{ paddingBottom: 110 }}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.brandName}>BELMONTE MOBI</Text>
          <Text style={s.slogan}>Transporte, Turismo e Entregas na palma da sua mão.</Text>
        </View>
        <Pressable testID="home-notifications-button" onPress={() => router.push("/(client)/notifications")} style={s.bell}>
          <Ionicons name="notifications" size={22} color={colors.brandSecondary} />
        </Pressable>
      </View>

      <Pressable testID="home-location-chip" style={s.locChip} onPress={locateMe}>
        <Ionicons name="location" size={16} color={colors.onBrandTertiary} />
        {reverse.isPending ? (
          <ActivityIndicator size="small" color={colors.onBrandTertiary} />
        ) : (
          <Text style={s.locText} numberOfLines={1}>
            {locLabel}
          </Text>
        )}
        <Ionicons name="refresh" size={14} color={colors.onBrandTertiary} />
      </Pressable>

      <Text style={s.hello}>Olá, {user?.name?.split(" ")[0] ?? "bem-vindo"}!</Text>

      {activeService ? (
        <Pressable testID="home-active-service-card" style={s.activeBanner} onPress={openTracking}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.activeBannerTitle}>Serviço em andamento</Text>
            <Text style={s.activeBannerText}>{activeLabel}</Text>
            <Text style={s.activeBannerCode}>{activeService.item.code}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      ) : null}

      <View style={s.grid}>
        {SERVICES.map((svc) => (
          <Pressable
            key={svc.key}
            testID={svc.testID}
            style={({ pressed }) => [s.gridCard, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => router.push(svc.href as never)}
          >
            <View style={s.gridIcon}>
              <Ionicons name={svc.icon as any} size={26} color={colors.brandSecondary} />
            </View>
            <Text style={s.gridLabel}>{svc.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.sectionRow}>
        <Text style={s.sectionTitle}>Últimos serviços</Text>
        <Link href="/(client)/history" asChild>
          <Pressable testID="home-history-link">
            <Text style={s.seeAll}>Ver tudo</Text>
          </Pressable>
        </Link>
      </View>

      {recent.length === 0 ? (
        <Card style={s.emptyCard}>
          <Text style={s.emptyText}>Você ainda não fez nenhum serviço. Peça seu primeiro transporte!</Text>
        </Card>
      ) : (
        recent.map((r) => (
          <Pressable key={r.id} testID={`home-recent-${r.code}`} onPress={() => router.push(`/transport/${r.id}`)}>
            <Card style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={s.recentIcon}>
                  <Ionicons name={r.service_type === "transporte" ? "car" : r.service_type === "viagem" ? "bus" : "person"} size={20} color={colors.brandSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.recentTitle}>{SERVICE_LABELS[r.service_type]} · {r.code}</Text>
                  <Text style={s.recentSub} numberOfLines={1}>
                    {r.origin.address.split(",").slice(0, 2).join(",")} → {r.destination?.address.split(",").slice(0, 2).join(",") || "—"}
                  </Text>
                </View>
                <Pill text={RIDE_STATUS[r.status]?.label ?? r.status} tone={r.status === "completed" ? "success" : r.status === "cancelled" ? "error" : "info"} />
              </View>
            </Card>
          </Pressable>
        ))
      )}

      <View style={[s.supportRow, { bottom: bottomChrome + 16 }]}>
        <Button label="FALAR COM SUPORTE" variant="whatsapp" icon="logo-whatsapp" testID="home-support-button" onPress={whatsappSupport} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  header: { flexDirection: "row", alignItems: "flex-start", padding: 16, paddingBottom: 8, gap: 12 },
  brandName: { fontSize: 24, fontFamily: fonts.brand, color: colors.brandSecondary, letterSpacing: 0.5 },
  slogan: { fontSize: 12.5, color: colors.muted, fontFamily: fonts.text, marginTop: 2, maxWidth: 260 },
  bell: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  locChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: colors.brandTertiary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  locText: { color: colors.onBrandTertiary, fontFamily: fonts.semi, fontSize: 12.5, maxWidth: 240 },
  hello: { paddingHorizontal: 16, paddingVertical: 12, fontSize: 20, fontFamily: fonts.display, color: colors.onSurface },
  activeBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brandSecondary,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  activeBannerTitle: { color: "#BAE6FD", fontSize: 12, fontFamily: fonts.semi },
  activeBannerText: { color: colors.onBrandPrimary, fontSize: 15, fontFamily: fonts.semi },
  activeBannerCode: { color: "#BAE6FD", fontSize: 12, fontFamily: fonts.textMedium },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 16 },
  gridCard: {
    width: "31%",
    minWidth: 150,
    flexGrow: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: 16,
    gap: 10,
    minHeight: 108,
  },
  gridIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  gridLabel: { fontSize: 13, fontFamily: fonts.semi, color: colors.onSurface, letterSpacing: 0.3 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 16 },
  sectionTitle: { fontSize: 17, fontFamily: fonts.display, color: colors.onSurface },
  seeAll: { color: colors.brandSecondary, fontFamily: fonts.semi, fontSize: 14 },
  emptyCard: { marginHorizontal: 16 },
  emptyText: { color: colors.onSurfaceTertiary, fontFamily: fonts.text, textAlign: "center" },
  recentIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  recentTitle: { color: colors.onSurface, fontFamily: fonts.semi, fontSize: 14 },
  recentSub: { color: colors.muted, fontFamily: fonts.text, fontSize: 12.5, marginTop: 2 },
  supportRow: { position: "absolute", left: 16, right: 16 },
}));
