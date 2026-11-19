import { useState } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useAuth } from "@/src/auth";
import { api, ApiError } from "@/src/api";
import { Button, Field, Header, Input, Screen, useToast } from "@/src/components/ui";

export default function ForgotPassword() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!email.trim()) {
      toast.show("Informe seu e-mail", "error");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/forgot", { email: email.trim() });
      setSent(true);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Erro ao solicitar", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll style={{ padding: 24 }}>
      <Header title="Recuperar senha" onBack={() => router.back()} />
      <View style={{ paddingTop: 16, gap: 12 }}>
        <Text style={{ color: "#64748B", fontFamily: "Geist-400", fontSize: 14, lineHeight: 20 }}>
          Informe seu e-mail cadastrado. Nossa equipe receberá sua solicitação e confirmará sua identidade pelo
          WhatsApp para redefinir a senha com segurança.
        </Text>
        {sent ? (
          <View style={{ backgroundColor: "#D1FAE5", borderRadius: 12, padding: 16 }}>
            <Text style={{ color: "#047857", fontFamily: "Geist-600" }}>
              Solicitação enviada! Fale com o suporte pelo WhatsApp para concluir a redefinição.
            </Text>
          </View>
        ) : (
          <>
            <Field label="E-mail">
              <Input
                testID="forgot-email-input"
                placeholder="seu@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </Field>
            <Button label="SOLICITAR REDEFINIÇÃO" testID="forgot-submit-button" onPress={submit} loading={loading} />
          </>
        )}
        <Button label="FALAR COM SUPORTE" variant="whatsapp" icon="logo-whatsapp" testID="forgot-whatsapp-button" onPress={() => toast.show("Abra o app e use o botão de suporte na tela inicial", "info")} />
      </View>
    </Screen>
  );
}
