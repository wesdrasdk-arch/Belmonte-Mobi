import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, ApiError } from "@/src/api";
import { Button, Card, Field, Header, Input, Loading, Screen, useToast } from "@/src/components/ui";
import { fmtBRL, fmtDateOnly } from "@/src/utils/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { Booking, TourPackage } from "@/src/types";

export default function PackageDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const s = useStyles();

  const pkg = useQuery({
    queryKey: ["tourism", "package", id],
    queryFn: () => api.get<TourPackage>(`/tourism/packages/${id}`),
    enabled: !!id,
  });

  const [time, setTime] = useState<string | null>(null);
  const [people, setPeople] = useState(2);
  const [notes, setNotes] = useState("");
  const [payment, setPayment] = useState<"dinheiro" | "pix">("dinheiro");
  const [confirmed, setConfirmed] = useState<Booking | null>(null);
  const nextDays = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(Date.now() + 86400_000 * (i + 1));
    return d.toISOString().slice(0, 10);
  });
  const [dateISO, setDateISO] = useState(nextDays[0]);

  const book = useMutation({
    mutationFn: () =>
      api.post<Booking>("/tourism/bookings", {
        package_id: id,
        date: dateISO,
        time: time!,
        people,
        notes,
        payment_method: payment,
      }),
    onSuccess: (b) => {
      setConfirmed(b);
      qc.invalidateQueries({ queryKey: ["bookings"] });
      toast.show("Reserva confirmada!", "success");
    },
    onError: (e) => toast.show(e instanceof ApiError ? e.message : "Erro ao reservar", "error"),
  });

  if (pkg.isLoading) return <Screen><Loading label="Carregando passeio..." /></Screen>;
  if (pkg.error || !pkg.data)
    return (
      <Screen>
        <Header title="Passeio" onBack={() => router.back()} />
        <View style={{ padding: 24 }}>
          <Text style={{ color: colors.error, fontFamily: fonts.textSemi }}>Passeio não encontrado.</Text>
        </View>
      </Screen>
    );

  const p = pkg.data;
  const total = Math.round(p.price_per_person * people * 100) / 100;

  return (
    <Screen scroll style={{ paddingBottom: 40 }}>
      <View style={s.heroWrap}>
        <Image source={{ uri: p.photo_url }} style={s.hero} resizeMode="cover" />
        <View style={s.backBtn}>
          <Pressable testID="tourism-detail-back" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
          </Pressable>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {confirmed ? (
          <Card style={{ alignItems: "center", gap: 8, backgroundColor: "#D1FAE5" }} testID="tourism-booking-confirmed">
            <Ionicons name="checkmark-circle" size={40} color="#047857" />
            <Text style={{ color: "#047857", fontFamily: fonts.display, fontSize: 18 }}>Reserva confirmada!</Text>
            <Text style={{ color: "#047857", fontFamily: fonts.text, textAlign: "center" }}>
              {confirmed.code} · {fmtDateOnly(confirmed.date)} às {confirmed.time} · {confirmed.people} pessoa(s)
            </Text>
            <Text style={{ color: "#047857", fontFamily: fonts.textSemi }}>
              Total: {fmtBRL(confirmed.total)} ({confirmed.payment_method === "pix" ? "Pix" : "Dinheiro"})
            </Text>
            <Button label="VER HISTÓRICO" variant="secondary" small testID="tourism-booking-history-button" onPress={() => router.push("/(client)/history")} />
          </Card>
        ) : (
          <>
            <View>
              <Text style={s.title}>{p.title}</Text>
              <Text style={s.category}>{p.guide_name || "Passeio com motorista local"}</Text>
            </View>

            <Card style={{ gap: 10 }}>
              <View style={s.metaRow}>
                <Ionicons name="time" size={16} color={colors.brandSecondary} />
                <Text style={s.metaText}>Duração: {p.duration_hours} horas</Text>
              </View>
              <View style={s.metaRow}>
                <Ionicons name="people" size={16} color={colors.brandSecondary} />
                <Text style={s.metaText}>Máximo {p.max_people} pessoas</Text>
              </View>
              <View style={s.metaRow}>
                <Ionicons name="location" size={16} color={colors.brandSecondary} />
                <Text style={s.metaText}>Saída: {p.departure_point || "a combinar"}</Text>
              </View>
              {p.times.length > 0 ? (
                <View style={s.metaRow}>
                  <Ionicons name="sunny" size={16} color={colors.brandSecondary} />
                  <Text style={s.metaText}>Horários: {p.times.join(", ")}</Text>
                </View>
              ) : null}
            </Card>

            <Text style={s.desc}>{p.description}</Text>

            <Card style={{ gap: 12 }}>
              <Text style={s.formTitle}>Reservar</Text>
              <Field label="Data">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {nextDays.map((d) => (
                    <Pressable key={d} testID={`tourism-date-${d}`} style={[s.timeChip, { flexShrink: 0 }, dateISO === d && s.timeChipActive]} onPress={() => setDateISO(d)}>
                      <Text style={[s.timeText, dateISO === d && s.timeTextActive]}>{d.slice(8, 10)}/{d.slice(5, 7)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </Field>
              {p.times.length > 0 ? (
                <Field label="Horário">
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    {p.times.map((t) => (
                      <Pressable key={t} testID={`tourism-time-${t.replace(":", "-")}`} style={[s.timeChip, time === t && s.timeChipActive]} onPress={() => setTime(t)}>
                        <Text style={[s.timeText, time === t && s.timeTextActive]}>{t}</Text>
                      </Pressable>
                    ))}
                  </View>
                </Field>
              ) : null}
              <Field label={`Quantidade de pessoas: ${people}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                  <Pressable testID="tourism-people-minus" style={s.stepperBtn} onPress={() => setPeople(Math.max(1, people - 1))}>
                    <Ionicons name="remove" size={20} color={colors.onSurface} />
                  </Pressable>
                  <Text testID="tourism-people-value" style={s.stepperValue}>{people}</Text>
                  <Pressable testID="tourism-people-plus" style={s.stepperBtn} onPress={() => setPeople(Math.min(p.max_people, people + 1))}>
                    <Ionicons name="add" size={20} color={colors.onSurface} />
                  </Pressable>
                </View>
              </Field>
              <Field label="Forma de pagamento">
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["dinheiro", "pix"] as const).map((pm) => (
                    <Pressable key={pm} testID={`tourism-payment-${pm}`} style={[s.timeChip, payment === pm && s.timeChipActive, { flex: 1, height: 44, justifyContent: "center" }]} onPress={() => setPayment(pm)}>
                      <Text style={[s.timeText, payment === pm && s.timeTextActive]}>{pm === "dinheiro" ? "Dinheiro" : "Pix"}</Text>
                    </Pressable>
                  ))}
                </View>
              </Field>
              <Field label="Observações (opcional)">
                <Input testID="tourism-notes-input" placeholder="Ex.: levar crianças, restrição alimentar..." value={notes} onChangeText={setNotes} />
              </Field>
              <Text testID="tourism-total-price" style={s.total}>Total: {fmtBRL(total)}</Text>
              <Button label="CONFIRMAR RESERVA" icon="sunny" testID="tourism-book-button" disabled={!time} loading={book.isPending} onPress={() => book.mutate()} />
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  heroWrap: { position: "relative" },
  hero: { width: "100%", height: 220 },
  backBtn: { position: "absolute", top: 12, left: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontFamily: fonts.brand, color: colors.onSurface },
  category: { fontSize: 13, fontFamily: fonts.semi, color: colors.brandSecondary, marginTop: 4 },
  desc: { color: colors.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 14, lineHeight: 21 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  metaText: { color: colors.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 14 },
  formTitle: { fontSize: 18, fontFamily: fonts.display, color: colors.onSurface },
  timeChip: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 16, height: 40, alignItems: "center", justifyContent: "center" },
  timeChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  timeText: { fontFamily: fonts.semi, fontSize: 13.5, color: colors.onSurfaceTertiary },
  timeTextActive: { color: colors.onBrandPrimary },
  stepperBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  stepperValue: { fontSize: 20, fontFamily: fonts.display, color: colors.onSurface, minWidth: 28, textAlign: "center" },
  total: { fontSize: 20, fontFamily: fonts.brand, color: colors.brandSecondary, textAlign: "right" },
}));
