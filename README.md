# BELMONTE MOBI
**Transporte, Turismo e Entregas na palma da sua mão.** — Plataforma regional de mobilidade (Belmonte – BA).

## Arquitetura
- backend/ (FastAPI + MongoDB): server.py (app, índices, seed), auth.py (JWT + refresh rotativo, papéis, anti brute-force),
  models.py, pricing.py (preços 100% configuráveis), geo.py (OpenStreetMap/Nominatim + OSRM, sem chave),
  storage_helper.py (Object Storage), routers_services.py (corridas/viagens/encomendas/motorista/comissão),
  routers_tourism.py, routers_admin.py, routers_common.py (notificações, avaliações, arquivos, suporte, cupons, estimativa)
- frontend/ (Expo: iOS, Android, Web/PWA): app/(client), app/transport, app/deliveries, app/trips, app/tourism,
  app/schedule, app/driver, app/admin; src/ (tema, API, auth, componentes, mapa Leaflet/OSM)

## Variáveis de ambiente
backend/.env: MONGO_URL, DB_NAME, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, EMERGENT_LLM_KEY
frontend/.env: EXPO_PUBLIC_BACKEND_URL

## Coleções
users, drivers, vehicles, rides, deliveries, tourism_packages, bookings, payments, commissions, ratings,
notifications, uploads, coupons, settings, support_tickets, audit_logs, sessions. Todo registro tem `city` (multi-cidades).

## Regras
- Motorista só recebe serviços quando aprovado. Tarifas/comissões editáveis no Admin. Pagamento dinheiro/Pix
  (coleção payments pronta para gateway). Ações administrativas em audit_logs.

## Executar
cd backend && pip install -r requirements.txt && uvicorn server:app --host 0.0.0.0 --port 8001
cd frontend && yarn && yarn start
