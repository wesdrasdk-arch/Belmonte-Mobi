"""Serviços: corridas/viagens/motorista particular + encomendas + fluxo do motorista."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Request
from pymongo import ReturnDocument

import pricing
from auth import (
    driver_public,
    get_approved_driver,
    require_client,
    require_driver,
)
from geo import route_between
from models import (
    DeliveryIn,
    DeliveryPublic,
    LocationIn,
    OnlineIn,
    RideIn,
    RidePublic,
    audit,
    notify,
    now,
)

router = APIRouter(prefix="/api", tags=["servicos"])

CODE_PREFIXES = {"transporte": "T", "viagem": "V", "motorista_particular": "M", "encomenda": "E", "turismo": "S"}
ACTIVE_RIDE = ["searching", "scheduled", "accepted", "heading", "arrived", "in_progress"]
ACTIVE_DELIVERY = ["created", "assigned", "collected", "in_transit"]


async def next_seq(db, key: str) -> int:
    doc = await db.counters.find_one_and_update(
        {"_id": key}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER
    )
    return doc["seq"]


async def new_code(db, kind: str) -> str:
    return f"BM-{CODE_PREFIXES[kind]}-{await next_seq(db, kind):05d}"


def oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(400, "Identificador inválido")


async def attach_parties(db, doc: dict, model) -> None:
    """Preenche driver (com veículo) e dados do cliente em Ride/Delivery public."""
    if doc.get("driver_id"):
        ddoc = await db.drivers.find_one({"user_id": doc["driver_id"]})
        if ddoc:
            vdoc = await db.vehicles.find_one({"driver_id": str(ddoc["_id"])})
            model.driver = driver_public(ddoc, vdoc)
    client = await db.users.find_one({"_id": oid(doc["client_id"])})
    if client:
        model.client_name = client.get("name", "")


async def ride_public(db, doc: dict) -> RidePublic:
    r = RidePublic.from_mongo(doc)
    await attach_parties(db, doc, r)
    return r


async def delivery_public(db, doc: dict, hide_code: bool = False) -> DeliveryPublic:
    d = DeliveryPublic.from_mongo(doc)
    await attach_parties(db, doc, d)
    if hide_code:
        d.delivery_code = ""
    return d


async def ensure_no_active_job(db, driver_user_id: str) -> None:
    busy_ride = await db.rides.find_one({"driver_id": driver_user_id, "status": {"$in": ["accepted", "heading", "arrived", "in_progress"]}})
    busy_delivery = await db.deliveries.find_one({"driver_id": driver_user_id, "status": {"$in": ["assigned", "collected", "in_transit"]}})
    if busy_ride or busy_delivery:
        raise HTTPException(409, "Finalize o serviço atual antes de aceitar outro")


async def finalize_service(db, service_type: str, doc: dict) -> dict:
    """Cria pagamento + comissão e credita o motorista. Comissão % configurável."""
    s = await pricing.get_settings(db)
    pct = float(s.get("commission_pct", {}).get(service_type, 10.0))
    amount = round(float(doc.get("price", 0)) * (1 - float(doc.get("discount_pct", 0)) / 100.0), 2)
    commission_amount = round(amount * pct / 100.0, 2)
    driver_amount = round(amount - commission_amount, 2)
    payment = {
        "service_type": service_type,
        "service_id": str(doc["_id"]),
        "service_code": doc.get("code", ""),
        "client_id": doc.get("client_id", ""),
        "driver_id": doc.get("driver_id"),
        "amount": amount,
        "method": doc.get("payment_method", "dinheiro"),
        "status": "pago" if doc.get("payment_method") == "dinheiro" else "pendente",
        "commission_pct": pct,
        "commission_amount": commission_amount,
        "driver_amount": driver_amount,
        "created_at": now(),
    }
    await db.payments.insert_one(payment)
    await db.commissions.insert_one(
        {
            "payment_id": str(payment["_id"]) if payment.get("_id") else None,
            "service_type": service_type,
            "service_code": doc.get("code", ""),
            "total": amount,
            "platform_pct": pct,
            "platform_amount": commission_amount,
            "driver_amount": driver_amount,
            "created_at": now(),
        }
    )
    if doc.get("driver_id"):
        await db.drivers.update_one({"user_id": doc["driver_id"]}, {"$inc": {"earnings_total": driver_amount}})
    return {"amount": amount, "commission_amount": commission_amount, "driver_amount": driver_amount}


# ================================================================== ESTIMATIVA interna
async def build_estimate(db, service_type: str, origin: dict, destination: Optional[dict],
                         vehicle_category: str = "economica", hours: Optional[float] = None,
                         size: str = "P", when=None, round_trip: bool = False):
    is_route_service = service_type in ("transporte", "viagem", "encomenda")
    if is_route_service and not (destination and destination.get("lat")):
        raise HTTPException(400, "Informe origem e destino válidos")
    route = await route_between(origin, destination or {}) if is_route_service else {"distance_km": 0.0, "duration_min": 0.0, "geometry": []}
    s = await pricing.get_settings(db)
    est = pricing.compute_price(s, service_type, route["distance_km"], route["duration_min"], vehicle_category, hours, size, when, round_trip)
    return est, route["geometry"]


# ================================================================== CORRIDAS (cliente)
@router.post("/rides", response_model=RidePublic, status_code=201)
async def create_ride(body: RideIn, request: Request, user: dict = Depends(require_client)):
    db = request.app.db
    when = body.scheduled_at or now()
    est, geometry = await build_estimate(db, body.service_type, body.origin.model_dump(), body.destination.model_dump() if body.destination else None, body.vehicle_category, body.hours, when=when, round_trip=body.round_trip)

    discount_pct = 0.0
    coupon = body.coupon_code.strip().upper()
    if coupon:
        cdoc = await db.coupons.find_one({"code": coupon, "active": True})
        if not cdoc:
            raise HTTPException(400, "Cupom inválido ou expirado")
        discount_pct = float(cdoc.get("discount_pct", 0))

    status = "scheduled" if body.scheduled_at else "searching"
    doc = body.model_dump()
    doc.update(
        {
            "code": await new_code(db, body.service_type),
            "status": status,
            "city": "Belmonte",
            "client_id": str(user["_id"]),
            "driver_id": None,
            "distance_km": est.distance_km,
            "duration_min": est.duration_min,
            "price": est.price,
            "discount_pct": discount_pct,
            "route": geometry,
            "cancel_fee": 0.0,
            "rated": False,
            "created_at": now(),
        }
    )
    result = await db.rides.insert_one(doc)
    doc["_id"] = result.inserted_id
    if status == "scheduled":
        await notify(db, str(user["_id"]), "Agendamento confirmado",
                     f"Serviço {doc['code']} agendado. Buscaremos um motorista para você.", "ride", doc["code"])
        # avisa motoristas aprovados sobre novo agendamento
        approved = await db.drivers.find({"status": "approved"}).to_list(200)
        if approved:
            await db.notifications.insert_many(
                [
                    {
                        "user_id": str(d["user_id"]),
                        "title": "Nova viagem agendada",
                        "body": f"{body.service_type.replace('_', ' ').title()} agendado para {body.scheduled_at.strftime('%d/%m %H:%M')}.",
                        "type": "ride",
                        "ref_id": doc["code"],
                        "read": False,
                        "created_at": now(),
                    }
                    for d in approved
                ]
            )
    return await ride_public(db, doc)


@router.get("/rides/mine", response_model=list[RidePublic])
async def my_rides(request: Request, user: dict = Depends(require_client)):
    docs = await request.app.db.rides.find({"client_id": str(user["_id"])}).sort("created_at", -1).limit(50).to_list(50)
    return [await ride_public(request.app.db, d) for d in docs]


@router.get("/rides/active", response_model=Optional[RidePublic])
async def active_ride(request: Request, user: dict = Depends(require_client)):
    doc = await request.app.db.rides.find_one(
        {"client_id": str(user["_id"]), "status": {"$in": ACTIVE_RIDE}}, sort=[("created_at", -1)]
    )
    return await ride_public(request.app.db, doc) if doc else None


@router.get("/rides/{ride_id}", response_model=RidePublic)
async def get_ride(ride_id: str, request: Request, user: dict = Depends(require_client)):
    doc = await request.app.db.rides.find_one({"_id": oid(ride_id)})
    if not doc:
        raise HTTPException(404, "Serviço não encontrado")
    uid = str(user["_id"])
    if user["role"] != "admin" and doc["client_id"] != uid and doc.get("driver_id") != uid:
        raise HTTPException(403, "Sem acesso a este serviço")
    return await ride_public(request.app.db, doc)


@router.post("/rides/{ride_id}/cancel", response_model=RidePublic)
async def cancel_ride(ride_id: str, request: Request, user: dict = Depends(require_client)):
    db = request.app.db
    doc = await db.rides.find_one({"_id": oid(ride_id)})
    if not doc or doc["client_id"] != str(user["_id"]):
        raise HTTPException(404, "Serviço não encontrado")
    if doc["status"] not in ["searching", "scheduled", "accepted", "heading", "arrived"]:
        raise HTTPException(400, "Este serviço não pode mais ser cancelado")
    s = await pricing.get_settings(db)
    fee = float(s["cancellation_fee"]) if doc["status"] in ("accepted", "heading", "arrived") else 0.0
    updated = await db.rides.find_one_and_update(
        {"_id": doc["_id"]},
        {"$set": {"status": "cancelled", "cancel_fee": fee, "cancelled_at": now()}},
        return_document=ReturnDocument.AFTER,
    )
    if fee > 0 and doc.get("driver_id"):
        await db.payments.insert_one(
            {
                "service_type": doc["service_type"],
                "service_id": str(doc["_id"]),
                "service_code": doc.get("code", ""),
                "client_id": doc["client_id"],
                "driver_id": doc.get("driver_id"),
                "amount": fee,
                "method": doc.get("payment_method", "dinheiro"),
                "status": "taxa_cancelamento",
                "commission_pct": 100.0,
                "commission_amount": fee,
                "driver_amount": 0.0,
                "created_at": now(),
            }
        )
    if doc.get("driver_id"):
        await notify(db, doc["driver_id"], "Viagem cancelada", f"O cliente cancelou o serviço {doc['code']}.", "ride", doc["code"])
    await notify(db, str(user["_id"]), "Serviço cancelado", f"O serviço {doc['code']} foi cancelado.", "ride", doc["code"])
    await audit(db, str(user["_id"]), user.get("name", ""), "cancelou_servico", doc["code"], f"taxa={fee}")
    return await ride_public(db, updated)


# ================================================================== ENCOMENDAS (cliente)
@router.post("/deliveries", response_model=DeliveryPublic, status_code=201)
async def create_delivery(body: DeliveryIn, request: Request, user: dict = Depends(require_client)):
    db = request.app.db
    est, _ = await build_estimate(db, "encomenda", body.pickup.model_dump(), body.dropoff.model_dump(), size=body.size)
    import secrets as _secrets

    doc = DeliveryPublic(
        pickup=body.pickup,
        dropoff=body.dropoff,
        recipient_name=body.recipient_name,
        recipient_phone=body.recipient_phone,
        description=body.description,
        size=body.size,
        weight_kg=body.weight_kg,
        declared_value=body.declared_value,
        photo_url=body.photo_url,
        notes=body.notes,
        payment_method=body.payment_method,
        distance_km=est.distance_km,
        price=est.price,
        delivery_code=str(_secrets.randbelow(9000) + 1000),
        code=await new_code(db, "encomenda"),
        client_id=str(user["_id"]),
        status="created",
        city="Belmonte",
        created_at=now(),
    ).to_mongo()
    result = await db.deliveries.insert_one(doc)
    doc["_id"] = result.inserted_id
    await notify(db, str(user["_id"]), "Encomenda solicitada",
                 f"Código de rastreamento {doc['code']}. Aguardando motorista.", "delivery", doc["code"])
    return await delivery_public(db, doc)


@router.get("/deliveries/mine", response_model=list[DeliveryPublic])
async def my_deliveries(request: Request, user: dict = Depends(require_client)):
    docs = await request.app.db.deliveries.find({"client_id": str(user["_id"])}).sort("created_at", -1).limit(50).to_list(50)
    return [await delivery_public(request.app.db, d) for d in docs]


@router.get("/deliveries/active", response_model=Optional[DeliveryPublic])
async def active_delivery(request: Request, user: dict = Depends(require_client)):
    doc = await request.app.db.deliveries.find_one(
        {"client_id": str(user["_id"]), "status": {"$in": ACTIVE_DELIVERY}}, sort=[("created_at", -1)]
    )
    return await delivery_public(request.app.db, doc) if doc else None


@router.get("/deliveries/track/{code}", response_model=DeliveryPublic)
async def track_delivery(code: str, request: Request):
    """Rastreamento público por código (LGPD: apenas dados não sensíveis)."""
    doc = await request.app.db.deliveries.find_one({"code": code.upper()})
    if not doc:
        raise HTTPException(404, "Código de rastreamento não encontrado")
    pub = DeliveryPublic.from_mongo(doc)
    pub.client_id = ""
    pub.client_name = ""
    pub.recipient_phone = ""
    pub.delivery_code = ""
    if doc.get("driver_id"):
        ddoc = await request.app.db.drivers.find_one({"user_id": doc["driver_id"]})
        if ddoc:
            pub.driver = driver_public(ddoc)
    return pub


@router.post("/deliveries/{delivery_id}/cancel", response_model=DeliveryPublic)
async def cancel_delivery(delivery_id: str, request: Request, user: dict = Depends(require_client)):
    db = request.app.db
    doc = await db.deliveries.find_one({"_id": oid(delivery_id)})
    if not doc or doc["client_id"] != str(user["_id"]):
        raise HTTPException(404, "Encomenda não encontrada")
    if doc["status"] not in ("created", "assigned"):
        raise HTTPException(400, "A encomenda já foi coletada e não pode ser cancelada")
    updated = await db.deliveries.find_one_and_update(
        {"_id": doc["_id"]}, {"$set": {"status": "cancelled"}}, return_document=ReturnDocument.AFTER
    )
    if doc.get("driver_id"):
        await notify(db, doc["driver_id"], "Encomenda cancelada", f"O cliente cancelou a encomenda {doc['code']}.", "delivery", doc["code"])
    return await delivery_public(db, updated)


# ================================================================== MOTORISTA
@router.get("/driver/profile")
async def driver_profile(request: Request, user: dict = Depends(require_driver)):
    db = request.app.db
    ddoc = await db.drivers.find_one({"user_id": str(user["_id"])})
    if not ddoc:
        raise HTTPException(404, "Perfil não encontrado")
    vdoc = await db.vehicles.find_one({"driver_id": str(ddoc["_id"])})
    return {"user": {"id": str(user["_id"]), "name": user.get("name"), "email": user.get("email"), "phone": user.get("phone")},
            "driver": driver_public(ddoc, vdoc, with_cpf=True),
            "cnh_number": ddoc.get("cnh_number", ""), "cnh_validity": ddoc.get("cnh_validity", ""),
            "cnh_photo_url": ddoc.get("cnh_photo_url", ""), "doc_url": ddoc.get("doc_url", "")}


@router.put("/driver/profile")
async def driver_profile_update(body: dict, request: Request, user: dict = Depends(require_driver)):
    db = request.app.db
    ddoc = await db.drivers.find_one({"user_id": str(user["_id"])})
    if not ddoc:
        raise HTTPException(404, "Perfil não encontrado")
    driver_fields = ["name", "phone", "cpf", "cnh_number", "cnh_category", "cnh_validity", "cnh_photo_url", "doc_url"]
    vehicle_fields = ["plate", "model", "year", "color", "capacity", "vehicle_photo_url"]
    dset = {k: body[k] for k in driver_fields if k in body and body[k] is not None}
    vset = {k: body[k] for k in vehicle_fields if k in body and body[k] is not None}
    if "vehicle_photo_url" in vset:
        vset["photo_url"] = vset.pop("vehicle_photo_url")
    docs_changed = any(k in dset for k in ("cnh_photo_url", "doc_url", "cnh_number", "cnh_validity"))
    if docs_changed and ddoc.get("status") in ("approved", "rejected"):
        dset["status"] = "pending"
        await notify(db, str(user["_id"]), "Documentos enviados", "Seus documentos serão reanalisados pelo administrador.", "driver")
        for admin in await db.users.find({"role": "admin"}).to_list(10):
            await notify(db, str(admin["_id"]), "Motorista reenviou documentos", f"{ddoc.get('name')} atualizou os documentos.", "driver")
    if dset:
        await db.drivers.update_one({"_id": ddoc["_id"]}, {"$set": dset})
    if vset and vset:
        await db.vehicles.update_one({"driver_id": str(ddoc["_id"])}, {"$set": vset})
    return await driver_profile(request, user)


@router.post("/driver/online")
async def set_online(body: OnlineIn, request: Request, user: dict = Depends(require_driver)):
    db = request.app.db
    ddoc = await get_approved_driver(db, user)
    status = ddoc.get("status")
    if status != "approved":
        msg = {
            "pending": "Cadastro em análise pelo administrador.",
            "rejected": "Cadastro reprovado. Atualize seus documentos no perfil.",
            "blocked": "Conta bloqueada. Fale com o suporte.",
        }.get(status, "Cadastro não aprovado.")
        raise HTTPException(403, msg)
    await db.drivers.update_one({"_id": ddoc["_id"]}, {"$set": {"online": body.online}})
    return {"online": body.online}


@router.post("/driver/location")
async def driver_location(body: LocationIn, request: Request, user: dict = Depends(require_driver)):
    await request.app.db.drivers.update_one(
        {"user_id": str(user["_id"])}, {"$set": {"lat": body.lat, "lng": body.lng, "loc_updated_at": now()}}
    )
    return {"ok": True}


@router.get("/driver/available")
async def available_jobs(request: Request, user: dict = Depends(require_driver)):
    db = request.app.db
    ddoc = await db.drivers.find_one({"user_id": str(user["_id"])})
    if not ddoc or ddoc.get("status") != "approved":
        return {"rides": [], "deliveries": []}
    uid = str(user["_id"])
    rides = await db.rides.find({"status": {"$in": ["searching", "scheduled"]}, "driver_id": None, "declined_by": {"$ne": uid}}).sort("created_at", -1).limit(20).to_list(20)
    deliveries = await db.deliveries.find({"status": "created", "driver_id": None, "declined_by": {"$ne": uid}}).sort("created_at", -1).limit(20).to_list(20)
    return {
        "rides": [await ride_public(db, d) for d in rides],
        "deliveries": [await delivery_public(db, d, hide_code=True) for d in deliveries],
    }


@router.post("/driver/{kind}/{item_id}/decline")
async def decline_job(kind: str, item_id: str, request: Request, user: dict = Depends(require_driver)):
    """RECUSAR: oculta a solicitação para este motorista (persistente)."""
    if kind not in ("rides", "deliveries"):
        raise HTTPException(400, "Tipo inválido")
    await request.app.db[kind].update_one({"_id": oid(item_id), "driver_id": None}, {"$addToSet": {"declined_by": str(user["_id"])}})
    return {"ok": True}


@router.get("/driver/jobs")
async def driver_jobs(request: Request, user: dict = Depends(require_driver)):
    db = request.app.db
    uid = str(user["_id"])
    rides = await db.rides.find({"driver_id": uid}).sort("created_at", -1).limit(50).to_list(50)
    deliveries = await db.deliveries.find({"driver_id": uid}).sort("created_at", -1).limit(50).to_list(50)
    active_ride = next((d for d in rides if d["status"] in ACTIVE_RIDE), None)
    active_delivery = next((d for d in deliveries if d["status"] in ACTIVE_DELIVERY), None)
    return {
        "active_ride": await ride_public(db, active_ride) if active_ride else None,
        "active_delivery": await delivery_public(db, active_delivery, hide_code=True) if active_delivery else None,
        "rides": [await ride_public(db, d) for d in rides if d is not active_ride],
        "deliveries": [await delivery_public(db, d, hide_code=True) for d in deliveries if d is not active_delivery],
    }


@router.get("/driver/summary")
async def driver_summary(request: Request, user: dict = Depends(require_driver)):
    db = request.app.db
    uid = str(user["_id"])
    ddoc = await db.drivers.find_one({"user_id": uid})
    bahia = timezone(timedelta(hours=-3))
    today = now().astimezone(bahia).date()
    start = datetime(today.year, today.month, today.day, tzinfo=bahia).astimezone(timezone.utc)
    pipeline = [
        {"$match": {"driver_id": uid, "created_at": {"$gte": start}, "status": {"$ne": "taxa_cancelamento"}}},
        {"$group": {"_id": None, "amount": {"$sum": "$driver_amount"}, "count": {"$sum": 1}}},
    ]
    rows = await db.payments.aggregate(pipeline).to_list(1)
    return {
        "today_earnings": round(rows[0]["amount"], 2) if rows else 0.0,
        "today_services": rows[0]["count"] if rows else 0,
        "total_earnings": round((ddoc or {}).get("earnings_total", 0.0), 2),
        "rating_avg": round((ddoc or {}).get("rating_avg", 0.0), 2),
        "rating_count": (ddoc or {}).get("rating_count", 0),
        "online": (ddoc or {}).get("online", False),
        "status": (ddoc or {}).get("status", "pending"),
    }


# --- ações de corrida do motorista ---
async def _get_ride_for_driver(db, ride_id: str, driver: dict) -> dict:
    doc = await db.rides.find_one({"_id": oid(ride_id)})
    if not doc:
        raise HTTPException(404, "Serviço não encontrado")
    if doc.get("driver_id") and doc["driver_id"] != str(driver["user_id"]):
        raise HTTPException(403, "Serviço já atribuído a outro motorista")
    return doc


@router.post("/driver/rides/{ride_id}/accept", response_model=RidePublic)
async def accept_ride(ride_id: str, request: Request, user: dict = Depends(require_driver)):
    db = request.app.db
    driver = await get_approved_driver(db, user)
    doc = await db.rides.find_one({"_id": oid(ride_id)})
    if not doc or doc["status"] not in ("searching", "scheduled") or doc.get("driver_id"):
        raise HTTPException(400, "Esta solicitação não está mais disponível")
    await ensure_no_active_job(db, str(driver["user_id"]))
    updated = await db.rides.find_one_and_update(
        {"_id": doc["_id"], "driver_id": None},
        {"$set": {"driver_id": str(driver["user_id"]), "status": "accepted", "accepted_at": now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:  # outro motorista aceitou primeiro
        raise HTTPException(409, "Outro motorista aceitou primeiro")
    await notify(db, doc["client_id"], "Motorista encontrado", f"{driver['name']} aceitou o serviço {doc['code']}.", "ride", doc["code"])
    await audit(db, str(user["_id"]), user.get("name", ""), "aceitou_servico", doc["code"])
    return await ride_public(db, updated)


async def _transition(db, doc: dict, frm: list, to: str, client_title: str, client_body: str, extra: dict | None = None):
    if doc["status"] not in frm:
        raise HTTPException(400, f"Status atual não permite esta ação ({doc['status']} → {to})")
    updated = await db.rides.find_one_and_update(
        {"_id": doc["_id"]}, {"$set": {"status": to, **(extra or {})}}, return_document=ReturnDocument.AFTER
    )
    await notify(db, doc["client_id"], client_title, client_body, "ride", doc["code"])
    return updated


@router.post("/driver/rides/{ride_id}/heading", response_model=RidePublic)
async def ride_heading(ride_id: str, request: Request, user: dict = Depends(require_driver)):
    db = request.app.db
    driver = await get_approved_driver(db, user)
    doc = await _get_ride_for_driver(db, ride_id, driver)
    updated = await _transition(db, doc, ["accepted"], "heading", "Motorista a caminho",
                                f"{driver['name']} está a caminho do local de embarque.")
    return await ride_public(db, updated)


@router.post("/driver/rides/{ride_id}/arrive", response_model=RidePublic)
async def ride_arrive(ride_id: str, request: Request, user: dict = Depends(require_driver)):
    db = request.app.db
    driver = await get_approved_driver(db, user)
    doc = await _get_ride_for_driver(db, ride_id, driver)
    updated = await _transition(db, doc, ["heading"], "arrived", "Motorista chegou", "O motorista chegou ao local de embarque.")
    return await ride_public(db, updated)


@router.post("/driver/rides/{ride_id}/start", response_model=RidePublic)
async def ride_start(ride_id: str, request: Request, user: dict = Depends(require_driver)):
    db = request.app.db
    driver = await get_approved_driver(db, user)
    doc = await _get_ride_for_driver(db, ride_id, driver)
    updated = await _transition(db, doc, ["arrived"], "in_progress", "Viagem iniciada", "Boa viagem! Acompanhe pelo app.")
    return await ride_public(db, updated)


@router.post("/driver/rides/{ride_id}/complete", response_model=RidePublic)
async def ride_complete(ride_id: str, request: Request, user: dict = Depends(require_driver)):
    db = request.app.db
    driver = await get_approved_driver(db, user)
    doc = await _get_ride_for_driver(db, ride_id, driver)
    updated = await _transition(db, doc, ["in_progress"], "completed", "Viagem concluída",
                                "Obrigado por viajar com a BELMONTE MOBI. Avalie seu motorista!", extra={"completed_at": now()})
    await finalize_service(db, doc["service_type"], doc)
    return await ride_public(db, updated)


# --- ações de encomenda do motorista ---
async def _get_delivery_for_driver(db, delivery_id: str, driver: dict) -> dict:
    doc = await db.deliveries.find_one({"_id": oid(delivery_id)})
    if not doc:
        raise HTTPException(404, "Encomenda não encontrada")
    if doc.get("driver_id") and doc["driver_id"] != str(driver["user_id"]):
        raise HTTPException(403, "Encomenda atribuída a outro motorista")
    return doc


@router.post("/driver/deliveries/{delivery_id}/accept", response_model=DeliveryPublic)
async def accept_delivery(delivery_id: str, request: Request, user: dict = Depends(require_driver)):
    db = request.app.db
    driver = await get_approved_driver(db, user)
    doc = await db.deliveries.find_one({"_id": oid(delivery_id)})
    if not doc or doc["status"] != "created" or doc.get("driver_id"):
        raise HTTPException(400, "Esta encomenda não está mais disponível")
    await ensure_no_active_job(db, str(driver["user_id"]))
    updated = await db.deliveries.find_one_and_update(
        {"_id": doc["_id"], "driver_id": None},
        {"$set": {"driver_id": str(driver["user_id"]), "status": "assigned", "accepted_at": now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(409, "Outro motorista aceitou primeiro")
    await notify(db, doc["client_id"], "Motorista designado", f"{driver['name']} vai coletar a encomenda {doc['code']}.", "delivery", doc["code"])
    return await delivery_public(db, updated, hide_code=True)


@router.post("/driver/deliveries/{delivery_id}/collect", response_model=DeliveryPublic)
async def collect_delivery(delivery_id: str, request: Request, user: dict = Depends(require_driver)):
    db = request.app.db
    driver = await get_approved_driver(db, user)
    doc = await _get_delivery_for_driver(db, delivery_id, driver)
    if doc["status"] != "assigned":
        raise HTTPException(400, "Ação não permitida neste status")
    updated = await db.deliveries.find_one_and_update(
        {"_id": doc["_id"]}, {"$set": {"status": "collected", "collected_at": now()}}, return_document=ReturnDocument.AFTER
    )
    await notify(db, doc["client_id"], "Encomenda coletada", f"A encomenda {doc['code']} foi coletada pelo motorista.", "delivery", doc["code"])
    return await delivery_public(db, updated, hide_code=True)


@router.post("/driver/deliveries/{delivery_id}/transit", response_model=DeliveryPublic)
async def transit_delivery(delivery_id: str, request: Request, user: dict = Depends(require_driver)):
    db = request.app.db
    driver = await get_approved_driver(db, user)
    doc = await _get_delivery_for_driver(db, delivery_id, driver)
    if doc["status"] != "collected":
        raise HTTPException(400, "Ação não permitida neste status")
    updated = await db.deliveries.find_one_and_update(
        {"_id": doc["_id"]}, {"$set": {"status": "in_transit"}}, return_document=ReturnDocument.AFTER
    )
    await notify(db, doc["client_id"], "Encomenda em transporte", f"A encomenda {doc['code']} está a caminho do destino.", "delivery", doc["code"])
    return await delivery_public(db, updated, hide_code=True)


@router.post("/driver/deliveries/{delivery_id}/deliver", response_model=DeliveryPublic)
async def deliver_delivery(delivery_id: str, body: dict, request: Request, user: dict = Depends(require_driver)):
    db = request.app.db
    driver = await get_approved_driver(db, user)
    doc = await _get_delivery_for_driver(db, delivery_id, driver)
    if doc["status"] != "in_transit":
        raise HTTPException(400, "Ação não permitida neste status")
    code = str(body.get("code", "")).strip()
    if code != doc.get("delivery_code"):
        raise HTTPException(400, "Código de confirmação incorreto")
    updated = await db.deliveries.find_one_and_update(
        {"_id": doc["_id"]}, {"$set": {"status": "delivered", "delivered_at": now()}}, return_document=ReturnDocument.AFTER
    )
    await finalize_service(db, "encomenda", doc)
    await notify(db, doc["client_id"], "Encomenda entregue", f"A encomenda {doc['code']} foi entregue com sucesso!", "delivery", doc["code"])
    return await delivery_public(db, updated, hide_code=True)
