"""BELMONTE MOBI — API principal (FastAPI + MongoDB)."""
import asyncio
import logging
import os
from contextlib import suppress
from pathlib import Path  # noqa: I001

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / '.env')

from fastapi import FastAPI  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware

import auth
import pricing
import routers_admin
import routers_common
import routers_services
import routers_tourism
import storage_helper
from models import now

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("belmonte-mobi")

# Um índice por coleção: todo campo usado em filtro/sort/dedup.
INDEXES: dict[str, list[IndexModel]] = {
    "users": [
        IndexModel([("email", ASCENDING)], name="email", unique=True),
        IndexModel([("role", ASCENDING)], name="role"),
    ],
    "drivers": [
        IndexModel([("user_id", ASCENDING)], name="user_id", unique=True),
        IndexModel([("status", ASCENDING)], name="status"),
    ],
    "vehicles": [IndexModel([("driver_id", ASCENDING)], name="driver_id")],
    "rides": [
        IndexModel([("code", ASCENDING)], name="code", unique=True),
        IndexModel([("client_id", ASCENDING), ("status", ASCENDING)], name="client_status"),
        IndexModel([("driver_id", ASCENDING)], name="driver_id"),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
    ],
    "deliveries": [
        IndexModel([("code", ASCENDING)], name="code", unique=True),
        IndexModel([("client_id", ASCENDING), ("status", ASCENDING)], name="client_status"),
        IndexModel([("driver_id", ASCENDING)], name="driver_id"),
    ],
    "tourism_packages": [IndexModel([("category", ASCENDING)], name="category")],
    "bookings": [
        IndexModel([("code", ASCENDING)], name="code", unique=True),
        IndexModel([("client_id", ASCENDING)], name="client_id"),
    ],
    "payments": [
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
        IndexModel([("driver_id", ASCENDING)], name="driver_id"),
    ],
    "commissions": [IndexModel([("created_at", DESCENDING)], name="created_desc")],
    "ratings": [
        IndexModel([("driver_id", ASCENDING)], name="driver_id"),
        IndexModel([("service_id", ASCENDING)], name="service_id"),
    ],
    "notifications": [
        IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_recent"),
    ],
    "sessions": [
        IndexModel([("token_hash", ASCENDING)], name="token_hash", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="expires_ttl", expireAfterSeconds=0),
    ],
    "login_attempts": [IndexModel([("key", ASCENDING)], name="key", unique=True)],
    "geocache": [IndexModel([("key", ASCENDING)], name="key", unique=True)],
    "audit_logs": [IndexModel([("created_at", DESCENDING)], name="created_desc")],
    "support_tickets": [IndexModel([("user_id", ASCENDING)], name="user_id")],
    "uploads": [IndexModel([("path", ASCENDING)], name="path", unique=True)],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)


TOURISM_SEED = [
    {
        "title": "Centro Histórico de Belmonte",
        "description": "Caminhe pela cidade onde nasceu o descobrimento do Brasil: Igreja Matriz de Nossa Senhora da Conceição, casario colonial do século XVIII, Museu do Descobrimento e o Marco da Posse. Um roteiro guiado pela história de Pedro Álvares Cabral.",
        "category": "roteiro_historico",
        "photo_url": "https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=1200&q=80&fm=jpg",
        "duration_hours": 3.0,
        "price_per_person": 60.0,
        "max_people": 10,
        "departure_point": "Praça da Matriz, Centro - Belmonte",
        "times": ["08:00", "14:00"],
        "guide_name": "Guia local credenciado",
    },
    {
        "title": "Mogiquiçaba — Cultura e Tradição",
        "description": "Visite um dos povoados mais antigos da Bahia, distrito de Belmonte berço da tradição do cacau e da cultura cabralina. Inclui almoço típico regional e parada no mirante da Serra.",
        "category": "mogiquicaba",
        "photo_url": "https://images.unsplash.com/photo-1682152572654-6c0ec46f4aa4?w=1200&q=80&fm=jpg",
        "duration_hours": 5.0,
        "price_per_person": 95.0,
        "max_people": 8,
        "departure_point": "Terminal Rodoviário de Belmonte",
        "times": ["08:00"],
        "guide_name": "Guia local credenciado",
    },
    {
        "title": "Praia de Ubulema e Foz do Jequitinhonha",
        "description": "Dia de sol na Praia de Ubulema, onde o Rio Jequitinhonha encontra o mar. Estrutura de barracas, peixada fresca e o pôr do sol mais bonito do litoral sul da Bahia.",
        "category": "praias",
        "photo_url": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80&fm=jpg",
        "duration_hours": 6.0,
        "price_per_person": 80.0,
        "max_people": 12,
        "departure_point": "Praça da Matriz, Centro - Belmonte",
        "times": ["08:00", "09:00"],
        "guide_name": "",
    },
    {
        "title": "Passeio de Escuna no Rio Jequitinhonha",
        "description": "Navegue pelas águas calmas do Rio Jequitinhonha em escuna tradicional, com paradas para banho de rio, avistamento de aves e história da época do ouro e do cacau.",
        "category": "passeio_belmonte",
        "photo_url": "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1200&q=80&fm=jpg",
        "duration_hours": 4.0,
        "price_per_person": 110.0,
        "max_people": 15,
        "departure_point": "Porto de Belmonte",
        "times": ["09:00", "13:00"],
        "guide_name": "Guia local credenciado",
    },
    {
        "title": "Costa do Descobrimento — Praias e Mirantes",
        "description": "Roteiro de veículo pela Costa do Descobrimento com paradas nas praias desertas entre Belmonte e Santa Cruz Cabrália. Leve protetor solar, chapéu e bom humor!",
        "category": "praias",
        "photo_url": "https://images.unsplash.com/photo-1519046904884-53103b34b206?w=1200&q=80&fm=jpg",
        "duration_hours": 7.0,
        "price_per_person": 120.0,
        "max_people": 10,
        "departure_point": "Seu hotel ou pousada em Belmonte",
        "times": ["07:30"],
        "guide_name": "",
    },
    {
        "title": "Transfer Turístico Belmonte ⇄ Porto Seguro",
        "description": "Transfer turístico com paradas panorâmicas entre Belmonte, Santa Cruz Cabrália e Porto Seguro. Veículo climatizado, motorista-guia local e embarque no seu hotel.",
        "category": "transfer",
        "photo_url": "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=1200&q=80&fm=jpg",
        "duration_hours": 2.5,
        "price_per_person": 70.0,
        "max_people": 4,
        "departure_point": "Seu hotel ou pousada em Belmonte",
        "times": ["06:00", "10:00", "14:00", "18:00"],
        "guide_name": "Motorista-guia local",
    },
    {
        "title": "Passeio Personalizado (roteiro sob medida)",
        "description": "Monte seu próprio roteiro: cachoeiras, vilarejos, pescarias, sítios históricos ou praias. Você escolhe os pontos, nós montamos a rota com motorista à disposição.",
        "category": "personalizado",
        "photo_url": "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=1200&q=80&fm=jpg",
        "duration_hours": 8.0,
        "price_per_person": 150.0,
        "max_people": 6,
        "departure_point": "A combinar com o cliente",
        "times": ["08:00"],
        "guide_name": "",
    },
]


async def seed() -> None:
    """Seed idempotente: admin, configurações, contas demo e passeios exemplo."""
    try:
        admin_email = os.environ.get("ADMIN_EMAIL", "admin@belmontemobi.com").lower()
        admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@2026")
        if not await db.users.find_one({"role": "admin"}):
            await db.users.insert_one(
                {
                    "name": "Administrador",
                    "email": admin_email,
                    "phone": "+5573999999999",
                    "password_hash": auth.hash_password(admin_password),
                    "role": "admin",
                    "blocked": False,
                    "city": "Belmonte",
                    "created_at": now(),
                }
            )
            logger.info("Admin criado: %s", admin_email)

        await db.settings.update_one({"_id": "app"}, {"$setOnInsert": pricing.DEFAULT_SETTINGS}, upsert=True)

        if not await db.users.find_one({"email": "cliente@demo.com"}):
            await db.users.insert_one(
                {
                    "name": "Maria Santos",
                    "email": "cliente@demo.com",
                    "phone": "+5573999990002",
                    "password_hash": auth.hash_password("Cliente@2026"),
                    "role": "client",
                    "blocked": False,
                    "city": "Belmonte",
                    "created_at": now(),
                }
            )

        if not await db.users.find_one({"email": "motorista@demo.com"}):
            u = await db.users.insert_one(
                {
                    "name": "Carlos Oliveira",
                    "email": "motorista@demo.com",
                    "phone": "+5573999990001",
                    "password_hash": auth.hash_password("Motorista@2026"),
                    "role": "driver",
                    "blocked": False,
                    "city": "Belmonte",
                    "created_at": now(),
                }
            )
            d = await db.drivers.insert_one(
                {
                    "user_id": str(u.inserted_id),
                    "name": "Carlos Oliveira",
                    "phone": "+5573999990001",
                    "cpf": "11122233344",
                    "cnh_number": "01234567890",
                    "cnh_category": "D",
                    "cnh_validity": "2029-06-10",
                    "cnh_photo_url": "",
                    "doc_url": "",
                    "photo_url": "",
                    "status": "approved",
                    "online": False,
                    "rating_avg": 4.8,
                    "rating_count": 12,
                    "earnings_total": 0.0,
                    "city": "Belmonte",
                    "created_at": now(),
                }
            )
            await db.vehicles.insert_one(
                {
                    "driver_id": str(d.inserted_id),
                    "plate": "ABC1D23",
                    "model": "VW Saveiro",
                    "year": "2022",
                    "color": "Branco",
                    "capacity": 4,
                    "photo_url": "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=1200&q=80&fm=jpg",
                }
            )
            logger.info("Motorista demo criado")

        if await db.tourism_packages.count_documents({}) == 0:
            docs = [{**p, "active": True, "city": "Belmonte", "created_at": now()} for p in TOURISM_SEED]
            await db.tourism_packages.insert_many(docs)
            logger.info("Passeios de turismo criados (%d)", len(docs))
    except Exception as exc:
        logger.error("seed: %s", exc)


# Cria a app principal sem prefixo
app = FastAPI(title="BELMONTE MOBI API")
app.db = db


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


app.include_router(auth.auth_router)
app.include_router(routers_services.router)
app.include_router(routers_tourism.router)
app.include_router(routers_admin.router)
app.include_router(routers_common.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    app.state.index_task = asyncio.create_task(ensure_indexes())
    asyncio.create_task(seed())
    try:
        await run_in_threadpool(storage_helper.init_storage)
        logger.info("Object Storage inicializado")
    except Exception as exc:
        logger.error("Object Storage init falhou: %s", exc)


@app.on_event("shutdown")
async def shutdown_db_client():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
