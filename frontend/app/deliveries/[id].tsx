import { useMemo, useState } from "react";
import { MapView } from "@/src/components/MapView";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Linking, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, ApiError } from "@/src/api";
import { Button, Card, Header, Loading, Pill, Screen, Stars, Timeline, useToast } from "@/src/components/ui";
import { DELIVERY_STATUS, fmtBRL, fmtDateTime } from "@/src/utils/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { Delivery } from "@/src/types";

const STEPS = ["Solicitação criada", "Motorista designado", "Encomenda coletada", "Em transporte", "Entregue"];

export default function DeliveryTracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const [stars, setStars] = useState(5);
  const s = useStyles();

  const delivery = useQuery({
    queryKey: ["delivery", id],
    queryFn: () => api.get<Delivery[]>(`/deliveries/mine`),
    refetchInterval: 5000,
    enabled: !!id,
    select: (list: Delivery[]) => list.find((d) => d.id === id),
  });

  const cancel = useMutation({
    mutationFn: () => api.post<Delivery>(`/deliveries/${id}/cancel`),
    onSuccess: () => {
      toast.show("Encomenda cancelada", "info");
      qc.invalidateQueries();
    },
    onError: (e) => toast.show(e instanceof ApiError ? e.message : "Erro ao cancelar", "error"),
  });

  const rate = useMutation({
    mutationFn: () => api.post("/ratings", { service_type: "delivery", service_id: id, stars, comment: "" }),
    onSuccess: () => {
      toast.show("Obrigado pela avaliação!", "success");
      qc.invalidateQueries();
    },
    onError: (e) => toast.show(e instanceof ApiError ? e.message : "Erro ao avaliar", "error"),
  });

  const markers = useMemo(() => {
    const d = delivery.data;
    if (!d) return [];
    const out: { lat: number; lng: number; label: string; color: string }[] = [];
    if (d.pickup.lat) out.push({ lat: d.pickup.lat, lng: d.pickup.lng!, label: "Coleta", color: "#0284C7" });
    if (d.dropoff.lat) out.push({ lat: d.dropoff.lat, lng: d.dropoff.lng!, label: "Entrega", color: "#10B981" });
    return out;
  }, [delivery.data]);

  function shareWhatsApp() {
    const d = delivery.data;
    if (!d) return;
    const txt = `📦 Rastreamento BELMONTE MOBI\nCódigo: ${d.code}\nStatus: ${DELIVERY_STATUS[d.status]?.label}\nColeta: ${d.pickup.address}\nEntrega: ${d.dropoff.address}`;
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(txt)}`);
  }

  if (delivery.isLoading) return <Screen><Loading label="Carregando encomenda..." /></Screen>;
  if (delivery.error || !delivery.data)
    return (
      <Screen>
        <Header title="Encomenda" onBack={() => router.back()} />
        <View style={{ padding: 24 }}>
          <Text style={{ color: colors.error, fontFamily: fonts.textSemi }}>Encomenda não encontrada.</Text>
        </View>
      </Screen>
    );

  const d = delivery.data;
  const statusInfo = DELIVERY_STATUS[d.status];

  return (
    <Screen scroll style={{ paddingBottom: 40 }}>
      <Header title={d.code} subtitle="Rastreamento da encomenda" onBack={() => router.back()} />
      <View style={{ padding: 16, gap: 12 }}>
        <Card style={{ alignItems: "center", gap: 6, backgroundColor: colors.brandSecondary }}>
          <Text style={{ color: "#BAE6FD", fontFamily: fonts.semi, fontSize: 12 }}>CÓDIGO DE CONFIRMAÇÃO DA ENTREGA</Text>
          <Text testID="delivery-confirmation-code" style={{ color: colors.onBrandPrimary, fontFamily: fonts.brand, fontSize: 34, letterSpacing: 8 }}>
            {d.delivery_code}
          </Text>
          <Text style={{ color: "#BAE6FD", fontFamily: fonts.text, fontSize: 11.5, textAlign: "center" }}>
            Passe este código ao motorista para confirmar a entrega
          </Text>
        </Card>

        <MapView markers={markers} height={180} />

        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text testID="delivery-status-label" style={s.status}>{statusInfo?.label ?? d.status}</Text>
            <Pill text={fmtBRL(d.price)} tone="info" />
          </View>
          <Timeline steps={STEPS} currentStep={statusInfo?.step ?? 0} cancelled={d.status === "cancelled"} />
        </Card>

        {d.driver ? (
          <Card style={{ gap: 4 }}>
            <Text style={s.driverName}>{d.driver.name}</Text>
            {d.driver.vehicle ? <Text style={s.sub}>{d.driver.vehicle.model} · {d.driver.vehicle.plate}</Text> : null}
            <Button label="LIGAR PARA O MOTORISTA" variant="secondary" icon="call" small testID="delivery-call-driver-button" onPress={() => Linking.openURL(`tel:${d.driver!.phone}`)} />
          </Card>
        ) : null}

        <Card style={{ gap: 8 }}>
          <View style={s.row}><Ionicons name="cube" size={16} color={colors.brandSecondary} /><Text style={s.text}>{d.description}</Text></View>
          <View style={s.row}><Ionicons name="call" size={16} color={colors.brandSecondary} /><Text style={s.text}>{d.recipient_name} · {d.recipient_phone}</Text></View>
          <View style={s.row}><Ionicons name="radio-button-on" size={16} color={colors.brandSecondary} /><Text style={s.text}>{d.pickup.address}</Text></View>
          <View style={s.row}><Ionicons name="flag" size={16} color={colors.error} /><Text style={s.text}>{d.dropoff.address}</Text></View>
        </Card>

        {d.status === "delivered" && !d.rated ? (
          <Card style={{ gap: 12 }}>
            <Text style={s.rateTitle}>Como foi a entrega?</Text>
            <Stars value={stars} onChange={setStars} testIDPrefix="delivery-rating-star" />
            <Button label="ENVIAR AVALIAÇÃO" testID="delivery-rating-submit" onPress={() => rate.mutate()} loading={rate.isPending} />
          </Card>
        ) : null}

        {["created", "assigned"].includes(d.status) ? (
          <Button label="CANCELAR ENCOMENDA" variant="secondary" icon="close" testID="delivery-cancel-button" onPress={() => cancel.mutate()} loading={cancel.isPending} />
        ) : null}

        <Button label="COMPARTILHAR RASTREAMENTO" variant="secondary" icon="share-social" testID="delivery-share-button" onPress={shareWhatsApp} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  status: { fontSize: 18, fontFamily: fonts.display, color: colors.onSurface, flex: 1 },
  driverName: { fontSize: 16, fontFamily: fonts.semi, color: colors.onSurface },
  sub: { fontSize: 13, fontFamily: fonts.text, color: colors.muted, marginTop: 2 },
  row: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  text: { flex: 1, color: colors.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 13.5, lineHeight: 19 },
  rateTitle: { fontSize: 16, fontFamily: fonts.semi, color: colors.onSurface },
}));
