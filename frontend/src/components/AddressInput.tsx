// Input de endereço com autocomplete OpenStreetMap.
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { makeStyles, useTheme, fonts } from "@/src/theme";
import type { GeocodeResult, Place } from "@/src/types";

export function AddressInput({
  label,
  value,
  onSelect,
  testID,
  icon = "location",
}: {
  label: string;
  value: Place | null;
  onSelect: (p: Place) => void;
  testID: string;
  icon?: string;
}) {
  const { colors } = useTheme();
  const s = useStyles();
  const [text, setText] = useState(value?.address ?? "");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setText(value?.address ?? "");
  }, [value?.address]);

  function onChange(t: string) {
    setText(t);
    if (debounce.current) clearTimeout(debounce.current);
    if (t.trim().length < 4) {
      setResults([]);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        const r = await api.get<GeocodeResult[]>(`/geocode?q=${encodeURIComponent(t.trim())}`);
        setResults(r.slice(0, 5));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 450);
  }

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.inputRow}>
        <Ionicons name={icon as any} size={18} color={colors.brandSecondary} />
        <TextInput
          testID={testID}
          style={s.input}
          placeholder="Digite o endereço..."
          placeholderTextColor="#94A3B8"
          value={text}
          onChangeText={onChange}
        />
        {searching ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : null}
      </View>
      {results.length > 0 ? (
        <View style={s.results}>
          <FlatList
            data={results}
            keyExtractor={(r, i) => `${i}`}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={s.sep} />}
            renderItem={({ item }) => (
              <Pressable
                testID={`${testID}-option-${item.lat}`}
                style={({ pressed }) => [s.option, { opacity: pressed ? 0.7 : 1 }]}
                onPress={() => {
                  onSelect({ address: item.label, lat: item.lat, lng: item.lng });
                  setText(item.label);
                  setResults([]);
                }}
              >
                <Ionicons name="location" size={16} color={colors.muted} />
                <Text style={s.optionText} numberOfLines={2}>{item.label}</Text>
              </Pressable>
            )}
          />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  label: { fontSize: 13, color: colors.onSurfaceTertiary, fontFamily: fonts.textSemi, marginBottom: 6 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  input: { flex: 1, fontSize: 15, color: colors.onSurface, fontFamily: fonts.text, minHeight: 48 },
  results: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
    overflow: "hidden",
  },
  option: { flexDirection: "row", gap: 8, padding: 12, alignItems: "center" },
  optionText: { flex: 1, color: colors.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 13.5 },
  sep: { height: 1, backgroundColor: colors.divider },
}));
