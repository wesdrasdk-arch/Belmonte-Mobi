import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image, Pressable, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, ApiError, fileUrl } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Card, Header, Input, Loading, Pill, Screen, Stars, useToast } from "@/src/components/ui";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { DriverInfo } from "@/src/types";

type Profile = {
  user: { id: string; name: string; email: string; phone: string };
  driver: DriverInfo & { cpf?: string };
  cnh_number: string;
  cnh_validity: string;
  cnh_photo_url: string;
  doc_url: string;
};

const STATUS_TONE: Record<string, { label: string; tone: "warning" | "success" | "error" | "muted" }> = {
  pending: { label: "Pendente", tone: "warning" },
  approved: { label: "Aprovado", tone: "success" },
  rejected: { label: "Reprovado", tone: "error" },
  blocked: { label: "Bloqueado", tone: "error" },
};

function imgSource(url: string) {
  if (!url) return null;
  if (url.startsWith("/api/files/")) return fileUrl(url.replace("/api/files/", ""));
  return { uri: url };
}

export default function DriverProfile() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { signOut, reload } = useAuth();
  const profile = useQuery({ queryKey: ["driver", "profile"], queryFn: () => api.get<Profile>("/driver/profile") });
  const [v, setV] = useState({ plate: "", model: "", year: "", color: "", capacity: "4", cnh_photo_url: "", doc_url: "", vehicle_photo_url: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setV({
      plate: p.driver.vehicle?.plate ?? "",
      model: p.driver.vehicle?.model ?? "",
      year: p.driver.vehicle?.year ?? "",
      color: p.driver.vehicle?.color ?? "",
      capacity: String(p.driver.vehicle?.capacity ?? 4),
      cnh_photo_url: p.cnh_photo_url,
      doc_url: p.doc_url,
      vehicle_photo_url: p.driver.vehicle?.photo_url ?? "",
    });
  }, [profile.data]);

  async function pick(field: "cnh_photo_url" | "doc_url" | "vehicle_photo_url") {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let granted = perm.granted;
    if (!granted && perm.canAskAgain) granted = (await ImagePicker.requestMediaLibraryPermissionsAsync()).granted;
    if (!granted) {
      toast.show("Permita o acesso às fotos nos ajustes do aparelho", "error");
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (r.canceled || !r.assets[0]) return;
    setUploading(field);
    try {
      const a = r.assets[0];
      const res = await api.uploadFile({ uri: a.uri, name: a.fileName ?? "documento.jpg", mimeType: a.mimeType ?? "image/jpeg" });
      setV((prev) => ({ ...prev, [field]: res.url }));
      toast.show("Imagem enviada. Toque em SALVAR.", "success");
    } catch {
      toast.show("Falha ao enviar imagem", "error");
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await api.put("/driver/profile", { ...v, capacity: parseInt(v.capacity, 10) || 4 });
      toast.show("Perfil salvo", "success");
      qc.invalidateQueries({ queryKey: ["driver"] });
      reload();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Erro ao salvar", "error");
    } finally {
      setSaving(false);
    }
  }

  if (profile.isLoading || !profile.data) return <Screen><Loading /></Screen>;
  const d = profile.data.driver;
  const st = STATUS_TONE[d.status] ?? STATUS_TONE.pending;

  const DocSlot = ({ field, label }: { field: "cnh_photo_url" | "doc_url" | "vehicle_photo_url"; label: string }) => {
    const src = imgSource(v[field]);
    return (
      <Pressable testID={`driver-upload-${field}`} style={s.docSlot} onPress={() => pick(field)}>
        {src ? <Image source={src} style={s.docImg} /> : <Ionicons name="cloud-upload" size={24} color={colors.brandSecondary} />}
        <Text style={s.docLabel}>{uploading === field ? "Enviando..." : label}</Text>
      </Pressable>
    );
  };

  return (
    <Screen scroll>
      <Header title="Meu perfil" onBack={() => (router.canGoBack() ? router.back() : router.replace("/driver"))} />
      <View style={{ padding: 16, gap: 12, paddingBottom: 48 }}>
        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={s.name}>{d.name}</Text>
            <Pill text={st.label} tone={st.tone} testID="driver-profile-status" />
          </View>
          <Text style={s.sub}>{profile.data.user.email} · {d.phone}</Text>
          <Text style={s.sub}>CPF {d.cpf} · CNH {profile.data.cnh_number} ({d.cnh_category}) · validade {profile.data.cnh_validity}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Stars value={d.rating_avg} size={16} />
            <Text style={s.sub}>{d.rating_avg.toFixed(1)} ({d.rating_count} avaliações)</Text>
          </View>
        </Card>

        {d.status !== "approved" ? (
          <Card style={{ backgroundColor: colors.brandTertiary }}>
            <Text style={{ color: colors.onBrandTertiary, fontFamily: fonts.textSemi, lineHeight: 20 }}>
              {d.status === "rejected"
                ? "Seu cadastro foi reprovado. Atualize os documentos e salve para nova análise."
                : d.status === "blocked"
                  ? "Conta bloqueada. Fale com o suporte."
                  : "Cadastro em análise. Envie todos os documentos para agilizar a aprovação."}
            </Text>
          </Card>
        ) : null}

        <Text style={s.section}>Documentos</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <DocSlot field="cnh_photo_url" label="Foto da CNH" />
          <DocSlot field="doc_url" label="Documento do veículo" />
          <DocSlot field="vehicle_photo_url" label="Foto do veículo" />
        </View>

        <Text style={s.section}>Veículo</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Input label="Placa" testID="driver-vehicle-plate" autoCapitalize="characters" value={v.plate} onChangeText={(t) => setV({ ...v, plate: t })} /></View>
          <View style={{ flex: 1 }}><Input label="Ano" testID="driver-vehicle-year" keyboardType="number-pad" value={v.year} onChangeText={(t) => setV({ ...v, year: t })} /></View>
        </View>
        <Input label="Modelo" testID="driver-vehicle-model" value={v.model} onChangeText={(t) => setV({ ...v, model: t })} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Input label="Cor" testID="driver-vehicle-color" value={v.color} onChangeText={(t) => setV({ ...v, color: t })} /></View>
          <View style={{ flex: 1 }}><Input label="Passageiros" testID="driver-vehicle-capacity" keyboardType="number-pad" value={v.capacity} onChangeText={(t) => setV({ ...v, capacity: t })} /></View>
        </View>

        <Button label="SALVAR" testID="driver-profile-save" loading={saving} onPress={save} />
        <Button label="SAIR DA CONTA" variant="secondary" icon="log-out" testID="driver-logout-button" onPress={async () => { await signOut(); router.replace("/"); }} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  name: { fontSize: 18, fontFamily: fonts.display, color: colors.onSurface, flex: 1 },
  sub: { fontSize: 13, fontFamily: fonts.text, color: colors.muted },
  section: { fontSize: 16, fontFamily: fonts.display, color: colors.onSurface, marginTop: 4 },
  docSlot: { flex: 1, height: 110, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", gap: 6, padding: 6, overflow: "hidden" },
  docImg: { width: "100%", height: 64, borderRadius: 8 },
  docLabel: { fontSize: 11.5, fontFamily: fonts.textSemi, color: colors.onSurfaceTertiary, textAlign: "center" },
}));
