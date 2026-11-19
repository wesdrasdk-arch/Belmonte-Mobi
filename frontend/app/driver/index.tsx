import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Linking, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, ApiError } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Card, EmptyState, Pill, Screen, useToast } from "@/src/components/ui";
import { DELIVERY_STATUS, RIDE_STATUS, SERVICE_LABELS, fmtBRL, fmtDateTime } from "@/src/utils/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { Delivery, Ride } from "@/src/types";

type Summary = { today_earnings: number; today_services: number; total_earnings: number; rating_avg: number; rating_count: number; online: boolean; status: string };
type Jobs = { active_ride: Ride | null; active_delivery: Delivery | null; rides: Ride[]; deliveries: Delivery[] };

const RIDE_NEXT: Record<string, { action: string; label: string; icon: string }> = {
  accepted: { action: "heading", label: "INICIAR SERVIÇO", icon: "navigate" },
  heading: { action: "arrive", label: "CHEGUEI", icon: "location" },
  arrived: { action: "start", label: "INICIAR VIAGEM", icon: "play" },
  in_progress: { action: "complete", label: "FINALIZAR", icon: "checkmark-done" },
};
const DELIVERY_NEXT: Record<string, { action: string; label: string; icon: string }> = {
  assigned: { action: "collect", label: "ENCOMENDA COLETADA", icon: "cube" },
  collected: { action: "transit", label: "INICIAR TRANSPORTE", icon: "navigate" },
  in_transit: { action: "deliver", label: "CONFIRMAR ENTREGA", icon: "checkmark-done" },
};

export default function DriverHome() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [declined, setDeclined] = useState<string[]>([]);
  const [deliveryCode, setDeliveryCode] = useState("");
  const [tab, setTab] = useState<"pedidos" | "historico">("pedidos");

  const summary = useQuery({ queryKey: ["driver", "summary"], queryFn: () => api.get<Summary>("/driver/summary"), refetchInterval: 10000 });
  const online = summary.data?.online ?? false;
  const approved = summary.data?.status === "approved";
  const available = useQuery({
    queryKey: ["driver", "available"],
    queryFn: () => api.get<{ rides: Ride[]; deliveries: Delivery[] }>("/driver/available"),
    refetchInterval: 5000,
    enabled: online && approved,
  });
  const jobs = useQuery({ queryKey: ["driver", "jobs"], queryFn: () => api.get<Jobs>("/driver/jobs"), refetchInterval: 5000 });

  const refreshAll = () => qc.invalidateQueries({ queryKey: ["driver"] });

  const toggle = useMutation({
    mutationFn: (v: boolean) => api.post("/driver/online", { online: v }),
    onSuccess: refreshAll,
    onError: (e) => toast.show(e instanceof ApiError ? e.message : "Erro ao alterar status", "error"),
  });

  // Envia localização periodicamente quando online (com permissão).
  useEffect(() => {
    if (!online) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      let granted = perm.granted;
      if (!granted && perm.canAskAgain) granted = (await Location.requestForegroundPermissionsAsync()).granted;
      if (!granted) return;
      const send = async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          await api.post("/driver/location", { lat: loc.coords.latitude, lng: loc.coords.longitude });
        } catch {
          /* silencioso */
        }
      };
      send();
      timer = setInterval(send, 20000);
    })();
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [online]);

  const act = useMutation({
    mutationFn: ({ kind, id, action, body }: { kind: "rides" | "deliveries"; id: string; action: string; body?: object }) =>
      api.post(`/driver/${kind}/${id}/${action}`, body ?? {}),
    onSuccess: (_, vars) => {
      if (vars.action === "complete" || vars.action === "deliver") toast.show("Serviço finalizado! Valor creditado.", "success");
      else if (vars.action === "accept") toast.show("Serviço aceito!", "success");
      setDeliveryCode("");
      refreshAll();
    },
    onError: (e) => toast.show(e instanceof ApiError ? e.message : "Erro na ação", "error"),
  });

  const activeRide = jobs.data?.active_ride;
  const activeDelivery = jobs.data?.active_delivery;
  const hasActive = !!(activeRide || activeDelivery);
  const reqRides = (available.data?.rides ?? []).filter((r) => !declined.includes(r.id));
  const reqDeliveries = (available.data?.deliveries ?? []).filter((d) => !declined.includes(d.id));

  const maps = (lat?: number | null, lng?: number | null, addr?: string) =>
    Linking.openURL(lat && lng ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr ?? "")}`);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refreshAll} tintColor={colors.brandPrimary} />}
      >
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.brand}>BELMONTE MOBI</Text>
            <Text style={s.hello}>Motorista · {user?.name?.split(" ")[0]}</Text>
          </View>
          <Pressable testID="driver-notifications-button" style={s.iconBtn} onPress={() => router.push("/driver/notifications")}>
            <Ionicons name="notifications" size={20} color={colors.brandSecondary} />
          </Pressable>
          <Pressable testID="driver-profile-button" style={s.iconBtn} onPress={() => router.push("/driver/profile")}>
            <Ionicons name="person" size={20} color={colors.brandSecondary} />
          </Pressable>
        </View>

        {!approved && summary.data ? (
          <Card testID="driver-not-approved-card" style={{ backgroundColor: "#FEF3C7", borderColor: "#FDE68A" }}>
            <Text style={{ color: "#B45309", fontFamily: fonts.textSemi, lineHeight: 20 }}>
              {summary.data.status === "pending"
                ? "Seu cadastro está em análise. Você poderá receber serviços após a aprovação do administrador."
                : summary.data.status === "rejected"
                  ? "Cadastro reprovado. Atualize seus documentos no perfil."
                  : "Conta bloqueada. Fale com o suporte."}
            </Text>
            <Button label="COMPLETAR PERFIL" small variant="secondary" testID="driver-complete-profile" style={{ marginTop: 10 }} onPress={() => router.push("/driver/profile")} />
          </Card>
        ) : null}

        <Card style={[s.statusCard, { backgroundColor: online ? colors.success : colors.surfaceInverse }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.statusLabel}>{online ? "🟢 ONLINE" : "🔴 OFFLINE"}</Text>
            <Text style={s.statusSub}>{online ? "Recebendo solicitações da região" : "Fique online para receber serviços"}</Text>
          </View>
          <Switch
            testID="driver-online-switch"
            value={online}
            disabled={toggle.isPending}
            onValueChange={(v) => toggle.mutate(v)}
            trackColor={{ true: "#A7F3D0", false: "#475569" }}
            thumbColor="#FFFFFF"
          />
        </Card>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Card style={s.statCard}>
            <Text style={s.statLabel}>Hoje</Text>
            <Text testID="driver-today-earnings" style={s.statValue}>{fmtBRL(summary.data?.today_earnings ?? 0)}</Text>
            <Text style={s.statSub}>{summary.data?.today_services ?? 0} serviço(s)</Text>
          </Card>
          <Card style={s.statCard}>
            <Text style={s.statLabel}>Total</Text>
            <Text style={s.statValue}>{fmtBRL(summary.data?.total_earnings ?? 0)}</Text>
            <Text style={s.statSub}>★ {(summary.data?.rating_avg ?? 0).toFixed(1)} ({summary.data?.rating_count ?? 0})</Text>
          </Card>
        </View>

        {activeRide ? (
          <Card testID="driver-active-ride-card" style={{ gap: 8, borderColor: colors.brandPrimary, borderWidth: 1.5 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={s.cardTitle}>{SERVICE_LABELS[activeRide.service_type]} · {activeRide.code}</Text>
              <Pill text={RIDE_STATUS[activeRide.status]?.label ?? ""} />
            </View>
            <Text style={s.line}>👤 {activeRide.client_name} · {activeRide.passengers} passageiro(s)</Text>
            <Text style={s.line}>📍 {activeRide.origin.address}</Text>
            {activeRide.destination ? <Text style={s.line}>🏁 {activeRide.destination.address}</Text> : null}
            {activeRide.hours ? <Text style={s.line}>⏱ {activeRide.hours} hora(s) à disposição</Text> : null}
            {activeRide.notes ? <Text style={s.line}>📝 {activeRide.notes}</Text> : null}
            <Text style={s.price}>{fmtBRL(activeRide.price)} · {activeRide.payment_method === "pix" ? "Pix" : "Dinheiro"}</Text>
            <Button
              label="ABRIR ROTA NO MAPA"
              small
              variant="secondary"
              icon="map"
              testID="driver-open-map"
              onPress={() =>
                ["accepted", "heading"].includes(activeRide.status)
                  ? maps(activeRide.origin.lat, activeRide.origin.lng, activeRide.origin.address)
                  : maps(activeRide.destination?.lat, activeRide.destination?.lng, activeRide.destination?.address)
              }
            />
            {RIDE_NEXT[activeRide.status] ? (
              <Button
                label={RIDE_NEXT[activeRide.status].label}
                icon={RIDE_NEXT[activeRide.status].icon}
                variant={activeRide.status === "in_progress" ? "success" : "primary"}
                testID="driver-ride-next-action"
                loading={act.isPending}
                onPress={() => act.mutate({ kind: "rides", id: activeRide.id, action: RIDE_NEXT[activeRide.status].action })}
              />
            ) : null}
          </Card>
        ) : null}

        {activeDelivery ? (
          <Card testID="driver-active-delivery-card" style={{ gap: 8, borderColor: colors.brandPrimary, borderWidth: 1.5 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={s.cardTitle}>Encomenda · {activeDelivery.code}</Text>
              <Pill text={DELIVERY_STATUS[activeDelivery.status]?.label ?? ""} />
            </View>
            <Text style={s.line}>📦 {activeDelivery.description} ({activeDelivery.size}, {activeDelivery.weight_kg} kg)</Text>
            <Text style={s.line}>📍 Coleta: {activeDelivery.pickup.address}</Text>
            <Text style={s.line}>🏁 Entrega: {activeDelivery.dropoff.address}</Text>
            <Text style={s.line}>👤 {activeDelivery.recipient_name} · {activeDelivery.recipient_phone}</Text>
            <Text style={s.price}>{fmtBRL(activeDelivery.price)}</Text>
            {activeDelivery.status === "in_transit" ? (
              <TextInput
                testID="driver-delivery-code-input"
                style={s.codeInput}
                placeholder="Código do cliente (4 dígitos)"
                placeholderTextColor="#94A3B8"
                keyboardType="number-pad"
                maxLength={4}
                value={deliveryCode}
                onChangeText={setDeliveryCode}
              />
            ) : null}
            {DELIVERY_NEXT[activeDelivery.status] ? (
              <Button
                label={DELIVERY_NEXT[activeDelivery.status].label}
                icon={DELIVERY_NEXT[activeDelivery.status].icon}
                testID="driver-delivery-next-action"
                loading={act.isPending}
                disabled={activeDelivery.status === "in_transit" && deliveryCode.length < 4}
                onPress={() =>
                  act.mutate({
                    kind: "deliveries",
                    id: activeDelivery.id,
                    action: DELIVERY_NEXT[activeDelivery.status].action,
                    body: activeDelivery.status === "in_transit" ? { code: deliveryCode } : undefined,
                  })
                }
              />
            ) : null}
          </Card>
        ) : null}

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable testID="driver-tab-pedidos" style={[s.tabBtn, tab === "pedidos" && s.tabBtnActive]} onPress={() => setTab("pedidos")}>
            <Text style={[s.tabText, tab === "pedidos" && s.tabTextActive]}>Solicitações</Text>
          </Pressable>
          <Pressable testID="driver-tab-historico" style={[s.tabBtn, tab === "historico" && s.tabBtnActive]} onPress={() => setTab("historico")}>
            <Text style={[s.tabText, tab === "historico" && s.tabTextActive]}>Histórico</Text>
          </Pressable>
        </View>

        {tab === "pedidos" ? (
          !online || !approved ? (
            <EmptyState icon="power" title="Você está offline" subtitle="Ative o modo ONLINE para ver novas solicitações" />
          ) : reqRides.length + reqDeliveries.length === 0 ? (
            <EmptyState icon="hourglass-outline" title="Aguardando solicitações" subtitle="Novos pedidos aparecem aqui automaticamente" />
          ) : (
            <>
              {reqRides.map((r) => (
                <Card key={r.id} testID={`driver-request-${r.code}`} style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={s.cardTitle}>{SERVICE_LABELS[r.service_type]}</Text>
                    <Text style={s.price}>{fmtBRL(r.price)}</Text>
                  </View>
                  <Text style={s.line}>📍 {r.origin.address}</Text>
                  {r.destination ? <Text style={s.line}>🏁 {r.destination.address}</Text> : null}
                  <Text style={s.line}>
                    {r.distance_km ? `${r.distance_km} km · ` : ""}{r.passengers} passageiro(s){r.hours ? ` · ${r.hours}h` : ""} · {r.scheduled_at ? `Agendado ${fmtDateTime(r.scheduled_at)}` : "Agora"}
                  </Text>
                  {r.notes ? <Text style={s.line}>📝 {r.notes}</Text> : null}
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                    <Button label="RECUSAR" variant="secondary" small style={{ flex: 1 }} testID={`driver-decline-${r.code}`} onPress={() => setDeclined([...declined, r.id])} />
                    <Button label="ACEITAR" variant="success" small style={{ flex: 1 }} disabled={hasActive} testID={`driver-accept-${r.code}`} onPress={() => act.mutate({ kind: "rides", id: r.id, action: "accept" })} />
                  </View>
                </Card>
              ))}
              {reqDeliveries.map((d) => (
                <Card key={d.id} testID={`driver-request-${d.code}`} style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={s.cardTitle}>Encomenda</Text>
                    <Text style={s.price}>{fmtBRL(d.price)}</Text>
                  </View>
                  <Text style={s.line}>📦 {d.description} · {d.size} · {d.weight_kg} kg</Text>
                  <Text style={s.line}>📍 {d.pickup.address}</Text>
                  <Text style={s.line}>🏁 {d.dropoff.address}</Text>
                  <Text style={s.line}>{d.distance_km} km</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                    <Button label="RECUSAR" variant="secondary" small style={{ flex: 1 }} testID={`driver-decline-${d.code}`} onPress={() => setDeclined([...declined, d.id])} />
                    <Button label="ACEITAR" variant="success" small style={{ flex: 1 }} disabled={hasActive} testID={`driver-accept-${d.code}`} onPress={() => act.mutate({ kind: "deliveries", id: d.id, action: "accept" })} />
                  </View>
                </Card>
              ))}
              {hasActive ? <Text style={s.hint}>Finalize o serviço atual para aceitar outro.</Text> : null}
            </>
          )
        ) : (jobs.data?.rides.length ?? 0) + (jobs.data?.deliveries.length ?? 0) === 0 ? (
          <EmptyState icon="receipt-outline" title="Nenhum serviço realizado ainda" />
        ) : (
          <>
            {jobs.data?.rides.map((r) => (
              <Card key={r.id} testID={`driver-history-${r.code}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={s.cardTitle}>{SERVICE_LABELS[r.service_type]} · {r.code}</Text>
                  <Text style={s.price}>{fmtBRL(r.price)}</Text>
                </View>
                <Text style={s.line}>{fmtDateTime(r.created_at)} · {RIDE_STATUS[r.status]?.label}</Text>
              </Card>
            ))}
            {jobs.data?.deliveries.map((d) => (
              <Card key={d.id} testID={`driver-history-${d.code}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={s.cardTitle}>Encomenda · {d.code}</Text>
                  <Text style={s.price}>{fmtBRL(d.price)}</Text>
                </View>
                <Text style={s.line}>{fmtDateTime(d.created_at)} · {DELIVERY_STATUS[d.status]?.label}</Text>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  brand: { fontSize: 20, fontFamily: fonts.brand, color: colors.brandSecondary },
  hello: { fontSize: 13, fontFamily: fonts.text, color: colors.muted },
  iconBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  statusCard: { flexDirection: "row", alignItems: "center", borderWidth: 0, paddingVertical: 20 },
  statusLabel: { color: "#FFFFFF", fontFamily: fonts.brand, fontSize: 20 },
  statusSub: { color: "#E2E8F0", fontFamily: fonts.text, fontSize: 13, marginTop: 2 },
  statCard: { flex: 1, gap: 2 },
  statLabel: { fontSize: 12, fontFamily: fonts.textSemi, color: colors.muted },
  statValue: { fontSize: 20, fontFamily: fonts.brand, color: colors.onSurface },
  statSub: { fontSize: 12, fontFamily: fonts.text, color: colors.muted },
  cardTitle: { fontSize: 15, fontFamily: fonts.semi, color: colors.onSurface, flex: 1 },
  line: { fontSize: 13.5, fontFamily: fonts.text, color: colors.onSurfaceSecondary, lineHeight: 19 },
  price: { fontSize: 16, fontFamily: fonts.brand, color: colors.brandSecondary },
  codeInput: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, minHeight: 52, fontSize: 22, textAlign: "center", letterSpacing: 6, fontFamily: fonts.display, color: colors.onSurface },
  tabBtn: { flex: 1, height: 40, borderRadius: 999, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  tabBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  tabText: { fontFamily: fonts.semi, fontSize: 13.5, color: colors.onSurfaceTertiary },
  tabTextActive: { color: colors.onBrandPrimary },
  hint: { textAlign: "center", color: colors.muted, fontFamily: fonts.text, fontSize: 12.5 },
}));
