// helpers de formatação e rótulos (pt-BR)
export function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function fmtDateOnly(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "—";
  }
}

export const SERVICE_LABELS: Record<string, string> = {
  transporte: "Transporte",
  viagem: "Viagem",
  motorista_particular: "Motorista particular",
  encomenda: "Encomenda",
  turismo: "Turismo",
};

export const RIDE_STATUS: Record<string, { label: string; step: number }> = {
  searching: { label: "Procurando motorista", step: 0 },
  scheduled: { label: "Agendado", step: 1 },
  accepted: { label: "Motorista encontrado", step: 1 },
  heading: { label: "Motorista a caminho", step: 2 },
  arrived: { label: "Motorista chegou", step: 3 },
  in_progress: { label: "Viagem em andamento", step: 4 },
  completed: { label: "Viagem concluída", step: 5 },
  cancelled: { label: "Cancelado", step: -1 },
};

export const DELIVERY_STATUS: Record<string, { label: string; step: number }> = {
  created: { label: "Solicitação criada", step: 0 },
  assigned: { label: "Motorista designado", step: 1 },
  collected: { label: "Encomenda coletada", step: 2 },
  in_transit: { label: "Em transporte", step: 3 },
  delivered: { label: "Entregue", step: 4 },
  cancelled: { label: "Cancelada", step: -1 },
};

export const TOURISM_CATEGORIES: Record<string, string> = {
  todos: "Todos",
  passeio_belmonte: "Passeio em Belmonte",
  praias: "Passeio para praias",
  roteiro_historico: "Roteiro histórico",
  mogiquicaba: "Mogiquiçaba",
  personalizado: "Personalizado",
  transfer: "Transfer turístico",
};

export const VEHICLE_CATEGORIES: Record<string, string> = {
  economica: "Econômico",
  conforto: "Conforto",
  van: "Van",
};
