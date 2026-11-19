"""Painel administrativo: dashboard, usuários, motoristas, serviços, preços, relatórios."""
from datetime import timedelta
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Request

import pricing
from auth import driver_public, hash_password, require_admin
from models import (
    BlockIn,
    DriverStatusIn,
    PackageIn,
    PackagePublic,
    ResetPwIn,
    SettingsUpdate,
    audit,
    notify,
    now,
)
from routers_services import oid

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(400, "Identificador inválido")


@router.get("/dashboard")
async def dashboard(request: Request, user: dict = Depends(require_admin)):
    db = request.app.db
    day_ago = now() - timedelta(days=1)
    revenue_rows = await db.payments.aggregate(
        [{"$group": {"_id": None, "total": {"$sum": "$amount"}, "commission": {"$sum": "$commission_amount"}, "count": {"$sum": 1}}}]
    ).to_list(1)
    today_rows = await db.payments.aggregate(
        [{"$match": {"created_at": {"$gte": day_ago}}},
         {"$group": {"_id": None, "total": {"$sum": "$amount"}, "commission": {"$sum": "$commission_amount"}}}]
    ).to_list(1)
    return {
        "clients": await db.users.count_documents({"role": "client"}),
        "drivers_total": await db.drivers.count_documents({}),
        "drivers_approved": await db.drivers.count_documents({"status": "approved"}),
        "drivers_pending": await db.drivers.count_documents({"status": "pending"}),
        "drivers_online": await db.drivers.count_documents({"status": "approved", "online": True}),
        "rides_total": await db.rides.count_documents({}),
        "rides_completed": await db.rides.count_documents({"status": "completed"}),
        "rides_cancelled": await db.rides.count_documents({"status": "cancelled"}),
        "rides_scheduled": await db.rides.count_documents({"status": "scheduled"}),
        "rides_active": await db.rides.count_documents({"status": {"$in": ["accepted", "heading", "arrived", "in_progress"]}}),
        "deliveries_total": await db.deliveries.count_documents({}),
        "deliveries_delivered": await db.deliveries.count_documents({"status": "delivered"}),
        "deliveries_cancelled": await db.deliveries.count_documents({"status": "cancelled"}),
        "bookings_total": await db.bookings.count_documents({}),
        "packages_total": await db.tourism_packages.count_documents({"active": True}),
        "revenue": round(revenue_rows[0]["total"], 2) if revenue_rows else 0.0,
        "commission": round(revenue_rows[0]["commission"], 2) if revenue_rows else 0.0,
        "services_paid": revenue_rows[0]["count"] if revenue_rows else 0,
        "revenue_today": round(today_rows[0]["total"], 2) if today_rows else 0.0,
        "commission_today": round(today_rows[0]["commission"], 2) if today_rows else 0.0,
        "open_tickets": await db.support_tickets.count_documents({"status": "open"}),
    }


@router.get("/users")
async def list_users(request: Request, role: str = "client", q: str = "", user: dict = Depends(require_admin)):
    db = request.app.db
    query: dict = {"role": role}
    if q:
        import re

        query["$or"] = [{"name": {"$regex": re.escape(q), "$options": "i"}}, {"email": {"$regex": re.escape(q), "$options": "i"}}]
    docs = await db.users.find(query, {"password_hash": 0}).sort("created_at", -1).limit(200).to_list(200)
    out = []
    for d in docs:
        d["id"] = str(d.pop("_id"))
        if role == "driver":
            ddoc = await db.drivers.find_one({"user_id": d["id"]})
            d["driver_status"] = ddoc.get("status") if ddoc else None
        out.append(d)
    return out


@router.post("/users/{user_id}/block")
async def block_user(user_id: str, body: BlockIn, request: Request, user: dict = Depends(require_admin)):
    db = request.app.db
    target = await db.users.find_one({"_id": _oid(user_id)})
    if not target:
        raise HTTPException(404, "Usuário não encontrado")
    if target.get("role") == "admin":
        raise HTTPException(400, "Não é possível bloquear um administrador")
    await db.users.update_one({"_id": target["_id"]}, {"$set": {"blocked": body.blocked}})
    if body.blocked:
        await db.drivers.update_one({"user_id": user_id}, {"$set": {"online": False, "status": "blocked"}})
        await db.sessions.update_many({"user_id": user_id, "revoked_at": None}, {"$set": {"revoked_at": now()}})
    else:
        await db.drivers.update_one({"user_id": user_id, "status": "blocked"}, {"$set": {"status": "pending"}})
    await audit(db, str(user["_id"]), user.get("name", ""), "bloqueou_usuario" if body.blocked else "desbloqueou_usuario",
                target.get("email", ""))
    return {"ok": True, "blocked": body.blocked}


@router.post("/users/{user_id}/reset-password")
async def reset_password(user_id: str, body: ResetPwIn, request: Request, user: dict = Depends(require_admin)):
    db = request.app.db
    target = await db.users.find_one({"_id": _oid(user_id)})
    if not target:
        raise HTTPException(404, "Usuário não encontrado")
    await db.users.update_one({"_id": target["_id"]}, {"$set": {"password_hash": hash_password(body.password)}})
    await db.sessions.update_many({"user_id": user_id, "revoked_at": None}, {"$set": {"revoked_at": now()}})
    await audit(db, str(user["_id"]), user.get("name", ""), "redefiniu_senha", target.get("email", ""))
    return {"ok": True}


@router.get("/drivers")
async def list_drivers(request: Request, status_filter: Optional[str] = None, user: dict = Depends(require_admin)):
    db = request.app.db
    query: dict = {}
    if status_filter and status_filter != "todos":
        query["status"] = status_filter
    docs = await db.drivers.find(query).sort("created_at", -1).limit(200).to_list(200)
    out = []
    for d in docs:
        vdoc = await db.vehicles.find_one({"driver_id": str(d["_id"])})
        udoc = await db.users.find_one({"_id": ObjectId(d["user_id"])})
        pub = driver_public(d, vdoc, with_cpf=True)
        item = pub.model_dump()
        item["email"] = (udoc or {}).get("email", "")
        item["cnh_number"] = d.get("cnh_number", "")
        item["cnh_validity"] = d.get("cnh_validity", "")
        item["cnh_photo_url"] = d.get("cnh_photo_url", "")
        item["doc_url"] = d.get("doc_url", "")
        item["earnings_total"] = round(d.get("earnings_total", 0.0), 2)
        out.append(item)
    return out


@router.post("/drivers/{driver_id}/status")
async def driver_status(driver_id: str, body: DriverStatusIn, request: Request, user: dict = Depends(require_admin)):
    db = request.app.db
    ddoc = await db.drivers.find_one({"_id": _oid(driver_id)})
    if not ddoc:
        raise HTTPException(404, "Motorista não encontrado")
    await db.drivers.update_one({"_id": ddoc["_id"]}, {"$set": {"status": body.status, "online": False}})
    if body.status == "blocked":
        await db.users.update_one({"_id": ObjectId(ddoc["user_id"])}, {"$set": {"blocked": True}})
        await db.sessions.update_many({"user_id": ddoc["user_id"], "revoked_at": None}, {"$set": {"revoked_at": now()}})
    if body.status in ("approved", "rejected", "unblocked_pending"):
        await db.users.update_one({"_id": ObjectId(ddoc["user_id"])}, {"$set": {"blocked": False}})
    msgs = {
        "approved": "Cadastro aprovado! Você já pode ficar online e receber serviços.",
        "rejected": "Cadastro reprovado. Atualize seus documentos no perfil.",
        "blocked": "Sua conta foi bloqueada. Fale com o suporte.",
        "pending": "Seu cadastro voltou para análise.",
    }
    await notify(db, ddoc["user_id"], "Status do cadastro atualizado", msgs.get(body.status, ""), "driver")
    await audit(db, str(user["_id"]), user.get("name", ""), f"motorista_{body.status}", ddoc.get("name", ""))
    return {"ok": True, "status": body.status}


@router.get("/rides")
async def admin_rides(request: Request, service_type: Optional[str] = None, status: Optional[str] = None, limit: int = 100, user: dict = Depends(require_admin)):
    db = request.app.db
    query: dict = {}
    if service_type and service_type != "todos":
        query["service_type"] = service_type
    if status and status != "todos":
        query["status"] = status
    docs = await db.rides.find(query).sort("created_at", -1).limit(min(limit, 200)).to_list(200)
    out = []
    for d in docs:
        client = await db.users.find_one({"_id": ObjectId(d["client_id"])}, {"name": 1})
        d["client_name"] = (client or {}).get("name", "")
        if d.get("driver_id"):
            ddoc = await db.drivers.find_one({"user_id": d["driver_id"]}, {"name": 1})
            d["driver_name"] = (ddoc or {}).get("name", "")
        else:
            d["driver_name"] = None
        d["id"] = str(d.pop("_id"))
        out.append(d)
    return out


@router.get("/deliveries")
async def admin_deliveries(request: Request, status: Optional[str] = None, limit: int = 100, user: dict = Depends(require_admin)):
    db = request.app.db
    query: dict = {}
    if status and status != "todos":
        query["status"] = status
    docs = await db.deliveries.find(query).sort("created_at", -1).limit(min(limit, 200)).to_list(200)
    out = []
    for d in docs:
        client = await db.users.find_one({"_id": ObjectId(d["client_id"])}, {"name": 1})
        d["client_name"] = (client or {}).get("name", "")
        if d.get("driver_id"):
            ddoc = await db.drivers.find_one({"user_id": d["driver_id"]}, {"name": 1})
            d["driver_name"] = (ddoc or {}).get("name", "")
        else:
            d["driver_name"] = None
        d["id"] = str(d.pop("_id"))
        out.append(d)
    return out


@router.get("/bookings")
async def admin_bookings(request: Request, status: Optional[str] = None, limit: int = 100, user: dict = Depends(require_admin)):
    db = request.app.db
    query: dict = {}
    if status and status != "todos":
        query["status"] = status
    docs = await db.bookings.find(query).sort("created_at", -1).limit(min(limit, 200)).to_list(200)
    out = []
    for d in docs:
        client = await db.users.find_one({"_id": ObjectId(d["client_id"])}, {"name": 1})
        d["client_name"] = (client or {}).get("name", "")
        d["id"] = str(d.pop("_id"))
        out.append(d)
    return out


@router.get("/settings")
async def get_settings_route(request: Request, user: dict = Depends(require_admin)):
    return await pricing.get_settings(request.app.db)


@router.put("/settings")
async def put_settings(body: SettingsUpdate, request: Request, user: dict = Depends(require_admin)):
    db = request.app.db
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if not changes:
        raise HTTPException(400, "Nada para atualizar")
    await db.settings.update_one({"_id": "app"}, {"$set": changes}, upsert=True)
    await audit(db, str(user["_id"]), user.get("name", ""), "atualizou_precos", "settings", ", ".join(changes.keys()))
    return await pricing.get_settings(db)


@router.get("/reports")
async def reports(request: Request, days: int = 14, user: dict = Depends(require_admin)):
    db = request.app.db
    start = now() - timedelta(days=days)
    daily = await db.payments.aggregate(
        [
            {"$match": {"created_at": {"$gte": start}}},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                "total": {"$sum": "$amount"},
                "commission": {"$sum": "$commission_amount"},
                "count": {"$sum": 1},
            }},
            {"$sort": {"_id": 1}},
        ]
    ).to_list(50)
    by_service = await db.payments.aggregate(
        [
            {"$match": {"created_at": {"$gte": start}}},
            {"$group": {"_id": "$service_type", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
        ]
    ).to_list(10)
    return {
        "daily": [{"date": r["_id"], "total": round(r["total"], 2), "commission": round(r["commission"], 2), "count": r["count"]} for r in daily],
        "by_service": [{"service": r["_id"], "total": round(r["total"], 2), "count": r["count"]} for r in by_service],
    }


@router.get("/audit-logs")
async def audit_logs(request: Request, user: dict = Depends(require_admin)):
    docs = await request.app.db.audit_logs.find({}).sort("created_at", -1).limit(100).to_list(100)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs


# ------------------------------------------------------------------ pacotes de turismo
@router.post("/packages", response_model=PackagePublic, status_code=201)
async def create_package(body: PackageIn, request: Request, user: dict = Depends(require_admin)):
    db = request.app.db
    doc = PackagePublic(**body.model_dump(), city="Belmonte", created_at=now()).to_mongo()
    result = await db.tourism_packages.insert_one(doc)
    doc["_id"] = result.inserted_id
    await audit(db, str(user["_id"]), user.get("name", ""), "criou_passeio", body.title)
    return PackagePublic.from_mongo(doc)


@router.put("/packages/{package_id}", response_model=PackagePublic)
async def update_package(package_id: str, body: PackageIn, request: Request, user: dict = Depends(require_admin)):
    db = request.app.db
    doc = await db.tourism_packages.find_one({"_id": oid(package_id)})
    if not doc:
        raise HTTPException(404, "Passeio não encontrado")
    await db.tourism_packages.update_one({"_id": doc["_id"]}, {"$set": body.model_dump()})
    updated = await db.tourism_packages.find_one({"_id": doc["_id"]})
    await audit(db, str(user["_id"]), user.get("name", ""), "editou_passeio", body.title)
    return PackagePublic.from_mongo(updated)


@router.post("/packages/{package_id}/delete")
@router.delete("/packages/{package_id}")
async def delete_package(package_id: str, request: Request, user: dict = Depends(require_admin)):
    """Soft delete: apenas desativa o passeio (dados preservados)."""
    db = request.app.db
    doc = await db.tourism_packages.find_one({"_id": oid(package_id)})
    if not doc:
        raise HTTPException(404, "Passeio não encontrado")
    await db.tourism_packages.update_one({"_id": doc["_id"]}, {"$set": {"active": False, "deleted_at": now()}})
    await audit(db, str(user["_id"]), user.get("name", ""), "removeu_passeio", doc.get("title", ""))
    return {"ok": True}


@router.get("/tickets")
async def list_tickets(request: Request, user: dict = Depends(require_admin)):
    docs = await request.app.db.support_tickets.find({}).sort("created_at", -1).limit(100).to_list(100)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs


@router.post("/tickets/{ticket_id}/resolve")
async def resolve_ticket(ticket_id: str, request: Request, user: dict = Depends(require_admin)):
    db = request.app.db
    doc = await db.support_tickets.find_one({"_id": _oid(ticket_id)})
    if not doc:
        raise HTTPException(404, "Ticket não encontrado")
    await db.support_tickets.update_one({"_id": doc["_id"]}, {"$set": {"status": "resolved", "resolved_at": now()}})
    if doc.get("user_id"):
        await notify(db, doc["user_id"], "Suporte", "Seu atendimento foi concluído. Obrigado!", "support")
    await audit(db, str(user["_id"]), user.get("name", ""), "resolveu_ticket", doc.get("subject", ""))
    return {"ok": True}
