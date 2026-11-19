import { useState } from "react";
import { Link, useRouter } from "expo-router";
import { Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useAuth } from "@/src/auth";
import { Button, Field, Header, Input, Screen, useToast } from "@/src/components/ui";
import { ApiError } from "@/src/api";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function RegisterClient() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (name.trim().length < 3 || !phone.trim() || !email.trim() || password.length < 8) {
      toast.show("Preencha todos os campos. Senha com no mínimo 8 caracteres.", "error");
      return;
    }
    setLoading(true);
    try {
      await signUp({ name: name.trim(), phone: phone.trim(), email: email.trim(), password });
      router.replace("/(client)");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Erro ao criar conta", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll style={s.wrap}>
      <Header title="Criar conta" onBack={() => router.back()} subtitle="É rápido e gratuito" />
      <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 }}>
        <View style={s.heroRow}>
          <Ionicons name="person-add" size={22} color={colors.brandPrimary} />
          <Text style={s.heroText}>Bem-vindo à mobilidade de Belmonte!</Text>
        </View>

        <Field label="Nome completo">
          <Input testID="register-name-input" placeholder="Seu nome" value={name} onChangeText={setName} autoCapitalize="words" />
        </Field>
        <Field label="Telefone (WhatsApp)">
          <Input testID="register-phone-input" placeholder="(73) 99999-0000" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
        </Field>
        <Field label="E-mail">
          <Input testID="register-email-input" placeholder="seu@email.com" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        </Field>
        <Field label="Senha (mínimo 8 caracteres)">
          <Input testID="register-password-input" placeholder="Crie uma senha" secureTextEntry value={password} onChangeText={setPassword} />
        </Field>

        <Button label="CRIAR MINHA CONTA" testID="register-submit-button" onPress={submit} loading={loading} />

        <View style={s.loginRow}>
          <Text style={s.loginText}>Já tem conta?</Text>
          <Link href="/auth/login" asChild>
            <Text testID="register-login-link" style={s.loginLink}>
              Entrar
            </Text>
          </Link>
        </View>

        <Text style={s.lgpd}>
          Ao criar sua conta você concorda com o uso dos seus dados conforme a LGPD: usamos apenas nome, contato e
          endereços para realizar seus serviços.
        </Text>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flex: 1 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 },
  heroText: { color: colors.onSurfaceSecondary, fontFamily: fonts.semi, fontSize: 14 },
  loginRow: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  loginText: { color: colors.onSurfaceTertiary, fontFamily: fonts.text, fontSize: 14 },
  loginLink: { color: colors.brandSecondary, fontFamily: fonts.semi, fontSize: 14 },
  lgpd: { color: colors.muted, fontSize: 12, fontFamily: fonts.text, textAlign: "center", marginTop: 12, lineHeight: 18 },
}));
