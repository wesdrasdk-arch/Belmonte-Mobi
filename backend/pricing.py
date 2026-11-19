"""Motor de preços 100% configurável pelo painel administrativo (nada fixo no código)."""
from datetime import datetime
from typing import Optional

from models import EstimateOut, now

DEFAULT_SETTINGS: dict = {
    "city": "Belmonte",
    "whatsapp_support": "+5573999999999",
    "pix_key": "admin@belmontemobi.com",
    "min_price": 6.0,
    "base_fare": 4.0,
    "price_per_km": 2.5,
    "price_per_min": 0.3,
    "waiting_fee_per_hour": 20.0,
    "trip_per_km": 2.2,
    "trip_min_price": 40.0,
    "hourly_rate": 35.0,
    "delivery_base": 8.0,
    "delivery_per_km": 1.8,
    "night_surcharge_pct": 20.0,
    "holiday_surcharge_pct": 10.0,
    "cancellation_fee": 10.0,
    "round_trip_multiplier": 1.8,
    "vehicle_multipliers": {"economica": 1.0, "conforto": 1.2, "van": 1.45},
    "commission_pct": {
        "transporte": 10.0,
        "viagem": 10.0,
        "motorista_particular": 10.0,
        "encomenda": 12.0,
        "turismo": 15.0,
    },
    "holidays": [
        "2026-01-01", "2026-02-16", "2026-02-17", "2026-04-21", "2026-05-01",
        "2026-06-04", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-12-25",
    ],
}


async def get_settings(db) -> dict:
    doc = await db.settings.find_one({"_id": "app"})
    s = dict(DEFAULT_SETTINGS)
    if doc:
        doc.pop("_id", None)
        s.update(doc)
    return s


def is_night(when: datetime) -> bool:
    return when.hour >= 22 or when.hour < 5


def compute_price(
    s: dict,
    service_type: str,
    km: float,
    mins: float,
    vehicle_category: str = "economica",
    hours: Optional[float] = None,
    size: str = "P",
    when: Optional[datetime] = None,
    round_trip: bool = False,
) -> EstimateOut:
    when = when or now()
    mult = float(s.get("vehicle_multipliers", {}).get(vehicle_category, 1.0))
    parts: dict = {}

    if service_type == "transporte":
        base = float(s["base_fare"]) + km * float(s["price_per_km"]) + mins * float(s["price_per_min"])
        base = max(float(s["min_price"]), base) * mult
        parts["bandeirada"] = float(s["base_fare"])
    elif service_type == "viagem":
        base = max(float(s["trip_min_price"]), km * float(s["trip_per_km"]))
        if round_trip:
            base *= float(s.get("round_trip_multiplier", 1.8))
            parts["ida_e_volta"] = True
    elif service_type == "motorista_particular":
        base = (hours or 1.0) * float(s["hourly_rate"])
        parts["horas"] = hours or 1.0
    elif service_type == "encomenda":
        base = float(s["delivery_base"]) + km * float(s["delivery_per_km"])
        if size == "M":
            base *= 1.15
        elif size == "G":
            base *= 1.30
    else:
        base = float(s["min_price"])

    night = is_night(when)
    holiday = when.strftime("%Y-%m-%d") in (s.get("holidays") or [])
    surcharge = 0.0
    if night:
        surcharge += float(s["night_surcharge_pct"]) / 100.0
    if holiday:
        surcharge += float(s["holiday_surcharge_pct"]) / 100.0

    price = round(base * (1 + surcharge), 2)
    parts.update(
        {
            "distancia_km": round(km, 2),
            "minutos": round(mins, 1),
            "adicional_pct": round(surcharge * 100, 1),
            "multiplicador_veiculo": mult,
        }
    )
    return EstimateOut(
        service_type=service_type,
        price=price,
        distance_km=round(km, 2),
        duration_min=round(mins, 1),
        vehicle_category=vehicle_category,
        night=night,
        holiday=holiday,
        breakdown=parts,
    )
