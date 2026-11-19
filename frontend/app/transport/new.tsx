import { useEffect, useMemo, useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, ApiError } from "@/src/api";
import { AddressInput } from "@/src/components/AddressInput";
import { Button, Card, Field, Header, Input, Screen, useToast } from "@/src/components/ui";
import { fmtBRL, VEHICLE_CATEGORIES } from "@/src/utils/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { Estimate, Place, Ride } from "@/src/types";

export default function NewTransport() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ schedule?: string }>();
  const scheduleDefault = params.schedule === "1";

  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [passengers, setPassengers] = useState(1);
  const [category, setCategory] = useState<"economica" | "conforto" | "van">("economica");
  const [when, setWhen] = useState<"agora" | "agendar">(scheduleDefault ? "agendar" : "agora");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(new Date(Date.now() + 3600_000));
  const [notes, setNotes] = useState("");
  const [payment, setPayment] = useState<"dinheiro" | "pix">("dinheiro");
  const [coupon, setCoupon] = useState("");
  const [discountPct, setDiscountPct] = useState(0);

  const canEstimate = !!(origin?.lat && destination?.lat);

  const estimate = useMutation({
    mutationFn: () =>
      api.post<Estimate>("/estimate", {
        service_type: "transporte",
        origin,
        destination,
        vehicle_category: category,
        scheduled_at: when === "agendar" ? scheduledDate.toISOString() : undefined,
      }),
    onError: () => toast.show("Não foi possível calcular a estimativa", "error"),
  });

  useEffect(() => {
    if (canEstimate) {
      const t = setTimeout(() => estimate.mutate(), 300);
      return () => clearTimeout(t);
    }
  }, [canEstimate, category, when, scheduledDate]);

  async function applyCoupon() {
    if (!coupon.trim()) return;
    try {
      const res = await api.post<{ discount_pct: number }>("/coupons/validate", { code: coupon.trim(), service_type: "transporte" });
      setDiscountPct(res.discount_pct);
      toast.show(`Cupom aplicado: ${res.discount_pct}% de desconto!`, "success");
    } catch (e) {
      setDiscountPct(0);
      toast.show(e instanceof ApiError ? e.message : "Cupom inválido", "error");
    }
  }

  const submit = useMutation({
    mutationFn: () =>
      api.post<Ride>("/rides", {
        service_type: "transporte",
        origin,
        destination,
        passengers,
        vehicle_category: category,
        notes,
        payment_method: payment,
        coupon_code: discountPct > 0 ? coupon.trim() : "",
        scheduled_at: when === "agendar" ? scheduledDate.toISOString() : undefined,
      }),
    onSuccess: (ride) => router.replace(`/transport/${ride.id}`),
    onError: (e) => toast.show(e instanceof ApiError ? e.message : "Erro ao solicitar", "error"),
  });

  const est = estimate.data;
  const finalPrice = useMemo(
    () => (est ? Math.round(est.price * (1 - discountPct / 100) * 100) / 100 : 0),
    [est, discountPct],
  );

  return (
    <Screen scroll style={s.wrap}>
      <Header title="Transporte" subtitle="Corrida rápida ou agendada" onBack={() => router.back()} />
      <View style={{ padding: 16, paddingBottom: 220 }}>
        <AddressInput label="Origem" value={origin} onSelect={setOrigin} testID="transport-origin-input" icon="radio-button-on" />
        <AddressInput label="Destino" value={destination} onSelect={setDestination} testID="transport-destination-input" icon="flag" />

        <Field label="Quantidade de passageiros">
          <View style={s.stepperRow}>
            <Pressable testID="transport-passengers-minus" style={s.stepperBtn} onPress={() => setPassengers(Math.max(1, passengers - 1))}>
              <Ionicons name="remove" size={20} color={colors.onSurface} />
            </Pressable>
            <Text testID="transport-passengers-value" style={s.stepperValue}>{passengers}</Text>
            <Pressable testID="transport-passengers-plus" style={s.stepperBtn} onPress={() => setPassengers(Math.min(6, passengers + 1))}>
              <Ionicons name="add" size={20} color={colors.onSurface} />
            </Pressable>
          </View>
        </Field>

        <Field label="Categoria do veículo">
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(Object.keys(VEHICLE_CATEGORIES) as Array<keyof typeof VEHICLE_CATEGORIES>).map((c) => (
              <Pressable
                key={c}
                testID={`transport-category-${c}`}
                onPress={() => setCategory(c)}
                style={[s.categoryBtn, category === c && s.categoryBtnActive]}
              >
                <Text style={[s.categoryText, category === c && s.categoryTextActive]}>{VEHICLE_CATEGORIES[c]}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="Quando">
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable testID="transport-when-agora" style={[s.categoryBtn, when === "agora" && s.categoryBtnActive, { flex: 1, minHeight: 44, justifyContent: "center" }]} onPress={() => setWhen("agora")}>
              <Text style={[s.categoryText, when === "agora" && s.categoryTextActive]}>AGORA</Text>
            </Pressable>
            <Pressable testID="transport-when-agendar" style={[s.categoryBtn, when === "agendar" && s.categoryBtnActive, { flex: 1, minHeight: 44, justifyContent: "center" }]} onPress={() => setWhen("agendar")}>
              <Text style={[s.categoryText, when === "agendar" && s.categoryTextActive]}>AGENDAR</Text>
            </Pressable>
          </View>
        </Field>

        {when === "agendar" ? (
          <Field label="Data e hora do serviço">
            <Pressable testID="transport-date-button" style={s.dateBtn} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar" size={18} color={colors.brandSecondary} />
              <Text style={s.dateText}>
                {scheduledDate.toLocaleDateString("pt-BR")} às {scheduledDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </Pressable>
            {showDatePicker ? (
              <DateTimePicker
                testID="transport-date-picker"
                value={scheduledDate}
                mode="datetime"
                locale="pt-BR"
                is24Hour
                minimumDate={new Date()}
                onChange={(_, d) => {
                  setShowDatePicker(false);
                  if (d) setScheduledDate(d);
                }}
              />
            ) : null}
          </Field>
        ) : null}

        <Field label="Forma de pagamento">
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["dinheiro", "pix"] as const).map((p) => (
              <Pressable key={p} testID={`transport-payment-${p}`} style={[s.categoryBtn, payment === p && s.categoryBtnActive, { flex: 1, minHeight: 44, justifyContent: "center" }]} onPress={() => setPayment(p)}>
                <Text style={[s.categoryText, payment === p && s.categoryTextActive]}>{p === "dinheiro" ? "Dinheiro" : "Pix"}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="Cupom de desconto (opcional)">
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input testID="transport-coupon-input" placeholder="Ex.: BEMVINDO10" value={coupon} onChangeText={setCoupon} autoCapitalize="characters" />
            </View>
            <Button label="Aplicar" variant="secondary" small testID="transport-coupon-apply" onPress={applyCoupon} />
          </View>
        </Field>

        <Field label="Observações (opcional)">
          <Input testID="transport-notes-input" placeholder="Ex.: ponto de referência, portão azul..." value={notes} onChangeText={setNotes} multiline style={{ height: 70, textAlignVertical: "top", paddingTop: 12 }} />
        </Field>
      </View>

      {/* Rodapé fixo com estimativa */}
      <View style={s.footer}>
        <Card style={{ marginBottom: 10, padding: 14 }}>
          {canEstimate && estimate.isPending ? (
            <Text style={s.estimating}>Calculando estimativa...</Text>
          ) : est && canEstimate ? (
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View>
                  <Text style={s.estLabel}>Valor estimado</Text>
                  <Text testID="transport-estimate-price" style={s.estPrice}>{fmtBRL(finalPrice)}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Text testID="transport-estimate-distance" style={s.estMeta}>{est.distance_km} km · ~{Math.ceil(est.duration_min)} min</Text>
                  <Text style={s.estMeta}>{VEHICLE_CATEGORIES[est.vehicle_category]}{est.night ? " · tarifa noturna" : ""}</Text>
                </View>
              </View>
            </View>
          ) : (
            <Text style={s.estimating}>Informe origem e destino para ver a estimativa</Text>
          )}
        </Card>
        <Button
          label="SOLICITAR TRANSPORTE"
          icon="car"
          testID="transport-submit-button"
          onPress={() => submit.mutate()}
          loading={submit.isPending}
          disabled={!canEstimate || estimate.isPending}
        />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flex: 1 },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  stepperBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  stepperValue: { fontSize: 20, fontFamily: fonts.display, color: colors.onSurface, minWidth: 28, textAlign: "center" },
  categoryBtn: { flex: 1, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8, alignItems: "center", minHeight: 44, justifyContent: "center" },
  categoryBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  categoryText: { fontFamily: fonts.semi, fontSize: 13.5, color: colors.onSurfaceTertiary, textAlign: "center" },
  categoryTextActive: { color: colors.onBrandPrimary },
  dateBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, minHeight: 48 },
  dateText: { color: colors.onSurface, fontFamily: fonts.textSemi, fontSize: 15 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  estimating: { color: colors.muted, fontFamily: fonts.text, textAlign: "center", paddingVertical: 8 },
  estLabel: { color: colors.muted, fontFamily: fonts.text, fontSize: 12.5 },
  estPrice: { fontSize: 24, fontFamily: fonts.brand, color: colors.brandSecondary },
  estMeta: { color: colors.onSurfaceTertiary, fontFamily: fonts.textSemi, fontSize: 12.5 },
}));
