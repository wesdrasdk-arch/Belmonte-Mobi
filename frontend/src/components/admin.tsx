// Seções do painel administrativo.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, ApiError, fileUrl } from "@/src/api";
import { Button, Card, EmptyState, ErrorState, Input, Loading, Pill, Stars, useToast } from "@/src/components/ui";
import { DELIVERY_STATUS, RIDE_STATUS, SERVICE_LABELS, TOURISM_CATEGORIES, fmtBRL, fmtDateTime } from "@/src/utils/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";

function Scroll({ children, onRefresh }: { children: React.ReactNode; onRefresh?: () => void }) {
  const { colors } = useTheme();
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.brandPrimary} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

// ------------------------------------------------------------------ Dashboard
type Dash = Record<string, number>;
export function AdminDashboard() {
  const s = useStyles();
  const q = useQuery({ queryKey: ["admin", "dashboard"], queryFn: () => api.get<Dash>("/admin/dashboard"), refetchInterval: 10000 });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState message="Erro ao carregar dashboard" onRetry={() => q.refetch()} />;
  const d = q.data;
  const tiles: { label: string; value: string; icon: string; id: string }[] = [
    { label: "Faturamento total", value: fmtBRL(d.revenue), icon: "cash", id: "revenue" },
    { label: "Comissão da plataforma", value: fmtBRL(d.commission), icon: "trending-up", id: "commission" },
    { label: "Faturamento 24h", value: fmtBRL(d.revenue_today), icon: "today", id: "revenue-today" },
    { label: "Clientes", value: String(d.clients), icon: "people", id: "clients" },
    { label: "Motoristas cadastrados", value: String(d.drivers_total), icon: "car-sport", id: "drivers" },
    { label: "Motoristas online", value: String(d.drivers_online), icon: "radio", id: "drivers-online" },
    { label: "Aguardando aprovação", value: String(d.drivers_pending), icon: "hourglass", id: "drivers-pending" },
    { label: "Corridas/viagens concluídas", value: String(d.rides_completed), icon: "checkmark-done", id: "rides-completed" },
    { label: "Em andamento", value: String(d.rides_active), icon: "navigate", id: "rides-active" },
    { label: "Agendadas", value: String(d.rides_scheduled), icon: "calendar", id: "rides-scheduled" },
    { label: "Encomendas", value: `${d.deliveries_delivered}/${d.deliveries_total}`, icon: "cube", id: "deliveries" },
    { label: "Reservas de turismo", value: String(d.bookings_total), icon: "sunny", id: "bookings" },
    { label: "Serviços cancelados", value: String(d.rides_cancelled + d.deliveries_cancelled), icon: "close-circle", id: "cancelled" },
    { label: "Tickets de suporte", value: String(d.open_tickets), icon: "help-buoy", id: "tickets" },
  ];
  return (
    <Scroll onRefresh={() => q.refetch()}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {tiles.map((t, i) => (
          <Card key={t.id} testID={`admin-stat-${t.id}`} style={[s.tile, i < 2 && s.tileHighlight]}>
            <Ionicons name={t.icon as any} size={18} color={i < 2 ? "#FFFFFF" : "#0369A1"} />
            <Text style={[s.tileValue, i < 2 && { color: "#FFFFFF" }]}>{t.value}</Text>
            <Text style={[s.tileLabel, i < 2 && { color: "#E0F2FE" }]}>{t.label}</Text>
          </Card>
        ))}
      </View>
    </Scroll>
  );
}

// ------------------------------------------------------------------ Motoristas
type AdminDriver = {
  id: string; user_id: string; name: string; phone: string; email: string; status: string; online: boolean; cpf: string;
  cnh_number: string; cnh_category: string; cnh_validity: string; cnh_photo_url: string; doc_url: string;
  rating_avg: number; rating_count: number; earnings_total: number;
  vehicle?: { plate: string; model: string; year: string; color: string; capacity: number; photo_url: string } | null;
};
const DRIVER_STATUS: Record<string, { label: string; tone: "warning" | "success" | "error" }> = {
  pending: { label: "Pendente", tone: "warning" },
  approved: { label: "Aprovado", tone: "success" },
  rejected: { label: "Reprovado", tone: "error" },
  blocked: { label: "Bloqueado", tone: "error" },
};
function img(url: string) {
  if (!url) return null;
  return url.startsWith("/api/files/") ? fileUrl(url.replace("/api/files/", "")) : { uri: url };
}

export function AdminDrivers() {
  const s = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("todos");
  const q = useQuery({ queryKey: ["admin", "drivers", filter], queryFn: () => api.get<AdminDriver[]>(`/admin/drivers?status_filter=${filter}`) });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.post(`/admin/drivers/${id}/status`, { status }),
    onSuccess: () => { toast.show("Status atualizado", "success"); qc.invalidateQueries({ queryKey: ["admin"] }); },
    onError: (e) => toast.show(e instanceof ApiError ? e.message : "Erro", "error"),
  });
  return (
    <Scroll onRefresh={() => q.refetch()}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {["todos", "pending", "approved", "rejected", "blocked"].map((f) => (
          <Pressable key={f} testID={`admin-drivers-filter-${f}`} onPress={() => setFilter(f)} style={[s.miniChip, filter === f && s.miniChipActive]}>
            <Text style={[s.miniChipText, filter === f && s.miniChipTextActive]}>{f === "todos" ? "Todos" : DRIVER_STATUS[f].label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {q.isLoading ? <Loading /> : (q.data ?? []).length === 0 ? <EmptyState icon="car-outline" title="Nenhum motorista" /> : null}
      {(q.data ?? []).map((d) => {
        const st = DRIVER_STATUS[d.status] ?? DRIVER_STATUS.pending;
        return (
          <Card key={d.id} testID={`admin-driver-${d.email}`} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={s.title}>{d.name}</Text>
              {d.online ? <Pill text="Online" tone="success" /> : null}
              <Pill text={st.label} tone={st.tone} />
            </View>
            <Text style={s.line}>{d.email} · {d.phone}</Text>
            <Text style={s.line}>CPF {d.cpf} · CNH {d.cnh_number} ({d.cnh_category}) · validade {d.cnh_validity}</Text>
            <Text style={s.line}>
              Veículo: {d.vehicle?.model || "—"} {d.vehicle?.year} · {d.vehicle?.color} · {d.vehicle?.plate || "sem placa"} · {d.vehicle?.capacity} lugares
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Stars value={d.rating_avg} size={14} />
              <Text style={s.line}>{d.rating_avg.toFixed(1)} ({d.rating_count}) · Ganhos {fmtBRL(d.earnings_total)}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[{ u: d.cnh_photo_url, l: "CNH" }, { u: d.doc_url, l: "Documento" }, { u: d.vehicle?.photo_url ?? "", l: "Veículo" }].map((x) => {
                const src = img(x.u);
                return (
                  <View key={x.l} style={s.docBox}>
                    {src ? <Image source={src} style={s.docImg} /> : <Ionicons name="document-outline" size={20} color="#94A3B8" />}
                    <Text style={s.docLabel}>{x.l}{src ? "" : " (falta)"}</Text>
                  </View>
                );
              })}
            </View>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {d.status !== "approved" ? <Button label="APROVAR" small variant="success" testID={`admin-approve-${d.email}`} onPress={() => setStatus.mutate({ id: d.id, status: "approved" })} /> : null}
              {d.status !== "rejected" ? <Button label="REPROVAR" small variant="secondary" testID={`admin-reject-${d.email}`} onPress={() => setStatus.mutate({ id: d.id, status: "rejected" })} /> : null}
              {d.status !== "blocked" ? <Button label="BLOQUEAR" small variant="danger" testID={`admin-block-driver-${d.email}`} onPress={() => setStatus.mutate({ id: d.id, status: "blocked" })} /> : null}
            </View>
          </Card>
        );
      })}
    </Scroll>
  );
}

// ------------------------------------------------------------------ Clientes
type AdminUser = { id: string; name: string; email: string; phone: string; blocked: boolean; created_at: string };
export function AdminUsers() {
  const s = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["admin", "users", search], queryFn: () => api.get<AdminUser[]>(`/admin/users?role=client&q=${encodeURIComponent(search)}`) });
  const block = useMutation({
    mutationFn: ({ id, blocked }: { id: string; blocked: boolean }) => api.post(`/admin/users/${id}/block`, { blocked }),
    onSuccess: () => { toast.show("Usuário atualizado", "success"); qc.invalidateQueries({ queryKey: ["admin"] }); },
    onError: (e) => toast.show(e instanceof ApiError ? e.message : "Erro", "error"),
  });
  return (
    <Scroll onRefresh={() => q.refetch()}>
      <Input testID="admin-users-search" placeholder="Buscar por nome ou e-mail" value={search} onChangeText={setSearch} autoCapitalize="none" />
      {q.isLoading ? <Loading /> : (q.data ?? []).length === 0 ? <EmptyState icon="people-outline" title="Nenhum cliente" /> : null}
      {(q.data ?? []).map((u) => (
        <Card key={u.id} testID={`admin-user-${u.email}`} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={s.title}>{u.name}</Text>
            {u.blocked ? <Pill text="Bloqueado" tone="error" /> : <Pill text="Ativo" tone="success" />}
          </View>
          <Text style={s.line}>{u.email} · {u.phone}</Text>
          <Text style={s.line}>Desde {fmtDateTime(u.created_at)}</Text>
          <Button
            label={u.blocked ? "DESBLOQUEAR" : "BLOQUEAR"}
            small
            variant={u.blocked ? "success" : "danger"}
            testID={`admin-block-user-${u.email}`}
            style={{ alignSelf: "flex-start", marginTop: 4 }}
            onPress={() => block.mutate({ id: u.id, blocked: !u.blocked })}
          />
        </Card>
      ))}
    </Scroll>
  );
}

// ------------------------------------------------------------------ Serviços
type AnyService = Record<string, any>;
export function AdminServices({ kind }: { kind: "rides" | "deliveries" | "bookings" }) {
  const s = useStyles();
  const q = useQuery({ queryKey: ["admin", kind], queryFn: () => api.get<AnyService[]>(`/admin/${kind}`), refetchInterval: 10000 });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState message="Erro ao carregar" onRetry={() => q.refetch()} />;
  const items = q.data ?? [];
  return (
    <Scroll onRefresh={() => q.refetch()}>
      <Text style={s.count}>{items.length} registro(s)</Text>
      {items.length === 0 ? <EmptyState icon="file-tray-outline" title="Nenhum registro ainda" /> : null}
      {items.map((it) => {
        const statusLabel =
          kind === "rides" ? RIDE_STATUS[it.status]?.label : kind === "deliveries" ? DELIVERY_STATUS[it.status]?.label : it.status === "confirmed" ? "Confirmada" : "Cancelada";
        const tone = ["completed", "delivered", "confirmed"].includes(it.status) ? "success" : it.status === "cancelled" ? "error" : "info";
        return (
          <Card key={it.id} testID={`admin-${kind}-${it.code}`} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={s.title}>
                {kind === "rides" ? SERVICE_LABELS[it.service_type] : kind === "deliveries" ? "Encomenda" : it.package_title} · {it.code}
              </Text>
              <Pill text={statusLabel ?? it.status} tone={tone as any} />
            </View>
            <Text style={s.line}>Cliente: {it.client_name}{kind !== "bookings" ? ` · Motorista: ${it.driver_name ?? "—"}` : ""}</Text>
            {kind === "rides" ? <Text style={s.line} numberOfLines={2}>{it.origin?.address} → {it.destination?.address ?? `${it.hours ?? ""}h à disposição`}</Text> : null}
            {kind === "deliveries" ? <Text style={s.line} numberOfLines={2}>{it.pickup?.address} → {it.dropoff?.address}</Text> : null}
            {kind === "bookings" ? <Text style={s.line}>{it.date} às {it.time} · {it.people} pessoa(s)</Text> : null}
            <Text style={s.line}>
              {fmtDateTime(it.created_at)} · {it.payment_method === "pix" ? "Pix" : "Dinheiro"} · <Text style={s.money}>{fmtBRL(it.price ?? it.total ?? 0)}</Text>
            </Text>
          </Card>
        );
      })}
    </Scroll>
  );
}

// ------------------------------------------------------------------ Preços e comissões
type SettingsT = Record<string, any>;
const PRICE_FIELDS: { key: string; label: string }[] = [
  { key: "min_price", label: "Preço mínimo (R$)" },
  { key: "base_fare", label: "Bandeirada (R$)" },
  { key: "price_per_km", label: "Preço por km — transporte (R$)" },
  { key: "price_per_min", label: "Preço por minuto (R$)" },
  { key: "hourly_rate", label: "Preço por hora — motorista particular (R$)" },
  { key: "waiting_fee_per_hour", label: "Preço de espera por hora (R$)" },
  { key: "trip_per_km", label: "Tarifa viagens por km (R$)" },
  { key: "trip_min_price", label: "Tarifa mínima de viagem (R$)" },
  { key: "delivery_base", label: "Tarifa base encomendas (R$)" },
  { key: "delivery_per_km", label: "Encomendas por km (R$)" },
  { key: "night_surcharge_pct", label: "Adicional noturno 22h–5h (%)" },
  { key: "holiday_surcharge_pct", label: "Adicional feriados (%)" },
  { key: "cancellation_fee", label: "Taxa de cancelamento (R$)" },
];
const COMMISSION_KEYS = ["transporte", "viagem", "motorista_particular", "encomenda", "turismo"];

export function AdminPricing() {
  const s = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "settings"], queryFn: () => api.get<SettingsT>("/admin/settings") });
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!q.data) return;
    const f: Record<string, string> = {
      whatsapp_support: q.data.whatsapp_support ?? "",
      pix_key: q.data.pix_key ?? "",
    };
    PRICE_FIELDS.forEach((p) => (f[p.key] = String(q.data[p.key] ?? "")));
    COMMISSION_KEYS.forEach((k) => (f[`c_${k}`] = String(q.data.commission_pct?.[k] ?? "")));
    Object.entries(q.data.vehicle_multipliers ?? {}).forEach(([k, v]) => (f[`v_${k}`] = String(v)));
    setForm(f);
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => {
      const body: SettingsT = { whatsapp_support: form.whatsapp_support, pix_key: form.pix_key, commission_pct: {}, vehicle_multipliers: {} };
      PRICE_FIELDS.forEach((p) => (body[p.key] = parseFloat(form[p.key]?.replace(",", ".")) || 0));
      COMMISSION_KEYS.forEach((k) => (body.commission_pct[k] = parseFloat(form[`c_${k}`]?.replace(",", ".")) || 0));
      ["economica", "conforto", "van"].forEach((k) => (body.vehicle_multipliers[k] = parseFloat(form[`v_${k}`]?.replace(",", ".")) || 1));
      return api.put("/admin/settings", body);
    },
    onSuccess: () => { toast.show("Tarifas salvas! Já valem para novas solicitações.", "success"); qc.invalidateQueries({ queryKey: ["admin", "settings"] }); },
    onError: (e) => toast.show(e instanceof ApiError ? e.message : "Erro ao salvar", "error"),
  });

  if (q.isLoading) return <Loading />;
  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const example = parseFloat(form.c_transporte || "0") || 0;
  return (
    <Scroll>
      <Text style={s.section}>Tarifas</Text>
      {PRICE_FIELDS.map((p) => (
        <Input key={p.key} label={p.label} testID={`admin-price-${p.key}`} keyboardType="decimal-pad" value={form[p.key] ?? ""} onChangeText={set(p.key)} />
      ))}
      <Text style={s.section}>Multiplicador por categoria de veículo</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {["economica", "conforto", "van"].map((k) => (
          <View key={k} style={{ flex: 1 }}>
            <Input label={k === "economica" ? "Econômico" : k === "conforto" ? "Conforto" : "Van"} testID={`admin-mult-${k}`} keyboardType="decimal-pad" value={form[`v_${k}`] ?? ""} onChangeText={set(`v_${k}`)} />
          </View>
        ))}
      </View>
      <Text style={s.section}>Comissão da plataforma por serviço (%)</Text>
      {COMMISSION_KEYS.map((k) => (
        <Input key={k} label={SERVICE_LABELS[k]} testID={`admin-commission-${k}`} keyboardType="decimal-pad" value={form[`c_${k}`] ?? ""} onChangeText={set(`c_${k}`)} />
      ))}
      <Card style={{ backgroundColor: "#E0F2FE" }}>
        <Text style={s.line}>
          Exemplo: serviço de transporte de R$ 100 → plataforma {fmtBRL(example)} · motorista {fmtBRL(100 - example)}
        </Text>
      </Card>
      <Text style={s.section}>Atendimento e pagamento</Text>
      <Input label="WhatsApp do suporte (com DDI)" testID="admin-settings-whatsapp" keyboardType="phone-pad" value={form.whatsapp_support ?? ""} onChangeText={set("whatsapp_support")} />
      <Input label="Chave Pix da plataforma" testID="admin-settings-pix" autoCapitalize="none" value={form.pix_key ?? ""} onChangeText={set("pix_key")} />
      <Button label="SALVAR CONFIGURAÇÕES" testID="admin-settings-save" loading={save.isPending} onPress={() => save.mutate()} />
    </Scroll>
  );
}

// ------------------------------------------------------------------ Turismo
type Pkg = { id: string; title: string; description: string; category: string; photo_url: string; duration_hours: number; price_per_person: number; max_people: number; departure_point: string; times: string[]; guide_name: string };
const EMPTY_PKG = { title: "", description: "", category: "passeio_belmonte", photo_url: "", duration_hours: "3", price_per_person: "80", max_people: "8", departure_point: "", times: "08:00, 14:00", guide_name: "" };

export function AdminTourism() {
  const s = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tourism", "packages", "todos"], queryFn: () => api.get<Pkg[]>("/tourism/packages?category=todos") });
  const [editing, setEditing] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>(EMPTY_PKG);
  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...f,
        duration_hours: parseFloat(f.duration_hours) || 1,
        price_per_person: parseFloat(f.price_per_person) || 0,
        max_people: parseInt(f.max_people, 10) || 1,
        times: f.times.split(",").map((t) => t.trim()).filter(Boolean),
      };
      return editing && editing !== "new" ? api.put(`/admin/packages/${editing}`, body) : api.post("/admin/packages", body);
    },
    onSuccess: () => { toast.show("Passeio salvo", "success"); setEditing(null); qc.invalidateQueries({ queryKey: ["tourism"] }); },
    onError: (e) => toast.show(e instanceof ApiError ? e.message : "Erro ao salvar", "error"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.post(`/admin/packages/${id}/delete`),
    onSuccess: () => { toast.show("Passeio removido", "info"); qc.invalidateQueries({ queryKey: ["tourism"] }); },
  });

  if (editing) {
    return (
      <Scroll>
        <Text style={s.section}>{editing === "new" ? "Novo roteiro" : "Editar roteiro"}</Text>
        <Input label="Nome do passeio" testID="admin-pkg-title" value={f.title} onChangeText={set("title")} />
        <Input label="Descrição" testID="admin-pkg-description" multiline value={f.description} onChangeText={set("description")} style={{ minHeight: 90, textAlignVertical: "top", paddingTop: 12 }} />
        <Text style={s.fieldLabel}>Categoria</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
          {Object.entries(TOURISM_CATEGORIES).filter(([k]) => k !== "todos").map(([k, l]) => (
            <Pressable key={k} testID={`admin-pkg-cat-${k}`} onPress={() => set("category")(k)} style={[s.miniChip, f.category === k && s.miniChipActive]}>
              <Text style={[s.miniChipText, f.category === k && s.miniChipTextActive]}>{l}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Input label="URL da foto" testID="admin-pkg-photo" autoCapitalize="none" value={f.photo_url} onChangeText={set("photo_url")} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Input label="Duração (h)" testID="admin-pkg-duration" keyboardType="decimal-pad" value={f.duration_hours} onChangeText={set("duration_hours")} /></View>
          <View style={{ flex: 1 }}><Input label="Preço/pessoa" testID="admin-pkg-price" keyboardType="decimal-pad" value={f.price_per_person} onChangeText={set("price_per_person")} /></View>
          <View style={{ flex: 1 }}><Input label="Máx. pessoas" testID="admin-pkg-max" keyboardType="number-pad" value={f.max_people} onChangeText={set("max_people")} /></View>
        </View>
        <Input label="Ponto de saída" testID="admin-pkg-departure" value={f.departure_point} onChangeText={set("departure_point")} />
        <Input label="Horários (separados por vírgula)" testID="admin-pkg-times" value={f.times} onChangeText={set("times")} />
        <Input label="Motorista/guia" testID="admin-pkg-guide" value={f.guide_name} onChangeText={set("guide_name")} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label="SALVAR" testID="admin-pkg-save" style={{ flex: 1 }} loading={save.isPending} onPress={() => save.mutate()} />
          <Button label="CANCELAR" variant="secondary" testID="admin-pkg-cancel" style={{ flex: 1 }} onPress={() => setEditing(null)} />
        </View>
      </Scroll>
    );
  }

  return (
    <Scroll onRefresh={() => q.refetch()}>
      <Button label="CADASTRAR NOVO ROTEIRO" icon="add" testID="admin-pkg-new" onPress={() => { setF(EMPTY_PKG); setEditing("new"); }} />
      {q.isLoading ? <Loading /> : null}
      {(q.data ?? []).map((p) => (
        <Card key={p.id} testID={`admin-pkg-${p.id}`} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          {p.photo_url ? <Image source={{ uri: p.photo_url }} style={s.pkgImg} /> : <View style={s.pkgImg} />}
          <View style={{ flex: 1 }}>
            <Text style={s.title} numberOfLines={1}>{p.title}</Text>
            <Text style={s.line}>{TOURISM_CATEGORIES[p.category]} · {fmtBRL(p.price_per_person)} · {p.duration_hours}h</Text>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
              <Button label="Editar" small variant="secondary" testID={`admin-pkg-edit-${p.id}`} onPress={() => {
                setF({ ...p, duration_hours: String(p.duration_hours), price_per_person: String(p.price_per_person), max_people: String(p.max_people), times: p.times.join(", ") } as any);
                setEditing(p.id);
              }} />
              <Button label="Remover" small variant="danger" testID={`admin-pkg-remove-${p.id}`} onPress={() => remove.mutate(p.id)} />
            </View>
          </View>
        </Card>
      ))}
    </Scroll>
  );
}

// ------------------------------------------------------------------ Relatórios
type Report = { daily: { date: string; total: number; commission: number; count: number }[]; by_service: { service: string; total: number; count: number }[] };
export function AdminReports() {
  const s = useStyles();
  const { colors } = useTheme();
  const q = useQuery({ queryKey: ["admin", "reports"], queryFn: () => api.get<Report>("/admin/reports?days=14") });
  if (q.isLoading) return <Loading />;
  const daily = q.data?.daily ?? [];
  const max = Math.max(1, ...daily.map((d) => d.total));
  const total = daily.reduce((a, d) => a + d.total, 0);
  const comm = daily.reduce((a, d) => a + d.commission, 0);
  return (
    <Scroll onRefresh={() => q.refetch()}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Card style={{ flex: 1 }}><Text style={s.tileLabel}>Faturamento 14 dias</Text><Text testID="admin-report-total" style={s.tileValue}>{fmtBRL(total)}</Text></Card>
        <Card style={{ flex: 1 }}><Text style={s.tileLabel}>Comissão 14 dias</Text><Text testID="admin-report-commission" style={s.tileValue}>{fmtBRL(comm)}</Text></Card>
      </View>
      <Text style={s.section}>Faturamento por dia</Text>
      <Card>
        {daily.length === 0 ? <Text style={s.line}>Sem dados no período.</Text> : (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 140 }}>
            {daily.map((d) => (
              <View key={d.date} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                <View style={{ width: "100%", height: Math.max(4, (d.total / max) * 110), backgroundColor: colors.brandPrimary, borderRadius: 6 }} />
                <Text style={{ fontSize: 9, color: colors.muted, fontFamily: fonts.text }}>{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>
      <Text style={s.section}>Por tipo de serviço</Text>
      {(q.data?.by_service ?? []).map((b) => (
        <Card key={b.service} style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={s.title}>{SERVICE_LABELS[b.service] ?? b.service} ({b.count})</Text>
          <Text style={s.money}>{fmtBRL(b.total)}</Text>
        </Card>
      ))}
    </Scroll>
  );
}

// ------------------------------------------------------------------ Suporte
type Ticket = { id: string; subject: string; message: string; status: string; kind: string; created_at: string };
export function AdminTickets() {
  const s = useStyles();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "tickets"], queryFn: () => api.get<Ticket[]>("/admin/tickets") });
  const resolve = useMutation({ mutationFn: (id: string) => api.post(`/admin/tickets/${id}/resolve`), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }) });
  return (
    <Scroll onRefresh={() => q.refetch()}>
      {q.isLoading ? <Loading /> : (q.data ?? []).length === 0 ? <EmptyState icon="help-buoy-outline" title="Nenhum ticket" /> : null}
      {(q.data ?? []).map((t) => (
        <Card key={t.id} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Text style={s.title}>{t.subject}</Text>
            <Pill text={t.status === "open" ? "Aberto" : "Resolvido"} tone={t.status === "open" ? "warning" : "success"} />
          </View>
          <Text style={s.line}>{t.message}</Text>
          <Text style={s.line}>{fmtDateTime(t.created_at)}</Text>
          {t.status === "open" ? <Button label="MARCAR RESOLVIDO" small variant="secondary" testID={`admin-ticket-resolve-${t.id}`} style={{ alignSelf: "flex-start" }} onPress={() => resolve.mutate(t.id)} /> : null}
        </Card>
      ))}
    </Scroll>
  );
}

// ------------------------------------------------------------------ Logs
type Log = { id: string; actor_name: string; action: string; target: string; detail: string; created_at: string };
export function AdminAudit() {
  const s = useStyles();
  const q = useQuery({ queryKey: ["admin", "audit"], queryFn: () => api.get<Log[]>("/admin/audit-logs") });
  return (
    <Scroll onRefresh={() => q.refetch()}>
      {q.isLoading ? <Loading /> : (q.data ?? []).length === 0 ? <EmptyState icon="list-outline" title="Nenhuma atividade registrada" /> : null}
      {(q.data ?? []).map((l) => (
        <Card key={l.id} style={{ gap: 2 }}>
          <Text style={s.title}>{l.action.replace(/_/g, " ")}</Text>
          <Text style={s.line}>{l.actor_name} → {l.target} {l.detail ? `(${l.detail})` : ""}</Text>
          <Text style={s.line}>{fmtDateTime(l.created_at)}</Text>
        </Card>
      ))}
    </Scroll>
  );
}

const useStyles = makeStyles((colors) => ({
  tile: { width: "47.5%", flexGrow: 1, gap: 4, minWidth: 150 },
  tileHighlight: { backgroundColor: colors.brandSecondary, borderColor: colors.brandSecondary },
  tileValue: { fontSize: 20, fontFamily: fonts.brand, color: colors.onSurface },
  tileLabel: { fontSize: 12, fontFamily: fonts.textSemi, color: colors.muted },
  title: { fontSize: 15, fontFamily: fonts.semi, color: colors.onSurface, flex: 1 },
  line: { fontSize: 13, fontFamily: fonts.text, color: colors.onSurfaceTertiary, lineHeight: 18 },
  money: { fontFamily: fonts.display, color: colors.brandSecondary, fontSize: 14 },
  count: { fontSize: 12.5, fontFamily: fonts.textSemi, color: colors.muted },
  section: { fontSize: 16, fontFamily: fonts.display, color: colors.onSurface, marginTop: 8 },
  fieldLabel: { fontSize: 13, color: colors.onSurfaceTertiary, fontFamily: fonts.textSemi },
  miniChip: { flexShrink: 0, height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  miniChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  miniChipText: { fontSize: 13, fontFamily: fonts.textSemi, color: colors.onSurfaceSecondary },
  miniChipTextActive: { color: colors.onBrandPrimary },
  docBox: { flex: 1, height: 80, borderRadius: 10, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", gap: 4, overflow: "hidden", padding: 4 },
  docImg: { width: "100%", height: 50, borderRadius: 6 },
  docLabel: { fontSize: 10.5, fontFamily: fonts.textSemi, color: colors.muted },
  pkgImg: { width: 72, height: 72, borderRadius: 12, backgroundColor: colors.surfaceTertiary },
}));
