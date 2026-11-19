import { useState } from "react";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { Card, EmptyState, ErrorState, Loading, Pill, Screen } from "@/src/components/ui";
import { DELIVERY_STATUS, RIDE_STATUS, TOURISM_CATEGORIES, fmtBRL, fmtDateOnly, fmtDateTime, SERVICE_LABELS } from "@/src/utils/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { Booking, Delivery, Ride } from "@/src/types";

type Tab = "servicos" | "reservas";

export default function History() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("servicos");

  const rides = useQuery({ queryKey: ["rides", "mine"], queryFn: () => api.get<Ride[]>("/rides/mine") });
  const deliveries = useQuery({ queryKey: ["deliveries", "mine"], queryFn: () => api.get<Delivery[]>("/deliveries/mine") });
  const bookings = useQuery({ queryKey: ["bookings", "mine"], queryFn: () => api.get<Booking[]>("/tourism/bookings/mine") });

  const loading = rides.isLoading || deliveries.isLoading || bookings.isLoading;
  const error = rides.error || deliveries.error || bookings.error;
  const retry = () => {
    rides.refetch();
    deliveries.refetch();
    bookings.refetch();
  };

  type Item = {
    key: string;
    icon: string;
    title: string;
    sub: string;
    statusLabel: string;
    statusTone: "info" | "success" | "warning" | "error" | "muted";
    value?: string;
    onPress: () => void;
    testID: string;
  };

  const items: Item[] = [
    ...(rides.data ?? []).map((r) => ({
      key: `r-${r.id}`,
      icon: r.service_type === "transporte" ? "car" : r.service_type === "viagem" ? "bus" : "person",
      title: `${SERVICE_LABELS[r.service_type]} · ${r.code}`,
      sub: `${r.origin.address.split(",").slice(0, 2).join(",")} → ${r.destination?.address.split(",").slice(0, 2).join(",") || "—"} · ${fmtDateTime(r.created_at)}`,
      statusLabel: RIDE_STATUS[r.status]?.label ?? r.status,
      statusTone: r.status === "completed" ? ("success" as const) : r.status === "cancelled" ? ("error" as const) : ("info" as const),
      value: fmtBRL(r.price),
      onPress: () => router.push(`/transport/${r.id}`),
      testID: `history-ride-${r.code}`,
    })),
    ...(deliveries.data ?? []).map((d) => ({
      key: `d-${d.id}`,
      icon: "cube",
      title: `Encomenda · ${d.code}`,
      sub: `${d.pickup.address.split(",").slice(0, 2).join(",")} → ${d.dropoff.address.split(",").slice(0, 2).join(",")} · ${fmtDateTime(d.created_at)}`,
      statusLabel: DELIVERY_STATUS[d.status]?.label ?? d.status,
      statusTone: d.status === "delivered" ? ("success" as const) : d.status === "cancelled" ? ("error" as const) : ("info" as const),
      value: fmtBRL(d.price),
      onPress: () => router.push(`/deliveries/${d.id}`),
      testID: `history-delivery-${d.code}`,
    })),
  ];

  return (
    <Screen scroll style={{ paddingBottom: 40 }}>
      <View style={s.header}>
        <Text style={s.title}>Histórico</Text>
        <Text style={s.subtitle}>Todos os seus serviços e reservas</Text>
      </View>

      <View style={s.tabRow}>
        <Pressable testID="history-tab-servicos" onPress={() => setTab("servicos")} style={[s.tabBtn, tab === "servicos" && s.tabBtnActive]}>
          <Text style={[s.tabText, tab === "servicos" && s.tabTextActive]}>Serviços</Text>
        </Pressable>
        <Pressable testID="history-tab-reservas" onPress={() => setTab("reservas")} style={[s.tabBtn, tab === "reservas" && s.tabBtnActive]}>
          <Text style={[s.tabText, tab === "reservas" && s.tabTextActive]}>Reservas de turismo</Text>
        </Pressable>
      </View>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message="Não foi possível carregar o histórico" onRetry={retry} />
      ) : tab === "servicos" ? (
        items.length === 0 ? (
          <EmptyState icon="receipt-outline" title="Nenhum serviço ainda" subtitle="Solicite um transporte ou envie uma encomenda para começar" />
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {items.map((it) => (
              <Pressable key={it.key} testID={it.testID} onPress={it.onPress}>
                <Card>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={s.icon}>
                      <Ionicons name={it.icon as any} size={20} color={colors.brandSecondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardTitle}>{it.title}</Text>
                      <Text style={s.cardSub} numberOfLines={2}>{it.sub}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <Pill text={it.statusLabel} tone={it.statusTone} />
                      {it.value ? <Text style={s.value}>{it.value}</Text> : null}
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )
      ) : (bookings.data ?? []).length === 0 ? (
        <EmptyState icon="sunny-outline" title="Nenhuma reserva ainda" subtitle="Explore os passeios de turismo da região" />
      ) : (
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {(bookings.data ?? []).map((b) => (
            <Pressable key={b.id} testID={`history-booking-${b.code}`} onPress={() => router.push(`/tourism/${b.package_id}`)}>
              <Card>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={s.icon}>
                    <Ionicons name="sunny" size={20} color={colors.brandSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{b.package_title}</Text>
                    <Text style={s.cardSub}>
                      {fmtDateOnly(b.date)} às {b.time} · {b.people} pessoa(s) · {b.code}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <Pill text={b.status === "confirmed" ? "Confirmada" : b.status === "cancelled" ? "Cancelada" : b.status} tone={b.status === "confirmed" ? "success" : b.status === "cancelled" ? "error" : "muted"} />
                    <Text style={s.value}>{fmtBRL(b.total)}</Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  header: { padding: 16, paddingBottom: 8 },
  title: { fontSize: 24, fontFamily: fonts.brand, color: colors.onSurface },
  subtitle: { fontSize: 13, fontFamily: fonts.text, color: colors.muted, marginTop: 2 },
  tabRow: { flexDirection: "row", gap: 8, padding: 16, paddingTop: 8 },
  tabBtn: { flex: 1, height: 40, borderRadius: 999, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  tabBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  tabText: { fontFamily: fonts.semi, fontSize: 13.5, color: colors.onSurfaceTertiary },
  tabTextActive: { color: colors.onBrandPrimary },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: colors.onSurface, fontFamily: fonts.semi, fontSize: 14 },
  cardSub: { color: colors.muted, fontFamily: fonts.text, fontSize: 12.5, marginTop: 2 },
  value: { color: colors.onSurfaceSecondary, fontFamily: fonts.semi, fontSize: 14 },
}));
