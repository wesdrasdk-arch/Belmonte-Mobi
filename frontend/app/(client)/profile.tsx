import { useState } from "react";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Linking, Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Card, Field, Header, Input, Screen, useToast } from "@/src/components/ui";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { PublicSettings } from "@/src/types";

export default function ClientProfile() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user, signOut } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");

  const settings = useQuery({ queryKey: ["settings", "public"], queryFn: () => api.get<PublicSettings>("/settings/public") });

  async function save() {
    try {
      await api.put("/me/profile", { name, phone });
      toast.show("Perfil atualizado", "success");
      setEditing(false);
      qc.invalidateQueries();
    } catch {
      toast.show("Não foi possível salvar", "error");
    }
  }

  async function whatsapp() {
    const num = (settings.data?.whatsapp_support ?? "").replace(/\D/g, "");
    if (!num) return toast.show("Suporte temporariamente indisponível", "error");
    Linking.openURL(`https://wa.me/${num}?text=${encodeURIComponent("Olá! Preciso de ajuda com o BELMONTE MOBI.")}`);
  }

  async function logout() {
    await signOut();
    router.replace("/");
  }

  return (
    <Screen scroll style={{ paddingBottom: 40 }}>
      <Header title="Perfil" />
      <View style={{ padding: 16, gap: 12 }}>
        <Card style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}>
          <View style={s.avatar}>
            <Ionicons name="person" size={34} color={colors.onBrandPrimary} />
          </View>
          <Text style={s.name}>{user?.name}</Text>
          <Text style={s.email}>{user?.email}</Text>
        </Card>

        {editing ? (
          <Card style={{ gap: 12 }}>
            <Field label="Nome">
              <Input testID="profile-name-input" value={name} onChangeText={setName} />
            </Field>
            <Field label="Telefone">
              <Input testID="profile-phone-input" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            </Field>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button label="SALVAR" testID="profile-save-button" onPress={save} style={{ flex: 1 }} />
              <Button label="CANCELAR" variant="secondary" testID="profile-cancel-button" onPress={() => setEditing(false)} style={{ flex: 1 }} />
            </View>
          </Card>
        ) : (
          <Card style={{ gap: 10 }}>
            <View style={s.row}>
              <Ionicons name="call" size={18} color={colors.brandSecondary} />
              <Text style={s.rowText}>{user?.phone}</Text>
            </View>
            <View style={s.row}>
              <Ionicons name="mail" size={18} color={colors.brandSecondary} />
              <Text style={s.rowText}>{user?.email}</Text>
            </View>
            <View style={s.row}>
              <Ionicons name="location" size={18} color={colors.brandSecondary} />
              <Text style={s.rowText}>Belmonte · Bahia</Text>
            </View>
            <Button label="EDITAR DADOS" variant="secondary" testID="profile-edit-button" onPress={() => setEditing(true)} />
          </Card>
        )}

        <Card style={{ gap: 10 }}>
          <View style={s.row}>
            <Ionicons name="card" size={18} color={colors.brandSecondary} />
            <Text style={s.rowText}>Pagamento: dinheiro ou Pix</Text>
          </View>
          <View style={s.row}>
            <Ionicons name="qr-code" size={18} color={colors.brandSecondary} />
            <Text style={s.rowText} numberOfLines={1}>Chave Pix da plataforma: {settings.data?.pix_key ?? "—"}</Text>
          </View>
        </Card>

        <Button label="FALAR COM SUPORTE" variant="whatsapp" icon="logo-whatsapp" testID="profile-support-button" onPress={whatsapp} />
        <Button label="SAIR DA CONTA" variant="secondary" icon="log-out" testID="profile-logout-button" onPress={logout} />
        <Text style={s.lgpd}>
          Seus dados pessoais são protegidos conforme a LGPD (Lei 13.709/2018). Para solicitar exclusão de dados,
          fale com o suporte.
        </Text>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 19, fontFamily: fonts.display, color: colors.onSurface },
  email: { fontSize: 13, fontFamily: fonts.text, color: colors.muted },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 32 },
  rowText: { color: colors.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 14, flex: 1 },
  lgpd: { color: colors.muted, fontSize: 11.5, fontFamily: fonts.text, textAlign: "center", lineHeight: 17 },
}));
