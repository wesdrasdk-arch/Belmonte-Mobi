import { useEffect, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { Image, Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, ApiError, fileUrl } from "@/src/api";
import { AddressInput } from "@/src/components/AddressInput";
import { Button, Field, Header, Input, Screen, useToast } from "@/src/components/ui";
import { fmtBRL } from "@/src/utils/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { Delivery, Estimate, Place } from "@/src/types";

const SIZES = { P: "Pequena", M: "Média", G: "Grande" } as const;

export default function NewDelivery() {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const s = useStyles();

  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [description, setDescription] = useState("");
  const [size, setSize] = useState<"P" | "M" | "G">("P");
  const [weight, setWeight] = useState("");
  const [declaredValue, setDeclaredValue] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [payment, setPayment] = useState<"dinheiro" | "pix">("dinheiro");

  const canEstimate = !!(pickup?.lat && dropoff?.lat);

  const estimate = useMutation({
    mutationFn: () => api.post<Estimate>("/estimate", { service_type: "encomenda", origin: pickup, destination: dropoff, size }),
    onError: () => toast.show("Não foi possível calcular a estimativa", "error"),
  });

  useEffect(() => {
    if (canEstimate) {
      const t = setTimeout(() => estimate.mutate(), 300);
      return () => clearTimeout(t);
    }
  }, [canEstimate, size]);

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show("Permita o acesso às fotos para anexar", "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsEditing: true });
    if (!result.canceled && result.assets[0]) {
      try {
        const res = await api.uploadFile({ uri: result.assets[0].uri, name: result.assets[0].fileName ?? "encomenda.jpg", mimeType: "image/jpeg" });
        setPhotoUrl(res.url);
        toast.show("Foto anexada", "success");
      } catch {
        toast.show("Falha ao enviar a foto", "error");
      }
    }
  }

  const submit = useMutation({
    mutationFn: () =>
      api.post<Delivery>("/deliveries", {
        pickup,
        dropoff,
        recipient_name: recipientName.trim(),
        recipient_phone: recipientPhone.trim(),
        description: description.trim(),
        size,
        weight_kg: parseFloat(weight) || 0,
        declared_value: parseFloat(declaredValue) || 0,
        photo_url: photoUrl,
        notes,
        payment_method: payment,
      }),
    onSuccess: (d) => router.replace(`/deliveries/${d.id}`),
    onError: (e) => toast.show(e instanceof ApiError ? e.message : "Erro ao solicitar", "error"),
  });

  const valid = canEstimate && recipientName.trim().length >= 3 && recipientPhone.trim().length >= 8 && description.trim().length >= 3;
  const est = estimate.data;

  return (
    <Screen scroll style={s.wrap}>
      <Header title="Encomendas" subtitle="Envie com rastreamento e confirmação" onBack={() => router.back()} />
      <View style={{ padding: 16, paddingBottom: 200 }}>
        <AddressInput label="Endereço de coleta" value={pickup} onSelect={setPickup} testID="delivery-pickup-input" icon="cube" />
        <AddressInput label="Endereço de entrega" value={dropoff} onSelect={setDropoff} testID="delivery-dropoff-input" icon="flag" />

        <Field label="Nome do destinatário">
          <Input testID="delivery-recipient-name-input" placeholder="Quem vai receber" value={recipientName} onChangeText={setRecipientName} />
        </Field>
        <Field label="Telefone do destinatário">
          <Input testID="delivery-recipient-phone-input" placeholder="(73) 99999-0000" keyboardType="phone-pad" value={recipientPhone} onChangeText={setRecipientPhone} />
        </Field>
        <Field label="Descrição da encomenda">
          <Input testID="delivery-description-input" placeholder="Ex.: caixa de doces, documentos..." value={description} onChangeText={setDescription} />
        </Field>

        <Field label="Tamanho">
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(Object.keys(SIZES) as Array<keyof typeof SIZES>).map((k) => (
              <Pressable key={k} testID={`delivery-size-${k}`} style={[s.categoryBtn, size === k && s.categoryBtnActive]} onPress={() => setSize(k)}>
                <Text style={[s.categoryText, size === k && s.categoryTextActive]}>{SIZES[k]}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Field label="Peso aproximado (kg)">
              <Input testID="delivery-weight-input" placeholder="0" keyboardType="decimal-pad" value={weight} onChangeText={setWeight} />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Valor declarado (R$)">
              <Input testID="delivery-value-input" placeholder="0" keyboardType="decimal-pad" value={declaredValue} onChangeText={setDeclaredValue} />
            </Field>
          </View>
        </View>

        <Field label="Foto da encomenda (opcional)">
          <Pressable testID="delivery-photo-button" style={s.photoBtn} onPress={pickPhoto}>
            {photoUrl ? (
              <Image source={fileUrl(photoUrl.replace("/api/files/", "").split("?")[0])} style={s.photoPreview} />
            ) : (
              <>
                <Ionicons name="camera" size={22} color={colors.brandSecondary} />
                <Text style={s.photoBtnText}>Anexar foto</Text>
              </>
            )}
          </Pressable>
        </Field>

        <Field label="Forma de pagamento">
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["dinheiro", "pix"] as const).map((p) => (
              <Pressable key={p} testID={`delivery-payment-${p}`} style={[s.categoryBtn, payment === p && s.categoryBtnActive, { flex: 1, minHeight: 44, justifyContent: "center" }]} onPress={() => setPayment(p)}>
                <Text style={[s.categoryText, payment === p && s.categoryTextActive]}>{p === "dinheiro" ? "Dinheiro" : "Pix"}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="Observações (opcional)">
          <Input testID="delivery-notes-input" placeholder="Instruções para o motorista" value={notes} onChangeText={setNotes} multiline style={{ height: 70, textAlignVertical: "top", paddingTop: 12 }} />
        </Field>
      </View>

      <View style={s.footer}>
        <Text testID="delivery-estimate-price" style={s.price}>
          {est && canEstimate ? `${fmtBRL(est.price)} · ${est.distance_km} km` : "Informe coleta e entrega"}
        </Text>
        <Button label="SOLICITAR ENCOMENDA" icon="cube" testID="delivery-submit-button" disabled={!valid} loading={submit.isPending} onPress={() => submit.mutate()} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flex: 1 },
  categoryBtn: { flex: 1, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, alignItems: "center", minHeight: 44, justifyContent: "center" },
  categoryBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  categoryText: { fontFamily: fonts.semi, fontSize: 13.5, color: colors.onSurfaceTertiary },
  categoryTextActive: { color: colors.onBrandPrimary },
  photoBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.brandTertiary, borderRadius: 12, minHeight: 56 },
  photoBtnText: { color: colors.onBrandTertiary, fontFamily: fonts.semi, fontSize: 14 },
  photoPreview: { width: 200, height: 48, borderRadius: 10 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 },
  price: { textAlign: "center", color: colors.brandSecondary, fontFamily: fonts.display, fontSize: 18 },
}));
