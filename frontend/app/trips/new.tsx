import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, ApiError } from "@/src/api";
import { AddressInput } from "@/src/components/AddressInput";
import { Button, Card, Field, Header, Input, Screen, useToast } from "@/src/components/ui";
import { fmtBRL } from "@/src/utils/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { Estimate, Place, Ride } from "@/src/types";

const QUICK_ROUTES: { label: string; dest: string }[] = [
  { label: "Belmonte → Porto Seguro", dest: "Porto Seguro, Bahia" },
  { label: "Belmonte → Eunápolis", dest: "Eunápolis, Bahia" },
  { label: "Belmonte → Canavieiras", dest: "Canavieiras, Bahia" },
  { label: "Belmonte → Santa Cruz Cabrália", dest: "Santa Cruz Cabrália, Bahia" },
];

export default function NewTrip() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ mode?: string; schedule?: string }>();
  const isDisponivel = params.mode === "disponivel";

  const [mode, setMode] = useState<"programada" | "disponivel">(isDisponivel ? "disponivel" : "programada");
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [passengers, setPassengers] = useState(1);
  const [luggage, setLuggage] = useState(1);
  const [roundTrip, setRoundTrip] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [date, setDate] = useState(new Date(Date.now() + 86400_000));
  const [hours, setHours] = useState("4");
  const [notes, setNotes] = useState("");
  const [payment, setPayment] = useState<"dinheiro" | "pix">("dinheiro");

  const canEstimate = mode === "disponivel" ? !!origin?.lat || true : !!(origin?.lat && destination?.lat);

  const estimate = useMutation({
    mutationFn: () =>
      api.post<Estimate>("/estimate", {
        service_type: mode === "disponivel" ? "motorista_particular" : "viagem",
        origin,
        destination,
        hours: mode === "disponivel" ? parseFloat(hours) || 1 : undefined,
      }),
    onError: () => toast.show("Não foi possível calcular a estimativa", "error"),
  });

  useEffect(() => {
    if (mode === "programada" ? !!(origin?.lat && destination?.lat) : mode === "disponivel" && parseFloat(hours) > 0) {
      const t = setTimeout(() => estimate.mutate(), 300);
      return () => clearTimeout(t);
    }
  }, [origin?.lat, destination?.lat, mode, hours]);

  async function pickDestination(addr: string) {
    try {
      const res = await api.get<Array<{ label: string; lat: number; lng: number }>>(`/geocode?q=${encodeURIComponent(addr)}`);
      if (res[0]) setDestination({ address: res[0].label, lat: res[0].lat, lng: res[0].lng });
      else toast.show("Destino não encontrado", "error");
    } catch {
      toast.show("Erro ao buscar destino", "error");
    }
  }

  const submit = useMutation({
    mutationFn: () =>
      api.post<Ride>("/rides", {
        service_type: mode === "disponivel" ? "motorista_particular" : "viagem",
        origin,
        destination: mode === "disponivel" ? null : destination,
        passengers,
        luggage,
        round_trip: roundTrip,
        hours: mode === "disponivel" ? parseFloat(hours) || 1 : undefined,
        notes,
        payment_method: payment,
        scheduled_at: mode === "programada" ? date.toISOString() : undefined,
      }),
    onSuccess: (ride) => router.replace(`/transport/${ride.id}`),
    onError: (e) => toast.show(e instanceof ApiError ? e.message : "Erro ao solicitar", "error"),
  });

  const est = estimate.data;
  const valid = mode === "disponivel" ? !!origin && parseFloat(hours) > 0 : !!(origin?.lat && destination?.lat);

  return (
    <Screen scroll style={s.wrap}>
      <Header title={mode === "disponivel" ? "Motorista à disposição" : "Viagem particular"} subtitle="Viagens confortáveis na região" onBack={() => router.back()} />
      <View style={{ padding: 16, paddingBottom: 210 }}>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          <Pressable testID="trip-mode-programada" style={[s.modeBtn, mode === "programada" && s.modeBtnActive]} onPress={() => setMode("programada")}>
            <Text style={[s.modeText, mode === "programada" && s.modeTextActive]}>VIAGEM PROGRAMADA</Text>
          </Pressable>
          <Pressable testID="trip-mode-disponivel" style={[s.modeBtn, mode === "disponivel" && s.modeBtnActive]} onPress={() => setMode("disponivel")}>
            <Text style={[s.modeText, mode === "disponivel" && s.modeTextActive]}>À DISPOSIÇÃO</Text>
          </Pressable>
        </View>

        <AddressInput label="Origem" value={origin} onSelect={setOrigin} testID="trip-origin-input" icon="radio-button-on" />

        {mode === "programada" ? (
          <>
            <AddressInput label="Destino" value={destination} onSelect={setDestination} testID="trip-destination-input" icon="flag" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {QUICK_ROUTES.map((q) => (
                <Pressable key={q.label} testID={`trip-quick-${q.dest.split(",")[0].toLowerCase().replace(/\s/g, "-")}`} style={s.quickChip} onPress={() => pickDestination(q.dest)}>
                  <Ionicons name="navigate" size={13} color={colors.onBrandTertiary} />
                  <Text style={s.quickText}>{q.label}</Text>
                </Pressable>
              ))}
            </View>

            <Field label="Data e hora da viagem">
              <Pressable testID="trip-date-button" style={s.dateBtn} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar" size={18} color={colors.brandSecondary} />
                <Text style={s.dateText}>
                  {date.toLocaleDateString("pt-BR")} às {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </Pressable>
              {showDatePicker ? (
                <DateTimePicker
                  testID="trip-date-picker"
                  value={date}
                  mode="datetime"
                  is24Hour
                  minimumDate={new Date()}
                  onChange={(_, d) => {
                    setShowDatePicker(false);
                    if (d) setDate(d);
                  }}
                />
              ) : null}
            </Field>

            <Field label="Ida ou ida e volta">
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable testID="trip-round-ida" style={[s.categoryBtn, !roundTrip && s.categoryBtnActive]} onPress={() => setRoundTrip(false)}>
                  <Text style={[s.categoryText, !roundTrip && s.categoryTextActive]}>Só ida</Text>
                </Pressable>
                <Pressable testID="trip-round-ida-volta" style={[s.categoryBtn, roundTrip && s.categoryBtnActive]} onPress={() => setRoundTrip(true)}>
                  <Text style={[s.categoryText, roundTrip && s.categoryTextActive]}>Ida e volta</Text>
                </Pressable>
              </View>
            </Field>

            <Field label={`Bagagens: ${luggage}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                <Pressable testID="trip-luggage-minus" style={s.stepperBtn} onPress={() => setLuggage(Math.max(0, luggage - 1))}>
                  <Ionicons name="remove" size={20} color={colors.onSurface} />
                </Pressable>
                <Text testID="trip-luggage-value" style={s.stepperValue}>{luggage}</Text>
                <Pressable testID="trip-luggage-plus" style={s.stepperBtn} onPress={() => setLuggage(Math.min(10, luggage + 1))}>
                  <Ionicons name="add" size={20} color={colors.onSurface} />
                </Pressable>
              </View>
            </Field>
          </>
        ) : (
          <Field label="Quantas horas de serviço?">
            <Input testID="trip-hours-input" placeholder="Ex.: 4" keyboardType="number-pad" value={hours} onChangeText={setHours} />
          </Field>
        )}

        <Field label={`Passageiros: ${passengers}`}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <Pressable testID="trip-passengers-minus" style={s.stepperBtn} onPress={() => setPassengers(Math.max(1, passengers - 1))}>
              <Ionicons name="remove" size={20} color={colors.onSurface} />
            </Pressable>
            <Text testID="trip-passengers-value" style={s.stepperValue}>{passengers}</Text>
            <Pressable testID="trip-passengers-plus" style={s.stepperBtn} onPress={() => setPassengers(Math.min(10, passengers + 1))}>
              <Ionicons name="add" size={20} color={colors.onSurface} />
            </Pressable>
          </View>
        </Field>

        <Field label="Forma de pagamento">
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["dinheiro", "pix"] as const).map((p) => (
              <Pressable key={p} testID={`trip-payment-${p}`} style={[s.categoryBtn, payment === p && s.categoryBtnActive, { flex: 1, minHeight: 44, justifyContent: "center" }]} onPress={() => setPayment(p)}>
                <Text style={[s.categoryText, payment === p && s.categoryTextActive]}>{p === "dinheiro" ? "Dinheiro" : "Pix"}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="Observações (opcional)">
          <Input testID="trip-notes-input" placeholder="Ex.: levar água, parada no caminho..." value={notes} onChangeText={setNotes} multiline style={{ height: 70, textAlignVertical: "top", paddingTop: 12 }} />
        </Field>
      </View>

      <View style={s.footer}>
        <Text testID="trip-estimate-price" style={s.price}>
          {est ? `${fmtBRL(est.price)}${est.distance_km ? ` · ${est.distance_km} km` : ""}` : "Preencha os dados"}
        </Text>
        <Button label="SOLICITAR VIAGEM" icon="bus" testID="trip-submit-button" disabled={!valid} loading={submit.isPending} onPress={() => submit.mutate()} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flex: 1 },
  modeBtn: { flex: 1, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  modeBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  modeText: { fontFamily: fonts.semi, fontSize: 12.5, color: colors.onSurfaceTertiary },
  modeTextActive: { color: colors.onBrandPrimary },
  quickChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandTertiary, borderRadius: 999, paddingHorizontal: 12, height: 36, flexShrink: 0 },
  quickText: { color: colors.onBrandTertiary, fontFamily: fonts.semi, fontSize: 12.5 },
  categoryBtn: { flex: 1, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, alignItems: "center", minHeight: 44, justifyContent: "center" },
  categoryBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  categoryText: { fontFamily: fonts.semi, fontSize: 13.5, color: colors.onSurfaceTertiary },
  categoryTextActive: { color: colors.onBrandPrimary },
  dateBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, minHeight: 48 },
  dateText: { color: colors.onSurface, fontFamily: fonts.textSemi, fontSize: 15 },
  stepperBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  stepperValue: { fontSize: 20, fontFamily: fonts.display, color: colors.onSurface, minWidth: 28, textAlign: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 },
  price: { textAlign: "center", color: colors.brandSecondary, fontFamily: fonts.display, fontSize: 18 },
}));
