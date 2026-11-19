// Tipos compartilhados do app.
export type Place = { address: string; lat?: number | null; lng?: number | null };

export type Vehicle = {
  id?: string | null;
  plate: string;
  model: string;
  year: string;
  color: string;
  capacity: number;
  photo_url: string;
};

export type DriverInfo = {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  status: string;
  online: boolean;
  rating_avg: number;
  rating_count: number;
  photo_url?: string;
  cnh_category?: string;
  lat?: number | null;
  lng?: number | null;
  vehicle?: Vehicle | null;
};

export type Estimate = {
  service_type: string;
  price: number;
  distance_km: number;
  duration_min: number;
  vehicle_category: string;
  night: boolean;
  holiday: boolean;
  breakdown: Record<string, number | string>;
};

export type Ride = {
  id: string;
  code: string;
  service_type: "transporte" | "viagem" | "motorista_particular";
  status: "searching" | "scheduled" | "accepted" | "heading" | "arrived" | "in_progress" | "completed" | "cancelled";
  client_id: string;
  client_name?: string;
  client_phone?: string;
  driver_id?: string | null;
  origin: Place;
  destination?: Place | null;
  passengers: number;
  scheduled_at?: string | null;
  round_trip: boolean;
  luggage: number;
  hours?: number | null;
  notes: string;
  payment_method: string;
  coupon_code?: string;
  discount_pct?: number;
  vehicle_category: string;
  distance_km: number;
  duration_min: number;
  price: number;
  cancel_fee?: number;
  route?: [number, number][];
  driver?: DriverInfo | null;
  created_at?: string;
  completed_at?: string | null;
  rated?: boolean;
};

export type Delivery = {
  id: string;
  code: string;
  status: "created" | "assigned" | "collected" | "in_transit" | "delivered" | "cancelled";
  client_id: string;
  client_name?: string;
  driver_id?: string | null;
  pickup: Place;
  dropoff: Place;
  recipient_name: string;
  recipient_phone: string;
  description: string;
  size: "P" | "M" | "G";
  weight_kg: number;
  declared_value: number;
  photo_url: string;
  notes: string;
  payment_method: string;
  price: number;
  delivery_code: string;
  distance_km: number;
  driver?: DriverInfo | null;
  created_at?: string;
  delivered_at?: string | null;
  rated?: boolean;
};

export type TourPackage = {
  id: string;
  title: string;
  description: string;
  category: string;
  photo_url: string;
  duration_hours: number;
  price_per_person: number;
  max_people: number;
  departure_point: string;
  times: string[];
  guide_name: string;
  active: boolean;
};

export type Booking = {
  id: string;
  code: string;
  package_id: string;
  package_title: string;
  client_id: string;
  date: string;
  time: string;
  people: number;
  total: number;
  payment_method: string;
  status: string;
  notes: string;
  created_at?: string;
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  type: string;
  ref_id?: string | null;
  read: boolean;
  created_at?: string;
};

export type PublicSettings = {
  city: string;
  whatsapp_support: string;
  pix_key: string;
  vehicle_multipliers: Record<string, number>;
};

export type GeocodeResult = { label: string; lat: number; lng: number };
