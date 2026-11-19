"""Turismo: catálogo de passeios + reservas."""
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pymongo import ReturnDocument

from auth import require_client
from models import BookingIn, BookingPublic, PackagePublic, notify, now
from routers_services import new_code, oid

router = APIRouter(prefix="/api/tourism", tags=["turismo"])


@router.get("/packages", response_model=list[PackagePublic])
async def list_packages(request: Request, category: Optional[str] = None):
    query = {"active": True}
    if category and category != "todos":
        query["category"] = category
    docs = await request.app.db.tourism_packages.find(query).sort("created_at", -1).limit(60).to_list(60)
    return [PackagePublic.from_mongo(d) for d in docs]


@router.get("/packages/{package_id}", response_model=PackagePublic)
async def get_package(package_id: str, request: Request):
    doc = await request.app.db.tourism_packages.find_one({"_id": oid(package_id)})
    if not doc or not doc.get("active"):
        raise HTTPException(404, "Passeio não encontrado")
    return PackagePublic.from_mongo(doc)


@router.post("/bookings", response_model=BookingPublic, status_code=201)
async def create_booking(body: BookingIn, request: Request, user: dict = Depends(require_client)):
    db = request.app.db
    pkg = await db.tourism_packages.find_one({"_id": oid(body.package_id), "active": True})
    if not pkg:
        raise HTTPException(404, "Passeio não encontrado")
    if body.people > pkg.get("max_people", 8):
        raise HTTPException(400, f"Máximo de {pkg['max_people']} pessoas por passeio")
    total = round(float(pkg["price_per_person"]) * body.people, 2)
    doc = BookingPublic(
        code=await new_code(db, "turismo"),
        package_id=str(pkg["_id"]),
        package_title=pkg["title"],
        client_id=str(user["_id"]),
        date=body.date,
        time=body.time,
        people=body.people,
        total=total,
        payment_method=body.payment_method,
        notes=body.notes,
        status="confirmed",
        created_at=now(),
    ).to_mongo()
    result = await db.bookings.insert_one(doc)
    doc["_id"] = result.inserted_id
    await notify(db, str(user["_id"]), "Reserva confirmada",
                 f"{pkg['title']} em {body.date} às {body.time}. Código {doc['code']}.", "booking", doc["code"])
    return BookingPublic.from_mongo(doc)


@router.get("/bookings/mine", response_model=list[BookingPublic])
async def my_bookings(request: Request, user: dict = Depends(require_client)):
    docs = await request.app.db.bookings.find({"client_id": str(user["_id"])}).sort("created_at", -1).limit(50).to_list(50)
    return [BookingPublic.from_mongo(d) for d in docs]


@router.post("/bookings/{booking_id}/cancel", response_model=BookingPublic)
async def cancel_booking(booking_id: str, request: Request, user: dict = Depends(require_client)):
    db = request.app.db
    doc = await db.bookings.find_one({"_id": oid(booking_id)})
    if not doc or doc["client_id"] != str(user["_id"]):
        raise HTTPException(404, "Reserva não encontrada")
    if doc["status"] != "confirmed":
        raise HTTPException(400, "Reserva não pode ser cancelada")
    updated = await db.bookings.find_one_and_update(
        {"_id": doc["_id"]}, {"$set": {"status": "cancelled"}}, return_document=ReturnDocument.AFTER
    )
    await notify(db, str(user["_id"]), "Reserva cancelada", f"A reserva {doc['code']} foi cancelada.", "booking", doc["code"])
    return BookingPublic.from_mongo(updated)
