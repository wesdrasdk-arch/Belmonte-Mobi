import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Header, Screen } from "@/src/components/ui";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const OPTIONS = [
  { label: "Transporte agendado", sub: "Corrida para mais tarde", icon: "car", href: "/transport/new?schedule=1", testID: "schedule-transporte" },
  { label: "Viagem agendada", sub: "Belmonte → região, com data marcada", icon: "bus", href: "/trips/new?schedule=1", testID: "schedule-viagem" },
  { label: "Encomenda", sub: "Coleta e entrega com rastreamento", icon: "cube", href: "/deliveries/new?schedule=1", testID: "schedule-encomenda" },
  { label: "Motorista à disposição", sub: "Contrate por algumas horas", icon: "person", href: "/trips/new?mode=disponivel", testID: "schedule-motorista" },
];

export default function Schedule() {
  const router = useRouter();
  const { colors } = useTheme();
  const s = useStyles();

  return (
    <Screen scroll style={s.wrap}>
      <Header title="Agendar serviço" subtitle="Escolha o tipo de serviço" onBack={() => router.back()} />
      <View style={{ padding: 16, gap: 12 }}>
        {OPTIONS.map((o) => (
          <Pressable key={o.label} testID={o.testID} style={({ pressed }) => [s.card, { opacity: pressed ? 0.85 : 1 }]} onPress={() => router.push(o.href as never)}>
            <View style={s.icon}>
              <Ionicons name={o.icon as any} size={24} color={colors.brandSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{o.label}</Text>
              <Text style={s.cardSub}>{o.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        ))}
        <Text style={s.note}>
          Serviços agendados são exibidos aos motoristas aprovados com antecedência — você recebe uma confirmação no
          app assim que um motorista for designado.
        </Text>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flex: 1 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.divider, borderRadius: 16, padding: 16, minHeight: 76 },
  icon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 16, fontFamily: fonts.semi, color: colors.onSurface },
  cardSub: { fontSize: 13, fontFamily: fonts.text, color: colors.muted, marginTop: 2 },
  note: { color: colors.muted, fontFamily: fonts.text, fontSize: 12.5, lineHeight: 18, textAlign: "center", marginTop: 8 },
}));
