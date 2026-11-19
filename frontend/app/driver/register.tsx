import { useState } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { api, ApiError, saveTokens } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Field, Header, Input, Screen, useToast } from "@/src/components/ui";
import { fonts, makeStyles } from "@/src/theme";

export default function DriverRegister() {
  const s = useStyles();
  const router = useRouter();
  const toast = useToast();
  const { reload } = useAuth();
  const [f, setF] = useState({
    name: "", email: "", phone: "", password: "", cpf: "", cnh_number: "", cnh_category: "B", cnh_validity: "",
  });
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  async function submit() {
    if (Object.values(f).some((v) => !v.trim())) {
      toast.show("Preencha todos os campos", "error");
      return;
    }
    if (f.password.length < 8) {
      toast.show("Senha com no mínimo 8 caracteres", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ access_token: string; refresh_token: string }>("/auth/driver-register", f);
      await saveTokens(res);
      await reload();
      router.replace("/driver/profile");
      toast.show("Cadastro criado! Complete veículo e documentos.", "success");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Erro no cadastro", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll>
      <Header title="Cadastro de motorista" subtitle="Seu cadastro será analisado pelo administrador" onBack={() => router.back()} />
      <View style={{ padding: 16, paddingBottom: 48 }}>
        <Text style={s.section}>Dados pessoais</Text>
        <Input label="Nome completo" testID="driver-reg-name" value={f.name} onChangeText={set("name")} />
        <Input label="CPF" testID="driver-reg-cpf" keyboardType="number-pad" value={f.cpf} onChangeText={set("cpf")} />
        <Input label="Telefone (WhatsApp)" testID="driver-reg-phone" keyboardType="phone-pad" value={f.phone} onChangeText={set("phone")} />
        <Input label="E-mail" testID="driver-reg-email" autoCapitalize="none" keyboardType="email-address" value={f.email} onChangeText={set("email")} />
        <Input label="Senha" testID="driver-reg-password" secureTextEntry value={f.password} onChangeText={set("password")} />
        <Text style={s.section}>CNH</Text>
        <Input label="Número da CNH" testID="driver-reg-cnh" keyboardType="number-pad" value={f.cnh_number} onChangeText={set("cnh_number")} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Input label="Categoria" testID="driver-reg-cnh-category" autoCapitalize="characters" value={f.cnh_category} onChangeText={set("cnh_category")} />
          </View>
          <View style={{ flex: 2 }}>
            <Input label="Validade (AAAA-MM-DD)" testID="driver-reg-cnh-validity" placeholder="2028-12-31" value={f.cnh_validity} onChangeText={set("cnh_validity")} />
          </View>
        </View>
        <Button label="CRIAR CADASTRO" testID="driver-reg-submit" loading={loading} onPress={submit} />
        <Text style={s.note}>Após criar o cadastro, envie fotos da CNH, documento e veículo no seu perfil.</Text>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { fontSize: 16, fontFamily: fonts.display, color: colors.onSurface, marginBottom: 10, marginTop: 6 },
  note: { color: colors.muted, fontFamily: fonts.text, fontSize: 12.5, textAlign: "center", marginTop: 12 },
}));
