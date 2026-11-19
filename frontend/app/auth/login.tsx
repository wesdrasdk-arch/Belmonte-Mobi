import { useState } from "react";
import { Link, Redirect, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useAuth } from "@/src/auth";
import { Button, Field, Header, Input, Screen, useToast } from "@/src/components/ui";
import { ApiError } from "@/src/api";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function Login() {
  const s = useStyles();
  const { user, booted, signIn } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (booted && user) {
    if (user.role === "driver") return <Redirect href="/driver" />;
    if (user.role === "admin") return <Redirect href="/admin" />;
    return <Redirect href="/(client)" />;
  }

  async function submit() {
    if (!email.trim() || !password) {
      toast.show("Preencha e-mail e senha", "error");
      return;
    }
    setLoading(true);
    try {
      const u = await signIn(email.trim(), password);
      if (u.role === "driver") router.replace("/driver");
      else if (u.role === "admin") router.replace("/admin");
      else router.replace("/(client)");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Erro ao entrar", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll style={s.wrap}>
      <Header title="Entrar" onBack={() => router.back()} />
      <View style={{ paddingHorizontal: 24, paddingTop: 16, gap: 8 }}>
        <View style={s.logoRow}>
          <Ionicons name="navigate" size={28} color={colors.brandPrimary} />
          <Text style={s.title}>BELMONTE MOBI</Text>
        </View>
        <Text style={s.sub}>Acesse sua conta para solicitar serviços</Text>

        <Field label="E-mail">
          <Input
            testID="login-email-input"
            placeholder="seu@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
        </Field>
        <Field label="Senha">
          <Input testID="login-password-input" placeholder="Sua senha" secureTextEntry value={password} onChangeText={setPassword} />
        </Field>

        <Button label="ENTRAR" testID="login-submit-button" onPress={submit} loading={loading} />

        <Pressable testID="login-forgot-link" onPress={() => router.push("/auth/forgot")} style={{ alignItems: "center", paddingVertical: 10, minHeight: 44, justifyContent: "center" }}>
          <Text style={s.link}>Esqueci minha senha</Text>
        </Pressable>

        <View style={s.registerRow}>
          <Text style={s.registerText}>Ainda não tem conta?</Text>
          <Link href="/auth/register" asChild>
            <Pressable testID="login-register-link">
              <Text style={s.link}>Criar conta de cliente</Text>
            </Pressable>
          </Link>
        </View>
        <View style={s.registerRow}>
          <Text style={s.registerText}>É motorista?</Text>
          <Link href="/driver/register" asChild>
            <Pressable testID="login-driver-register-link">
              <Text style={s.link}>Cadastre-se aqui</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flex: 1 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  title: { fontSize: 22, fontFamily: fonts.brand, color: colors.onSurface },
  sub: { color: colors.muted, fontFamily: fonts.text, fontSize: 14, marginBottom: 20 },
  link: { color: colors.brandSecondary, fontFamily: fonts.semi, fontSize: 14 },
  registerRow: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingVertical: 6 },
  registerText: { color: colors.onSurfaceTertiary, fontFamily: fonts.text, fontSize: 14 },
}));
