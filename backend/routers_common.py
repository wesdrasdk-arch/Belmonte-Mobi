"""Endpoints comuns: notificações, avaliações, upload/arquivos, suporte, cupons, geocode, estimativa, perfil."""
import io
import uuid
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

import geo
import pricing
import storage_helper
from auth import current_user, require_client, require_driver, user_public
from models import (
    CouponValidateIn,
    Place,
    ProfileUpdate,
    RatingIn,
    SupportIn,
    notify,
    now,
)
from routers_services import oid

router = APIRouter(prefix="/api", tags=["comuns"])


def _oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(400, "Identificador inválido")


# ------------------------------------------------------------------ perfil do cliente
@router.put("/me/profile")
async def update_profile(body: ProfileUpdate, request: Request, user: dict = Depends(current_user)):
    db = request.app.db
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if changes:
        await db.users.update_one({"_id": user["_id"]}, {"$set": changes})
    updated = await db.users.find_one({"_id": user["_id"]})
    return {"user": user_public(updated)}


# ------------------------------------------------------------------ notificações
@router.get("/notifications")
async def list_notifications(request: Request, user: dict = Depends(current_user)):
    db = request.app.db
    docs = await db.notifications.find({"user_id": str(user["_id"])}).sort("created_at", -1).limit(50).to_list(50)
    unread = await db.notifications.count_documents({"user_id": str(user["_id"]), "read": False})
    out = []
    for d in docs:
        d["id"] = str(d.pop("_id"))
        out.append(d)
    return {"items": out, "unread": unread}


@router.post("/notifications/{notification_id}/read")
async def read_notification(notification_id: str, request: Request, user: dict = Depends(current_user)):
    await request.app.db.notifications.update_one(
        {"_id": _oid(notification_id), "user_id": str(user["_id"])}, {"$set": {"read": True}}
    )
    return {"ok": True}


@router.post("/notifications/read-all")
async def read_all_notifications(request: Request, user: dict = Depends(current_user)):
    await request.app.db.notifications.update_many({"user_id": str(user["_id"]), "read": False}, {"$set": {"read": True}})
    return {"ok": True}


# ------------------------------------------------------------------ avaliações
@router.post("/ratings", status_code=201)
async def create_rating(body: RatingIn, request: Request, user: dict = Depends(require_client)):
    db = request.app.db
    collection = {"ride": "rides", "delivery": "deliveries", "booking": "bookings"}[body.service_type]
    doc = await db[collection].find_one({"_id": oid(body.service_id)})
    if not doc:
        raise HTTPException(404, "Serviço não encontrado")
    if doc.get("client_id") != str(user["_id"]):
        raise HTTPException(403, "Sem permissão")
    if doc.get("rated"):
        raise HTTPException(400, "Serviço já avaliado")
    if body.service_type != "booking" and not doc.get("driver_id"):
        raise HTTPException(400, "Sem motorista para avaliar")
    await db.ratings.insert_one(
        {
            "service_type": body.service_type,
            "service_id": str(doc["_id"]),
            "service_code": doc.get("code", ""),
            "client_id": doc["client_id"],
            "driver_id": doc.get("driver_id"),
            "direction": "client_to_driver",
            "stars": body.stars,
            "comment": body.comment,
            "created_at": now(),
        }
    )
    await db[collection].update_one({"_id": doc["_id"]}, {"$set": {"rated": True}})
    if doc.get("driver_id"):
        ddoc = await db.drivers.find_one({"user_id": doc["driver_id"]})
        if ddoc:
            count = ddoc.get("rating_count", 0)
            avg = ((ddoc.get("rating_avg", 0.0) * count) + body.stars) / (count + 1)
            await db.drivers.update_one({"_id": ddoc["_id"]}, {"$set": {"rating_avg": round(avg, 2)}, "$inc": {"rating_count": 1}})
        await notify(db, doc["driver_id"], "Nova avaliação", f"Você recebeu {body.stars} estrela(s).", "rating")
    return {"ok": True}


@router.post("/ratings/client", status_code=201)
async def rate_client(body: RatingIn, request: Request, user: dict = Depends(require_driver)):
    """Motorista avalia o cliente (comportamento)."""
    db = request.app.db
    collection = {"ride": "rides", "delivery": "deliveries"}[body.service_type]
    doc = await db[collection].find_one({"_id": oid(body.service_id)})
    if not doc:
        raise HTTPException(404, "Serviço não encontrado")
    if doc.get("driver_id") != str(user["_id"]):
        raise HTTPException(403, "Sem permissão")
    await db.ratings.insert_one(
        {
            "service_type": body.service_type,
            "service_id": str(doc["_id"]),
            "service_code": doc.get("code", ""),
            "client_id": doc.get("client_id"),
            "driver_id": str(user["_id"]),
            "direction": "driver_to_client",
            "stars": body.stars,
            "comment": body.comment,
            "created_at": now(),
        }
    )
    return {"ok": True}


@router.get("/drivers/{driver_id}/ratings")
async def driver_ratings(driver_id: str, request: Request):
    docs = await request.app.db.ratings.find(
        {"driver_id": driver_id, "direction": "client_to_driver"}
    ).sort("created_at", -1).limit(20).to_list(20)
    out = []
    for d in docs:
        d["id"] = str(d.pop("_id"))
        out.append(d)
    return out


# ------------------------------------------------------------------ arquivos (Object Storage)
@router.post("/upload")
async def upload(request: Request, file: UploadFile = File(...), visibility: str = Form("shared"), user: dict = Depends(current_user)):
    data = await file.read()
    if len(data) > 6 * 1024 * 1024:
        raise HTTPException(413, "Arquivo muito grande (máx. 6 MB)")
    content_type = file.content_type or "application/octet-stream"
    ext = (file.filename or "arquivo.jpg").rsplit(".", 1)[-1].lower()[:5] or "jpg"
    path = f"{storage_helper.APP_NAME}/uploads/{user['_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await run_in_threadpool(storage_helper.put_object, path, data, content_type)
    except Exception:
        raise HTTPException(502, "Falha ao enviar o arquivo. Tente novamente.")
    await request.app.db.uploads.insert_one(
        {"path": path, "owner_id": str(user["_id"]), "name": file.filename, "visibility": visibility, "created_at": now()}
    )
    return {"url": f"/api/files/{path}", "path": path}


async def _user_from_token(db, token: str):
    from auth import ALGORITHM, JWT_ISSUER, JWT_SECRET
    import jwt as _jwt

    try:
        payload = _jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM], issuer=JWT_ISSUER)
        return await db.users.find_one({"_id": ObjectId(payload["sub"])})
    except Exception:
        return None


@router.get("/files/{path:path}")
async def get_file(path: str, request: Request, token: Optional[str] = None):
    """Serve arquivos autenticados: header Bearer (nativo) ou ?token= (web)."""
    db = request.app.db
    from auth import bearer

    viewer = None
    creds = await bearer(request)
    if creds:
        try:
            viewer = await current_user(request, creds)
        except HTTPException:
            viewer = None
    if not viewer and token:
        viewer = await _user_from_token(db, token)
    if not viewer:
        raise HTTPException(401, "Não autenticado")
    meta = await db.uploads.find_one({"path": path})
    if meta and meta.get("visibility") == "private":
        if viewer.get("role") != "admin" and meta.get("owner_id") != str(viewer["_id"]):
            raise HTTPException(403, "Sem acesso a este arquivo")
    try:
        data, content_type = await run_in_threadpool(storage_helper.get_object, path)
    except Exception:
        raise HTTPException(404, "Arquivo não encontrado")
    return StreamingResponse(io.BytesIO(data), media_type=content_type)


# ------------------------------------------------------------------ suporte
@router.post("/support", status_code=201)
async def create_ticket(body: SupportIn, request: Request, user: dict = Depends(current_user)):
    db = request.app.db
    doc = {
        "user_id": str(user["_id"]),
        "kind": "support",
        "subject": body.subject,
        "message": body.message,
        "user_name": user.get("name", ""),
        "status": "open",
        "created_at": now(),
    }
    await db.support_tickets.insert_one(doc)
    return {"ok": True, "message": "Mensagem enviada! Também fale conosco pelo WhatsApp para resposta rápida."}


@router.get("/support/mine")
async def my_tickets(request: Request, user: dict = Depends(current_user)):
    docs = await request.app.db.support_tickets.find({"user_id": str(user["_id"])}).sort("created_at", -1).limit(30).to_list(30)
    out = []
    for d in docs:
        d["id"] = str(d.pop("_id"))
        out.append(d)
    return out


# ------------------------------------------------------------------ cupons
@router.post("/coupons/validate")
async def validate_coupon(body: CouponValidateIn, request: Request, user: dict = Depends(require_client)):
    doc = await request.app.db.coupons.find_one({"code": body.code.strip().upper(), "active": True})
    if not doc:
        raise HTTPException(400, "Cupom inválido ou expirado")
    return {"code": doc["code"], "discount_pct": float(doc.get("discount_pct", 0))}


# ------------------------------------------------------------------ settings públicas
@router.get("/settings/public")
async def public_settings(request: Request):
    s = await pricing.get_settings(request.app.db)
    return {
        "city": s.get("city", "Belmonte"),
        "whatsapp_support": s.get("whatsapp_support", ""),
        "pix_key": s.get("pix_key", ""),
        "vehicle_multipliers": s.get("vehicle_multipliers", {}),
        "cancellation_fee": s.get("cancellation_fee", 0),
    }


# ------------------------------------------------------------------ geocode + estimativa
class EstimateIn(BaseModel):
    service_type: str
    origin: Place
    destination: Optional[Place] = None
    vehicle_category: str = "economica"
    hours: Optional[float] = None
    size: str = "P"
    scheduled_at: Optional[str] = None
    round_trip: bool = False


@router.get("/geocode")
async def geocode_route(q: str, request: Request, user: dict = Depends(current_user)):
    if len(q.strip()) < 3:
        return []
    return await geo.geocode(request.app.db, q)


@router.get("/reverse")
async def reverse_route(lat: float, lng: float, request: Request, user: dict = Depends(current_user)):
    return {"label": await geo.reverse_geocode(lat, lng)}


@router.post("/estimate", response_model=pricing.EstimateOut)
async def estimate_route(body: EstimateIn, request: Request, user: dict = Depends(current_user)):
    from routers_services import build_estimate

    when = now()
    if body.scheduled_at:
        from datetime import datetime as _dt

        try:
            when = _dt.fromisoformat(body.scheduled_at.replace("Z", "+00:00"))
        except ValueError:
            pass
    est, _ = await build_estimate(
        request.app.db,
        body.service_type,
        body.origin.model_dump(),
        body.destination.model_dump() if body.destination else None,
        body.vehicle_category,
        body.hours,
        body.size,
        when,
        body.round_trip,
    )
    return est
