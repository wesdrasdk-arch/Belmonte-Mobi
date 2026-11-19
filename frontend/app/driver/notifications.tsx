import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { useRouter } from "expo-router";
import { Button, Card, EmptyState, ErrorState, Header, Loading, Screen } from "@/src/components/ui";
import { fmtDateTime } from "@/src/utils/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { NotificationItem } from "@/src/types";

const ICONS: Record<string, string> = {
  ride: "car",
  delivery: "cube",
  booking: "sunny",
  driver: "car-sport",
  rating: "star",
  support: "help-circle",
  info: "notifications",
};

export default function Notifications() {
  const s = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const router = useRouter();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ items: NotificationItem[]; unread: number }>("/notifications"),
    refetchInterval: 15000,
  });

  const readAll = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const readOne = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const items = data?.items ?? [];

  return (
    <Screen scroll style={{ paddingBottom: 40 }}>
      <Header title="" onBack={() => router.back()} />
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Notificações</Text>
          <Text style={s.subtitle}>{data?.unread ? `${data.unread} não lida(s)` : "Tudo em dia"}</Text>
        </View>
        {(data?.unread ?? 0) > 0 ? (
          <Button label="Marcar lidas" variant="secondary" small testID="notifications-read-all-button" onPress={() => readAll.mutate()} />
        ) : null}
      </View>

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorState message="Erro ao carregar notificações" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon="notifications-off-outline" title="Sem novidades por aqui" subtitle="Você será avisado sobre cada etapa dos seus serviços" />
      ) : (
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {items.map((n) => (
            <Pressable key={n.id} testID={`notification-${n.id}`} onPress={() => !n.read && readOne.mutate(n.id)}>
              <Card style={{ opacity: n.read ? 0.75 : 1 }}>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={s.icon}>
                    <Ionicons name={(ICONS[n.type] ?? ICONS.info) as any} size={20} color={n.read ? colors.muted : colors.brandSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={[s.title2, !n.read && { fontFamily: fonts.textBold }]}>{n.title}</Text>
                      {!n.read ? <View style={s.dot} /> : null}
                    </View>
                    <Text style={s.body}>{n.body}</Text>
                    <Text style={s.time}>{fmtDateTime(n.created_at)}</Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  header: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  title: { fontSize: 24, fontFamily: fonts.brand, color: colors.onSurface },
  subtitle: { fontSize: 13, fontFamily: fonts.text, color: colors.muted, marginTop: 2 },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  title2: { color: colors.onSurface, fontFamily: fonts.semi, fontSize: 14.5, flex: 1 },
  body: { color: colors.onSurfaceTertiary, fontFamily: fonts.text, fontSize: 13.5, marginTop: 3, lineHeight: 19 },
  time: { color: colors.muted, fontFamily: fonts.text, fontSize: 11.5, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary },
}));
