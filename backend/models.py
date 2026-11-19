"""Modelos de dados (Pydantic <-> MongoDB) do BELMONTE MOBI."""
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from bson import ObjectId
from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field
from typing_extensions import Annotated


def _oid_to_str(v: Any) -> Any:
    if isinstance(v, ObjectId):
        return str(v)
    return v


PyObjectId = Annotated[str, BeforeValidator(_oid_to_str)]


def now() -> datetime:
    return datetime.now(timezone.utc)


class BaseDocument(BaseModel):
    """Base dos documentos: converte _id (ObjectId) -> id (str) com segurança."""

    model_config = ConfigDict(extra="ignore")

    id: Optional[PyObjectId] = None

    def to_mongo(self) -> dict:
        data = self.model_dump()
        data.pop("id", None)
        return data

    @classmethod
    def from_mongo(cls, doc: Optional[dict]):
        if not doc:
            return None
        data = dict(doc)
        data["id"] = str(data.pop("_id")) if "_id" in data else data.get("id")
        return cls(**data)


# ------------------------------------------------------------------ compartilhados
class Place(BaseModel):
    address: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None


# ------------------------------------------------------------------ usuários / driver
class PublicUser(BaseModel):
    id: str
    name: str
    email: str
    phone: str = ""
    role: str = "client"
    blocked: bool = False
    created_at: Optional[datetime] = None


class VehiclePublic(BaseModel):
    id: Optional[str] = None
    plate: str = ""
    model: str = ""
    year: str = ""
    color: str = ""
    capacity: int = 4
    photo_url: str = ""


class DriverPublic(BaseModel):
    id: str
    user_id: str
    name: str
    phone: str = ""
    status: str = "pending"
    online: bool = False
    rating_avg: float = 0.0
    rating_count: int = 0
    photo_url: str = ""
    cnh_category: str = ""
    cpf: str = ""  # preenchido apenas em visualizações do próprio/admin
    lat: Optional[float] = None
    lng: Optional[float] = None
    vehicle: Optional[VehiclePublic] = None


class DriverRegisterIn(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=8, max_length=20)
    password: str = Field(min_length=8, max_length=128)
    cpf: str = Field(min_length=11, max_length=14)
    cnh_number: str = Field(min_length=5, max_length=15)
    cnh_category: str = Field(min_length=1, max_length=5)
    cnh_validity: str = Field(min_length=8, max_length=10)


class DriverProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    cpf: Optional[str] = None
    cnh_number: Optional[str] = None
    cnh_category: Optional[str] = None
    cnh_validity: Optional[str] = None
    cnh_photo_url: Optional[str] = None
    doc_url: Optional[str] = None
    plate: Optional[str] = None
    model: Optional[str] = None
    year: Optional[str] = None
    color: Optional[str] = None
    capacity: Optional[int] = Field(None, ge=1, le=20)
    vehicle_photo_url: Optional[str] = None


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None


# ------------------------------------------------------------------ corridas / viagens
class RideIn(BaseModel):
    service_type: Literal["transporte", "viagem", "motorista_particular"]
    origin: Place
    destination: Optional[Place] = None
    passengers: int = Field(1, ge=1, le=20)
    scheduled_at: Optional[datetime] = None
    round_trip: bool = False
    luggage: int = Field(0, ge=0, le=20)
    hours: Optional[float] = Field(None, gt=0, le=24)
    notes: str = Field("", max_length=500)
    payment_method: Literal["dinheiro", "pix"] = "dinheiro"
    coupon_code: str = Field("", max_length=30)
    vehicle_category: Literal["economica", "conforto", "van"] = "economica"


class EstimateOut(BaseModel):
    service_type: str
    price: float
    distance_km: float = 0.0
    duration_min: float = 0.0
    vehicle_category: str = "economica"
    night: bool = False
    holiday: bool = False
    breakdown: dict = {}


class RidePublic(BaseDocument):
    code: str = ""
    service_type: str
    status: str = "searching"
    city: str = "Belmonte"
    client_id: str = ""
    driver_id: Optional[str] = None
    origin: Place = Place()
    destination: Optional[Place] = None
    passengers: int = 1
    scheduled_at: Optional[datetime] = None
    round_trip: bool = False
    luggage: int = 0
    hours: Optional[float] = None
    notes: str = ""
    payment_method: str = "dinheiro"
    coupon_code: str = ""
    discount_pct: float = 0.0
    vehicle_category: str = "economica"
    distance_km: float = 0.0
    duration_min: float = 0.0
    price: float = 0.0
    cancel_fee: float = 0.0
    route: list = []
    client_name: str = ""
    driver: Optional[DriverPublic] = None
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    rated: bool = False


# ------------------------------------------------------------------ encomendas
class DeliveryIn(BaseModel):
    pickup: Place
    dropoff: Place
    recipient_name: str = Field(min_length=3, max_length=120)
    recipient_phone: str = Field(min_length=8, max_length=20)
    description: str = Field(min_length=3, max_length=300)
    size: Literal["P", "M", "G"] = "P"
    weight_kg: float = Field(0, ge=0, le=1000)
    declared_value: float = Field(0, ge=0, le=100000)
    photo_url: str = ""
    notes: str = Field("", max_length=500)
    payment_method: Literal["dinheiro", "pix"] = "dinheiro"


class DeliveryPublic(BaseDocument):
    code: str = ""
    status: str = "created"
    city: str = "Belmonte"
    client_id: str = ""
    driver_id: Optional[str] = None
    pickup: Place = Place()
    dropoff: Place = Place()
    recipient_name: str = ""
    recipient_phone: str = ""
    description: str = ""
    size: str = "P"
    weight_kg: float = 0
    declared_value: float = 0
    photo_url: str = ""
    notes: str = ""
    payment_method: str = "dinheiro"
    price: float = 0.0
    delivery_code: str = ""
    distance_km: float = 0.0
    client_name: str = ""
    driver: Optional[DriverPublic] = None
    created_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    rated: bool = False


# ------------------------------------------------------------------ turismo
class PackageIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=3, max_length=2000)
    category: Literal[
        "passeio_belmonte", "praias", "roteiro_historico", "mogiquicaba", "personalizado", "transfer"
    ]
    photo_url: str = ""
    duration_hours: float = Field(2, gt=0, le=24)
    price_per_person: float = Field(50, ge=0)
    max_people: int = Field(8, ge=1, le=50)
    departure_point: str = ""
    times: list[str] = []
    guide_name: str = ""


class BookingIn(BaseModel):
    package_id: str
    date: str = Field(min_length=8, max_length=10)
    time: str = Field(min_length=4, max_length=5)
    people: int = Field(1, ge=1, le=50)
    notes: str = Field("", max_length=500)
    payment_method: Literal["dinheiro", "pix"] = "dinheiro"


class PackagePublic(BaseDocument):
    title: str = ""
    description: str = ""
    category: str = "passeio_belmonte"
    photo_url: str = ""
    duration_hours: float = 2
    price_per_person: float = 0
    max_people: int = 8
    departure_point: str = ""
    times: list[str] = []
    guide_name: str = ""
    active: bool = True
    city: str = "Belmonte"
    created_at: Optional[datetime] = None


class BookingPublic(BaseDocument):
    code: str = ""
    package_id: str = ""
    package_title: str = ""
    client_id: str = ""
    date: str = ""
    time: str = ""
    people: int = 1
    total: float = 0
    payment_method: str = "dinheiro"
    status: str = "confirmed"
    notes: str = ""
    created_at: Optional[datetime] = None


# ------------------------------------------------------------------ avaliação / notificação / suporte
class RatingIn(BaseModel):
    service_type: Literal["ride", "delivery", "booking"]
    service_id: str
    stars: int = Field(ge=1, le=5)
    comment: str = Field("", max_length=500)


class SupportIn(BaseModel):
    subject: str = Field(min_length=3, max_length=120)
    message: str = Field(min_length=3, max_length=2000)


class CouponValidateIn(BaseModel):
    code: str = Field(min_length=3, max_length=30)
    service_type: str = "transporte"


# ------------------------------------------------------------------ motorista ações
class OnlineIn(BaseModel):
    online: bool


class LocationIn(BaseModel):
    lat: float
    lng: float


class DeliverIn(BaseModel):
    code: str = Field(min_length=4, max_length=6)


# ------------------------------------------------------------------ admin
class SettingsUpdate(BaseModel):
    whatsapp_support: Optional[str] = None
    pix_key: Optional[str] = None
    city: Optional[str] = None
    min_price: Optional[float] = None
    base_fare: Optional[float] = None
    price_per_km: Optional[float] = None
    price_per_min: Optional[float] = None
    waiting_fee_per_hour: Optional[float] = None
    trip_per_km: Optional[float] = None
    trip_min_price: Optional[float] = None
    hourly_rate: Optional[float] = None
    delivery_base: Optional[float] = None
    delivery_per_km: Optional[float] = None
    night_surcharge_pct: Optional[float] = None
    holiday_surcharge_pct: Optional[float] = None
    cancellation_fee: Optional[float] = None
    round_trip_multiplier: Optional[float] = None
    vehicle_multipliers: Optional[dict] = None
    commission_pct: Optional[dict] = None
    holidays: Optional[list[str]] = None


class DriverStatusIn(BaseModel):
    status: Literal["pending", "approved", "rejected", "blocked"]


class BlockIn(BaseModel):
    blocked: bool


class ResetPwIn(BaseModel):
    password: str = Field(min_length=8, max_length=128)


# ------------------------------------------------------------------ helpers de sistema
async def notify(db, user_id: str, title: str, body: str, ntype: str = "info", ref_id: str | None = None):
    await db.notifications.insert_one(
        {
            "user_id": str(user_id),
            "title": title,
            "body": body,
            "type": ntype,
            "ref_id": ref_id,
            "read": False,
            "created_at": now(),
        }
    )


async def audit(db, actor_id: str, actor_name: str, action: str, target: str, detail: str = ""):
    await db.audit_logs.insert_one(
        {
            "actor_id": str(actor_id),
            "actor_name": actor_name,
            "action": action,
            "target": target,
            "detail": detail,
            "created_at": now(),
        }
    )
