import { useState } from "react";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { FlatList, Image, Pressable, RefreshControl, Text, View } from "react-native";
import { ScrollView } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { Card, Chip, EmptyState, ErrorState, Loading, Screen } from "@/src/components/ui";
import { TOURISM_CATEGORIES, fmtBRL } from "@/src/utils/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import type { TourPackage } from "@/src/types";

export default function TourismCatalog() {
  const { colors } = useTheme();
  const router = useRouter();
  const [category, setCategory] = useState("todos");
  const s = useStyles();

  const packages = useQuery({
    queryKey: ["tourism", "packages", category],
    queryFn: () => api.get<TourPackage[]>(`/tourism/packages?category=${category}`),
  });

  const featured = (packages.data ?? []).slice(0, 3);

  return (
    <Screen>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Turismo em Belmonte</Text>
          <Text style={s.subtitle}>Passeios, história e praias com guias locais</Text>
        </View>
        <View style={s.icon}>
          <Ionicons name="leaf" size={22} color={colors.brandSecondary} />
        </View>
      </View>

      {/* Chips de categoria — linha rolável, nunca quebra linha */}
      <View style={s.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {Object.entries(TOURISM_CATEGORIES).map(([key, label]) => (
            <Chip key={key} label={label} active={category === key} onPress={() => setCategory(key)} testID={`tourism-chip-${key}`} />
          ))}
        </ScrollView>
      </View>

      {packages.isLoading ? (
        <Loading label="Carregando passeios..." />
      ) : packages.error ? (
        <ErrorState message="Erro ao carregar passeios" onRetry={() => packages.refetch()} />
      ) : (packages.data ?? []).length === 0 ? (
        <EmptyState icon="sunny-outline" title="Nenhum passeio nesta categoria" subtitle="Explore outras categorias ou fale com o suporte" />
      ) : (
        <FlatList
          data={packages.data}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 14 }}
          refreshControl={<RefreshControl refreshing={packages.isRefetching} onRefresh={() => packages.refetch()} tintColor={colors.brandPrimary} />}
          ListHeaderComponent={
            category === "todos" && featured.length > 0 ? (
              <View style={{ marginBottom: 6 }}>
                <Text style={s.sectionTitle}>Destaques</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 8 }}>
                  {featured.map((p) => (
                    <Pressable key={p.id} testID={`tourism-featured-${p.id}`} style={s.featuredCard} onPress={() => router.push(`/tourism/${p.id}`)}>
                      <Image source={{ uri: p.photo_url }} style={s.featuredImage} resizeMode="cover" />
                      <View style={s.featuredInfo}>
                        <Text style={s.featuredTitle} numberOfLines={2}>{p.title}</Text>
                        <Text style={s.featuredPrice}>{fmtBRL(p.price_per_person)} / pessoa</Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable testID={`tourism-card-${item.id}`} onPress={() => router.push(`/tourism/${item.id}`)}>
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <Image source={{ uri: item.photo_url }} style={s.cardImage} resizeMode="cover" />
                <View style={{ padding: 14, gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                  </View>
                  <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 4 }}>
                    <View style={s.metaRow}>
                      <Ionicons name="time" size={14} color={colors.muted} />
                      <Text style={s.metaText}>{item.duration_hours}h</Text>
                    </View>
                    <View style={s.metaRow}>
                      <Ionicons name="people" size={14} color={colors.muted} />
                      <Text style={s.metaText}>até {item.max_people}</Text>
                    </View>
                    <View style={s.priceTag}>
                      <Text style={s.priceTagText}>{fmtBRL(item.price_per_person)}</Text>
                      <Text style={s.priceTagSub}>/ pessoa</Text>
                    </View>
                  </View>
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  header: { flexDirection: "row", alignItems: "center", padding: 16, paddingBottom: 8, gap: 12 },
  title: { fontSize: 24, fontFamily: fonts.brand, color: colors.onSurface },
  subtitle: { fontSize: 13, fontFamily: fonts.text, color: colors.muted, marginTop: 2 },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  chipsWrap: { paddingBottom: 10, paddingTop: 6 },
  sectionTitle: { fontSize: 18, fontFamily: fonts.display, color: colors.onSurface, paddingHorizontal: 16, marginTop: 8 },
  featuredCard: { width: 250, borderRadius: 20, overflow: "hidden", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.divider, marginLeft: 16 },
  featuredImage: { width: "100%", height: 120 },
  featuredInfo: { padding: 12, gap: 4 },
  featuredTitle: { fontSize: 14.5, fontFamily: fonts.semi, color: colors.onSurface },
  featuredPrice: { fontSize: 13, fontFamily: fonts.display, color: colors.brandSecondary },
  cardImage: { width: "100%", height: 150 },
  cardTitle: { flex: 1, fontSize: 16, fontFamily: fonts.semi, color: colors.onSurface },
  cardDesc: { fontSize: 13, fontFamily: fonts.text, color: colors.muted, lineHeight: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, fontFamily: fonts.textMedium, color: colors.muted },
  priceTag: { flexDirection: "row", alignItems: "baseline", marginLeft: "auto" },
  priceTagText: { fontSize: 16, fontFamily: fonts.brand, color: colors.brandSecondary },
  priceTagSub: { fontSize: 11, fontFamily: fonts.text, color: colors.muted },
}));
