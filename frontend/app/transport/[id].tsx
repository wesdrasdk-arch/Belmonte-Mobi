import { useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image, Linking, Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, ApiError } from "@/src/api";
import { MapView } from "@/src/components/MapView";
import { Button, Card, Header, Loading, Screen, Stars, Timeline, useToast } from "@/src/components/ui";
import { RIDE_STATUS, SERVICE_LABELS, fmtBRL, fmtDateTime } from "@/src/utils/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { Ride } from "@/src/types";

const STEPS = ["Procurando motorista", "Motorista encontrado", "Motorista a caminho", "Motorista chegou", "Viagem em andamento", "Viagem concluída"];

export default function RideTracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [stars, setStars] = useState(5);
  const [comment] = useState("");
  const s = useStyles();

  const ride = useQuery({
    queryKey: ["ride", id],
    queryFn: () => api.get<Ride>(`/rides/${id}`),
    refetchInterval: (q) => (["completed", "cancelled"].includes(q.state.data?.status ?? "") ? false : 5000),
    enabled: !!id,
  });

  const cancel = useMutation({
    mutationFn: () => api.post<Ride>(`/rides/${id}/cancel`),
    onSuccess: () => {
      toast.show("Serviço cancelado", "info");
      qc.invalidateQueries();
    },
    onError: (e) => toast.show(e instanceof ApiError ? e.message : "Erro ao cancelar", "error"),
  });

  const rate = useMutation({
    mutationFn: () => api.post("/ratings", { service_type: "ride", service_id: id, stars, comment }),
    onSuccess: () => {
      toast.show("Obrigado pela avaliação!", "success");
      qc.invalidateQueries({ queryKey: ["ride", id] });
    },
    onError: (e) => toast.show(e instanceof ApiError ? e.message : "Erro ao avaliar", "error"),
  });

  const markers = useMemo(() => {
    const r = ride.data;
    if (!r) return [];
    const out: { lat: number; lng: number; label: string; color: string }[] = [];
    if (r.origin.lat) out.push({ lat: r.origin.lat, lng: r.origin.lng!, label: "Embarque", color: "#0284C7" });
    if (r.destination?.lat) out.push({ lat: r.destination.lat, lng: r.destination.lng!, label: "Destino", color: "#EF4444" });
    if (r.driver?.lat && ["accepted", "heading", "arrived", "in_progress"].includes(r.status))
      out.push({ lat: r.driver.lat, lng: r.driver.lng!, label: "Motorista", color: "#10B981" });
    return out;
  }, [ride.data]);

  function shareWhatsApp() {
    const r = ride.data;
    if (!r) return;
    const txt = `🚗 BELMONTE MOBI — ${SERVICE_LABELS[r.service_type]} ${r.code}\n📍 ${r.origin.address}\n🏁 ${r.destination?.address ?? "—"}\n🕒 ${fmtDateTime(r.scheduled_at || r.created_at)}\n💰 ${fmtBRL(r.price)}`;
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(txt)}`);
  }

  if (ride.isLoading) return <Screen><Loading label="Carregando serviço..." /></Screen>;
  if (ride.error || !ride.data)
    return (
      <Screen>
        <Header title="Serviço" onBack={() => router.back()} />
        <View style={{ padding: 24 }}>
          <Text style={{ color: colors.error, fontFamily: fonts.textSemi }}>Serviço não encontrado.</Text>
        </View>
      </Screen>
    );

  const r = ride.data;
  const statusInfo = RIDE_STATUS[r.status];
  const cancelled = r.status === "cancelled";
  const driver = r.driver;

  return (
    <Screen scroll style={{ paddingBottom: 40 }}>
      <Header title={r.code} subtitle={SERVICE_LABELS[r.service_type]} onBack={() => router.back()} />

      <View style={{ padding: 16, gap: 12 }}>
        <MapView markers={markers} route={r.route} height={210} />

        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <Text testID="ride-status-label" style={s.status}>{statusInfo?.label ?? r.status}</Text>
            <Text testID="ride-price-label" style={s.price}>{fmtBRL(r.price)}</Text>
          </View>
          <Timeline steps={STEPS} currentStep={statusInfo?.step ?? 0} cancelled={cancelled} />
          {r.cancel_fee ? <Text style={s.feeText}>Taxa de cancelamento aplicada: {fmtBRL(r.cancel_fee)}</Text> : null}
        </Card>

        {driver ? (
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {driver.vehicle?.photo_url ? (
                <Image source={{ uri: driver.vehicle.photo_url }} style={s.vehiclePhoto} />
              ) : (
                <View style={[s.vehiclePhoto, { alignItems: "center", justifyContent: "center" }]}>
                  <Ionicons name="car" size={26} color={colors.brandSecondary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.driverName}>{driver.name}</Text>
                {driver.vehicle ? (
                  <Text style={s.driverSub}>
                    {driver.vehicle.model} · {driver.vehicle.color} · {driver.vehicle.plate}
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <Stars value={driver.rating_avg} size={14} />
                  <Text style={s.ratingText}>{driver.rating_avg > 0 ? `${driver.rating_avg} (${driver.rating_count})` : "Novo motorista"}</Text>
                </View>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Button label="LIGAR" variant="secondary" icon="call" small testID="ride-call-driver-button" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${driver.phone}`)} />
              <Button label="WHATSAPP" variant="whatsapp" icon="logo-whatsapp" small testID="ride-whatsapp-driver-button" style={{ flex: 1 }} onPress={() => Linking.openURL(`https://wa.me/${driver.phone.replace(/\D/g, "")}`)} />
            </View>
          </Card>
        ) : null}

        <Card style={{ gap: 8 }}>
          <View style={s.detailRow}>
            <Ionicons name="radio-button-on" size={16} color={colors.brandSecondary} />
            <Text style={s.detailText} numberOfLines={2}>{r.origin.address}</Text>
          </View>
          {r.destination ? (
            <View style={s.detailRow}>
              <Ionicons name="flag" size={16} color={colors.error} />
              <Text style={s.detailText} numberOfLines={2}>{r.destination.address}</Text>
            </View>
          ) : null}
          <View style={s.detailRow}>
            <Ionicons name="cash" size={16} color={colors.brandSecondary} />
            <Text style={s.detailText}>{r.payment_method === "pix" ? "Pix" : "Dinheiro"} · {r.distance_km} km · {r.passengers} passageiro(s)</Text>
          </View>
          {r.payment_method === "pix" && r.status === "completed" ? (
            <Text style={s.pixNote}>Pague via Pix para o motorista ao final da viagem.</Text>
          ) : null}
          {r.notes ? (
            <View style={s.detailRow}>
              <Ionicons name="chatbubble-ellipses" size={16} color={colors.muted} />
              <Text style={s.detailText}>{r.notes}</Text>
            </View>
          ) : null}
        </Card>

        {r.status === "completed" && !r.rated ? (
          <Card style={{ gap: 12 }}>
            <Text style={s.rateTitle}>Como foi seu serviço?</Text>
            <Stars value={stars} onChange={setStars} testIDPrefix="ride-rating-star" />
            <Button label="ENVIAR AVALIAÇÃO" testID="ride-rating-submit" onPress={() => rate.mutate()} loading={rate.isPending} />
          </Card>
        ) : null}

        {["searching", "scheduled", "accepted", "heading", "arrived"].includes(r.status) ? (
          showConfirmCancel ? (
            <Card style={{ gap: 10 }}>
              <Text style={s.confirmText}>Cancelar este serviço? Pode haver taxa de cancelamento se o motorista já foi encontrado.</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button label="MANTER" variant="secondary" small testID="ride-cancel-keep" style={{ flex: 1 }} onPress={() => setShowConfirmCancel(false)} />
                <Button label="CANCELAR SERVIÇO" variant="danger" small testID="ride-cancel-confirm" style={{ flex: 1 }} onPress={() => cancel.mutate()} loading={cancel.isPending} />
              </View>
            </Card>
          ) : (
            <Button label="CANCELAR SERVIÇO" variant="secondary" icon="close" testID="ride-cancel-button" onPress={() => setShowConfirmCancel(true)} />
          )
        ) : null}

        <Button label="COMPARTILHAR NO WHATSAPP" variant="secondary" icon="share-social" testID="ride-share-button" onPress={shareWhatsApp} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  status: { fontSize: 18, fontFamily: fonts.display, color: colors.onSurface, flex: 1, flexWrap: "wrap" },
  price: { fontSize: 20, fontFamily: fonts.brand, color: colors.brandSecondary },
  vehiclePhoto: { width: 64, height: 64, borderRadius: 14, backgroundColor: colors.brandTertiary },
  driverName: { fontSize: 16, fontFamily: fonts.semi, color: colors.onSurface },
  driverSub: { fontSize: 13, fontFamily: fonts.text, color: colors.muted, marginTop: 2 },
  ratingText: { fontSize: 12.5, fontFamily: fonts.textMedium, color: colors.onSurfaceTertiary },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  detailText: { flex: 1, color: colors.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 13.5, lineHeight: 19 },
  pixNote: { color: colors.warning, fontFamily: fonts.textSemi, fontSize: 12.5 },
  feeText: { color: colors.error, fontFamily: fonts.textSemi, fontSize: 12.5, marginTop: 8 },
  rateTitle: { fontSize: 16, fontFamily: fonts.semi, color: colors.onSurface },
  confirmText: { color: colors.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 13.5 },
}));
