import { useState } from "react";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useAuth } from "@/src/auth";
import { Button, Chip, Screen } from "@/src/components/ui";
import { fonts, makeStyles } from "@/src/theme";
import {
  AdminAudit,
  AdminDashboard,
  AdminDrivers,
  AdminPricing,
  AdminReports,
  AdminServices,
  AdminTickets,
  AdminTourism,
  AdminUsers,
} from "@/src/components/admin";

const SECTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "motoristas", label: "Motoristas" },
  { key: "clientes", label: "Clientes" },
  { key: "corridas", label: "Corridas e Viagens" },
  { key: "encomendas", label: "Encomendas" },
  { key: "reservas", label: "Reservas" },
  { key: "turismo", label: "Turismo" },
  { key: "precos", label: "Preços e Comissões" },
  { key: "relatorios", label: "Relatórios" },
  { key: "suporte", label: "Suporte" },
  { key: "logs", label: "Atividades" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

export default function AdminHome() {
  const s = useStyles();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [section, setSection] = useState<SectionKey>("dashboard");

  return (
    <Screen>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.brand}>BELMONTE MOBI · Admin</Text>
          <Text style={s.sub}>{user?.name} · Belmonte, BA</Text>
        </View>
        <Button label="Sair" small variant="secondary" icon="log-out" testID="admin-logout-button" onPress={async () => { await signOut(); router.replace("/"); }} />
      </View>
      <View style={{ height: 56, justifyContent: "center" }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, alignItems: "center" }}>
          {SECTIONS.map((sec) => (
            <Chip key={sec.key} label={sec.label} active={section === sec.key} onPress={() => setSection(sec.key)} testID={`admin-menu-${sec.key}`} />
          ))}
        </ScrollView>
      </View>
      <View style={{ flex: 1 }}>
        {section === "dashboard" && <AdminDashboard />}
        {section === "motoristas" && <AdminDrivers />}
        {section === "clientes" && <AdminUsers />}
        {section === "corridas" && <AdminServices kind="rides" />}
        {section === "encomendas" && <AdminServices kind="deliveries" />}
        {section === "reservas" && <AdminServices kind="bookings" />}
        {section === "turismo" && <AdminTourism />}
        {section === "precos" && <AdminPricing />}
        {section === "relatorios" && <AdminReports />}
        {section === "suporte" && <AdminTickets />}
        {section === "logs" && <AdminAudit />}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  header: { flexDirection: "row", alignItems: "center", padding: 16, paddingBottom: 4, gap: 8 },
  brand: { fontSize: 20, fontFamily: fonts.brand, color: colors.brandSecondary },
  sub: { fontSize: 13, fontFamily: fonts.text, color: colors.muted },
}));
