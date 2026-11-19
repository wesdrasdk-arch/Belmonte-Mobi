"""Autenticação JWT com sessões rotativas (playbook OWASP/FastAPI)."""
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field

from models import (
    DriverPublic,
    DriverRegisterIn,
    PublicUser,
    VehiclePublic,
    now,
)

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ISSUER = "belmonte-mobi"
ACCESS_MINUTES = int(os.environ.get("ACCESS_MINUTES", "60"))
REFRESH_DAYS = int(os.environ.get("REFRESH_DAYS", "30"))

bearer = HTTPBearer(auto_error=False)
ALGORITHM = "HS256"
DUMMY_HASH = bcrypt.hashpw(b"senha-fantasma-para-timing", bcrypt.gensalt())


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except ValueError:
        return False


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def create_access(user_id: str, role: str) -> str:
    t = now()
    payload = {
        "sub": str(user_id),
        "role": role,
        "iss": JWT_ISSUER,
        "iat": t,
        "exp": t + timedelta(minutes=ACCESS_MINUTES),
        "jti": secrets.token_urlsafe(12),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


# ------------------------------------------------------------------ builders públicos
def user_public(doc: dict) -> PublicUser:
    return PublicUser(
        id=str(doc["_id"]),
        name=doc.get("name", ""),
        email=doc.get("email", ""),
        phone=doc.get("phone", ""),
        role=doc.get("role", "client"),
        blocked=doc.get("blocked", False),
        created_at=doc.get("created_at"),
    )


def vehicle_public(vdoc: Optional[dict]) -> Optional[VehiclePublic]:
    if not vdoc:
        return None
    return VehiclePublic(
        id=str(vdoc["_id"]),
        plate=vdoc.get("plate", ""),
        model=vdoc.get("model", ""),
        year=vdoc.get("year", ""),
        color=vdoc.get("color", ""),
        capacity=vdoc.get("capacity", 4),
        photo_url=vdoc.get("photo_url", ""),
    )


def driver_public(ddoc: dict, vdoc: Optional[dict] = None, with_cpf: bool = False) -> DriverPublic:
    return DriverPublic(
        id=str(ddoc["_id"]),
        user_id=str(ddoc.get("user_id", "")),
        name=ddoc.get("name", ""),
        phone=ddoc.get("phone", ""),
        status=ddoc.get("status", "pending"),
        online=ddoc.get("online", False),
        rating_avg=round(ddoc.get("rating_avg", 0.0), 2),
        rating_count=ddoc.get("rating_count", 0),
        photo_url=ddoc.get("photo_url", ""),
        cnh_category=ddoc.get("cnh_category", ""),
        cpf=(ddoc.get("cpf", "") if with_cpf else ""),
        lat=ddoc.get("lat"),
        lng=ddoc.get("lng"),
        vehicle=vehicle_public(vdoc),
    )


async def user_full_payload(db, user_doc: dict) -> dict:
    """Usuário público + perfil de motorista (quando houver)."""
    driver = None
    if user_doc.get("role") == "driver":
        ddoc = await db.drivers.find_one({"user_id": str(user_doc["_id"])})
        if ddoc:
            vdoc = await db.vehicles.find_one({"driver_id": str(ddoc["_id"])})
            driver = driver_public(ddoc, vdoc, with_cpf=True)
    return {"user": user_public(user_doc), "driver": driver}


# ------------------------------------------------------------------ dependências
async def current_user(request: Request, credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    if not credentials:
        raise HTTPException(401, "Não autenticado")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[ALGORITHM], issuer=JWT_ISSUER)
        user = await request.app.db.users.find_one({"_id": ObjectId(payload["sub"])})
    except Exception:
        raise HTTPException(401, "Sessão inválida ou expirada")
    if not user:
        raise HTTPException(401, "Sessão inválida ou expirada")
    if user.get("blocked"):
        raise HTTPException(403, "Conta bloqueada. Fale com o suporte via WhatsApp.")
    return user


def require_roles(*roles):
    async def dep(user: dict = Depends(current_user)) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(403, "Sem permissão para esta ação")
        return user

    return dep


require_client = require_roles("client")
require_driver = require_roles("driver")
require_admin = require_roles("admin")


async def get_approved_driver(db, user: dict) -> dict:
    ddoc = await db.drivers.find_one({"user_id": str(user["_id"])})
    if not ddoc:
        raise HTTPException(404, "Perfil de motorista não encontrado")
    status = ddoc.get("status")
    if status != "approved":
        msg = {
            "pending": "Cadastro em análise pelo administrador.",
            "rejected": "Cadastro reprovado. Atualize seus documentos no perfil.",
            "blocked": "Conta bloqueada. Fale com o suporte.",
        }.get(status, "Cadastro não aprovado.")
        raise HTTPException(403, msg)
    return ddoc


# ------------------------------------------------------------------ sessões
async def issue_tokens(db, user_doc: dict) -> dict:
    refresh = secrets.token_urlsafe(48)
    await db.sessions.insert_one(
        {
            "user_id": str(user_doc["_id"]),
            "token_hash": digest(refresh),
            "created_at": now(),
            "expires_at": now() + timedelta(days=REFRESH_DAYS),
            "revoked_at": None,
        }
    )
    payload = await user_full_payload(db, user_doc)
    return {
        "access_token": create_access(str(user_doc["_id"]), user_doc.get("role", "client")),
        "refresh_token": refresh,
        "token_type": "bearer",
        "expires_in": ACCESS_MINUTES * 60,
        **payload,
    }


# ------------------------------------------------------------------ rotas
auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterIn(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=8, max_length=20)
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=10)


class LogoutIn(BaseModel):
    refresh_token: str = Field(min_length=10)


class ForgotIn(BaseModel):
    email: EmailStr


@auth_router.post("/register", status_code=201)
async def register(body: RegisterIn, request: Request):
    db = request.app.db
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Este e-mail já está cadastrado")
    doc = {
        "name": body.name.strip(),
        "email": email,
        "phone": body.phone.strip(),
        "password_hash": hash_password(body.password),
        "role": "client",
        "blocked": False,
        "city": "Belmonte",
        "created_at": now(),
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    return await issue_tokens(db, doc)


@auth_router.post("/driver-register", status_code=201)
async def driver_register(body: DriverRegisterIn, request: Request):
    """Cria conta de motorista com perfil aguardando aprovação + veículo."""
    db = request.app.db
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Este e-mail já está cadastrado")
    user_doc = {
        "name": body.name.strip(),
        "email": email,
        "phone": body.phone.strip(),
        "password_hash": hash_password(body.password),
        "role": "driver",
        "blocked": False,
        "city": "Belmonte",
        "created_at": now(),
    }
    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id
    user_id = str(result.inserted_id)
    driver_doc = {
        "user_id": user_id,
        "name": body.name.strip(),
        "phone": body.phone.strip(),
        "cpf": body.cpf.strip(),
        "cnh_number": body.cnh_number.strip(),
        "cnh_category": body.cnh_category.strip().upper(),
        "cnh_validity": body.cnh_validity.strip(),
        "cnh_photo_url": "",
        "doc_url": "",
        "photo_url": "",
        "status": "pending",
        "online": False,
        "rating_avg": 0.0,
        "rating_count": 0,
        "earnings_total": 0.0,
        "city": "Belmonte",
        "created_at": now(),
    }
    driver_result = await db.drivers.insert_one(driver_doc)
    await db.vehicles.insert_one(
        {"driver_id": str(driver_result.inserted_id), "plate": "", "model": "", "year": "", "color": "", "capacity": 4, "photo_url": ""}
    )
    return await issue_tokens(db, user_doc)


@auth_router.post("/login")
async def login(body: LoginIn, request: Request):
    db = request.app.db
    email = body.email.lower()
    key = f"{email}:{request.client.host if request.client else 'unknown'}"
    attempt = await db.login_attempts.find_one({"key": key})
    if attempt and attempt.get("blocked_until") and attempt["blocked_until"] > now():
        raise HTTPException(429, "Muitas tentativas. Tente novamente em alguns minutos.")
    user = await db.users.find_one({"email": email})
    valid = verify_password(body.password, user["password_hash"]) if user else verify_password(body.password, DUMMY_HASH.decode())
    if not user or not valid:
        n = (attempt or {}).get("count", 0) + 1
        blocked_until = now() + timedelta(seconds=min(900, 2 ** min(n, 10))) if n >= 5 else None
        await db.login_attempts.update_one({"key": key}, {"$set": {"count": n, "blocked_until": blocked_until}}, upsert=True)
        raise HTTPException(401, "E-mail ou senha incorretos")
    if user.get("blocked"):
        raise HTTPException(403, "Conta bloqueada. Fale com o suporte via WhatsApp.")
    await db.login_attempts.delete_one({"key": key})
    return await issue_tokens(db, user)


@auth_router.post("/refresh")
async def refresh(body: RefreshIn, request: Request):
    db = request.app.db
    old = await db.sessions.find_one(
        {"token_hash": digest(body.refresh_token), "revoked_at": None, "expires_at": {"$gt": now()}}
    )
    if not old:
        raise HTTPException(401, "Sessão inválida")
    await db.sessions.update_one({"_id": old["_id"]}, {"$set": {"revoked_at": now()}})
    user = await db.users.find_one({"_id": ObjectId(old["user_id"]), "blocked": {"$ne": True}})
    if not user:
        raise HTTPException(401, "Sessão inválida")
    return await issue_tokens(db, user)


@auth_router.post("/logout", status_code=204)
async def logout(body: LogoutIn, request: Request):
    await request.app.db.sessions.update_one(
        {"token_hash": digest(body.refresh_token), "revoked_at": None}, {"$set": {"revoked_at": now()}}
    )


@auth_router.get("/me")
async def me(request: Request, user: dict = Depends(current_user)):
    return await user_full_payload(request.app.db, user)


@auth_router.post("/forgot", status_code=202)
async def forgot(body: ForgotIn, request: Request):
    """Sem gateway de e-mail no MVP: gera ticket de suporte para redefinição humana."""
    db = request.app.db
    user = await db.users.find_one({"email": body.email.lower()})
    if user:
        await db.support_tickets.insert_one(
            {
                "user_id": str(user["_id"]),
                "kind": "password_reset",
                "subject": "Recuperação de senha",
                "message": f"Solicitação de recuperação de senha de {user.get('name')} ({user.get('email')}).",
                "status": "open",
                "created_at": now(),
            }
        )
        for admin in await db.users.find({"role": "admin"}).to_list(10):
            await db.notifications.insert_one(
                {
                    "user_id": str(admin["_id"]),
                    "title": "Recuperação de senha solicitada",
                    "body": f"{user.get('name')} ({user.get('email')}) solicitou redefinição de senha.",
                    "type": "support",
                    "read": False,
                    "created_at": now(),
                }
            )
    return {"message": "Se a conta existir, o suporte entrará em contato pelo WhatsApp para redefinir a senha."}
