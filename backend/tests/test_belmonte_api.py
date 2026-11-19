# BELMONTE MOBI backend regression tests: auth, rides lifecycle, deliveries, driver approval, admin, tourism, roles
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
CREDS = {
    "admin": ("admin@belmontemobi.com", "Admin@2026"),
    "client": ("cliente@demo.com", "Cliente@2026"),
    "driver": ("motorista@demo.com", "Motorista@2026"),
}
ORIG = {"address": "TEST_Centro, Belmonte", "lat": -15.8631, "lng": -38.8828}
DEST = {"address": "TEST_Praia, Belmonte", "lat": -15.8500, "lng": -38.8700}


def login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    return r


def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="session")
def tokens():
    out = {}
    for k, (e, p) in CREDS.items():
        r = login(e, p)
        assert r.status_code == 200, f"{k} login failed {r.text}"
        out[k] = r.json()["access_token"]
    return out


def finish_driver_active(tok):
    # Finish any leftover active job for demo driver
    j = requests.get(f"{API}/driver/jobs", headers=hdr(tok), timeout=30).json()
    ar = j.get("active_ride")
    if ar:
        for step in ["heading", "arrive", "start", "complete"]:
            requests.post(f"{API}/driver/rides/{ar['id']}/{step}", headers=hdr(tok), timeout=30)


# --- Health & auth
def test_health():
    r = requests.get(f"{API}/settings/public", timeout=30)
    assert r.status_code in (200, 401)


def test_login_invalid():
    r = login("cliente@demo.com", "wrongpass1")
    assert r.status_code == 401


def test_me(tokens):
    r = requests.get(f"{API}/auth/me", headers=hdr(tokens["client"]), timeout=30)
    assert r.status_code == 200 and r.json()["user"]["email"] == "cliente@demo.com"


# --- Role protection
def test_client_cannot_call_admin(tokens):
    for p in ["/admin/dashboard", "/admin/users", "/admin/settings", "/admin/drivers"]:
        r = requests.get(f"{API}{p}", headers=hdr(tokens["client"]), timeout=30)
        assert r.status_code == 403, p
    r = requests.get(f"{API}/admin/dashboard", headers=hdr(tokens["driver"]), timeout=30)
    assert r.status_code == 403


# --- Geocode / estimate
def test_geocode(tokens):
    r = requests.get(f"{API}/geocode", params={"q": "Belmonte Bahia"}, headers=hdr(tokens["client"]), timeout=40)
    assert r.status_code == 200 and isinstance(r.json(), list)


def test_estimate(tokens):
    r = requests.post(f"{API}/estimate", json={"service_type": "transporte", "origin": ORIG, "destination": DEST},
                      headers=hdr(tokens["client"]), timeout=40)
    assert r.status_code == 200 and r.json()["price"] > 0


# --- Full ride lifecycle + commission
def test_ride_full_lifecycle(tokens):
    c, d, a = tokens["client"], tokens["driver"], tokens["admin"]
    finish_driver_active(d)
    r = requests.post(f"{API}/driver/online", json={"online": True}, headers=hdr(d), timeout=30)
    assert r.status_code == 200
    r = requests.post(f"{API}/rides", json={"service_type": "transporte", "origin": ORIG, "destination": DEST,
                                             "notes": "TEST_ride"}, headers=hdr(c), timeout=40)
    assert r.status_code == 201, r.text
    ride = r.json()
    assert ride["status"] == "searching"
    avail = requests.get(f"{API}/driver/available", headers=hdr(d), timeout=30).json()
    assert any(x["id"] == ride["id"] for x in avail["rides"])
    r = requests.post(f"{API}/driver/rides/{ride['id']}/accept", headers=hdr(d), timeout=30)
    assert r.status_code == 200 and r.json()["status"] == "accepted"
    for step, st in [("heading", "heading"), ("arrive", "arrived"), ("start", "in_progress"), ("complete", "completed")]:
        r = requests.post(f"{API}/driver/rides/{ride['id']}/{step}", headers=hdr(d), timeout=30)
        assert r.status_code == 200, f"{step}: {r.text}"
        assert r.json()["status"] == st
    g = requests.get(f"{API}/rides/{ride['id']}", headers=hdr(c), timeout=30).json()
    assert g["status"] == "completed"
    r = requests.post(f"{API}/ratings", json={"service_type": "ride", "service_id": ride["id"], "stars": 5,
                                              "comment": "TEST_ok"}, headers=hdr(c), timeout=30)
    assert r.status_code == 201, r.text
    rides = requests.get(f"{API}/admin/rides", headers=hdr(a), timeout=30).json()
    items = rides if isinstance(rides, list) else rides.get("items", rides.get("rides", []))
    assert any(x.get("code") == ride["code"] for x in items)
    rep = requests.get(f"{API}/admin/reports", headers=hdr(a), timeout=30)
    assert rep.status_code == 200 and len(rep.json()["daily"]) >= 1


# --- Cancellation fee after accept
def test_cancel_fee_after_accept(tokens):
    c, d = tokens["client"], tokens["driver"]
    finish_driver_active(d)
    ride = requests.post(f"{API}/rides", json={"service_type": "transporte", "origin": ORIG, "destination": DEST,
                                                "notes": "TEST_cancel"}, headers=hdr(c), timeout=40).json()
    assert requests.post(f"{API}/driver/rides/{ride['id']}/accept", headers=hdr(d), timeout=30).status_code == 200
    r = requests.post(f"{API}/rides/{ride['id']}/cancel", headers=hdr(c), timeout=30)
    assert r.status_code == 200 and r.json()["status"] == "cancelled" and r.json()["cancel_fee"] > 0


def test_cancel_no_fee_searching(tokens):
    c = tokens["client"]
    ride = requests.post(f"{API}/rides", json={"service_type": "transporte", "origin": ORIG, "destination": DEST,
                                                "notes": "TEST_cancel2"}, headers=hdr(c), timeout=40).json()
    r = requests.post(f"{API}/rides/{ride['id']}/cancel", headers=hdr(c), timeout=30)
    assert r.status_code == 200 and r.json()["cancel_fee"] == 0


# --- Driver one active job at a time
def test_driver_cannot_accept_two_rides(tokens):
    c, d = tokens["client"], tokens["driver"]
    finish_driver_active(d)
    r1 = requests.post(f"{API}/rides", json={"service_type": "transporte", "origin": ORIG, "destination": DEST,
                                              "notes": "TEST_a"}, headers=hdr(c), timeout=40).json()
    r2 = requests.post(f"{API}/rides", json={"service_type": "transporte", "origin": ORIG, "destination": DEST,
                                              "notes": "TEST_b"}, headers=hdr(c), timeout=40).json()
    a1 = requests.post(f"{API}/driver/rides/{r1['id']}/accept", headers=hdr(d), timeout=30)
    a2 = requests.post(f"{API}/driver/rides/{r2['id']}/accept", headers=hdr(d), timeout=30)
    # cleanup
    requests.post(f"{API}/rides/{r1['id']}/cancel", headers=hdr(c), timeout=30)
    requests.post(f"{API}/rides/{r2['id']}/cancel", headers=hdr(c), timeout=30)
    assert a1.status_code == 200
    assert a2.status_code in (400, 409), "Driver accepted a second ride while having an active one"


# --- Delivery flow
def test_delivery_flow(tokens):
    c, d = tokens["client"], tokens["driver"]
    finish_driver_active(d)
    r = requests.post(f"{API}/deliveries", json={"pickup": ORIG, "dropoff": DEST, "recipient_name": "TEST_Maria",
                                                  "recipient_phone": "73999990000", "description": "TEST_caixa"},
                      headers=hdr(c), timeout=40)
    assert r.status_code == 201, r.text
    dl = r.json()
    assert len(dl["delivery_code"]) == 4
    did = dl["id"]
    assert requests.post(f"{API}/driver/deliveries/{did}/accept", headers=hdr(d), timeout=30).status_code == 200
    assert requests.post(f"{API}/driver/deliveries/{did}/collect", headers=hdr(d), timeout=30).status_code == 200
    assert requests.post(f"{API}/driver/deliveries/{did}/transit", headers=hdr(d), timeout=30).status_code == 200
    wrong = "0000" if dl["delivery_code"] != "0000" else "1111"
    assert requests.post(f"{API}/driver/deliveries/{did}/deliver", json={"code": wrong}, headers=hdr(d), timeout=30).status_code == 400
    r = requests.post(f"{API}/driver/deliveries/{did}/deliver", json={"code": dl["delivery_code"]}, headers=hdr(d), timeout=30)
    assert r.status_code == 200 and r.json()["status"] == "delivered"
    t = requests.get(f"{API}/deliveries/track/{dl['code']}", timeout=30)
    assert t.status_code == 200 and t.json()["status"] == "delivered"


def test_public_tracking_hides_delivery_code(tokens):
    c = tokens["client"]
    dl = requests.post(f"{API}/deliveries", json={"pickup": ORIG, "dropoff": DEST, "recipient_name": "TEST_Joao",
                                                   "recipient_phone": "73999990001", "description": "TEST_caixa2"},
                       headers=hdr(c), timeout=40).json()
    t = requests.get(f"{API}/deliveries/track/{dl['code']}", timeout=30).json()
    requests.post(f"{API}/deliveries/{dl['id']}/cancel", headers=hdr(c), timeout=30)
    assert t.get("delivery_code") in ("", None), "Public tracking exposes 4-digit confirmation code"


def test_driver_available_hides_delivery_code(tokens):
    c, d = tokens["client"], tokens["driver"]
    dl = requests.post(f"{API}/deliveries", json={"pickup": ORIG, "dropoff": DEST, "recipient_name": "TEST_Ana",
                                                   "recipient_phone": "73999990002", "description": "TEST_caixa3"},
                       headers=hdr(c), timeout=40).json()
    avail = requests.get(f"{API}/driver/available", headers=hdr(d), timeout=30).json()
    requests.post(f"{API}/deliveries/{dl['id']}/cancel", headers=hdr(c), timeout=30)
    item = next((x for x in avail["deliveries"] if x["id"] == dl["id"]), None)
    assert item is not None
    assert item.get("delivery_code") in ("", None), "Driver sees confirmation code before delivery"


# --- Unapproved driver / approve / block
@pytest.fixture(scope="module")
def new_driver():
    email = f"TEST_drv_{uuid.uuid4().hex[:6]}@test.com".lower()
    r = requests.post(f"{API}/auth/driver-register", json={
        "name": "TEST Driver", "email": email, "phone": "73999998888", "password": "Senha@2026",
        "cpf": "12345678901", "cnh_number": "123456789", "cnh_category": "B", "cnh_validity": "2030-01-01"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    return email, r.json()["access_token"]


def test_unapproved_driver_restrictions(tokens, new_driver):
    _, dt = new_driver
    assert requests.post(f"{API}/driver/online", json={"online": True}, headers=hdr(dt), timeout=30).status_code == 403
    av = requests.get(f"{API}/driver/available", headers=hdr(dt), timeout=30).json()
    assert av == {"rides": [], "deliveries": []}


def test_unapproved_driver_cannot_accept(tokens, new_driver):
    _, dt = new_driver
    c = tokens["client"]
    ride = requests.post(f"{API}/rides", json={"service_type": "transporte", "origin": ORIG, "destination": DEST,
                                                "notes": "TEST_unapproved"}, headers=hdr(c), timeout=40).json()
    r = requests.post(f"{API}/driver/rides/{ride['id']}/accept", headers=hdr(dt), timeout=30)
    requests.post(f"{API}/rides/{ride['id']}/cancel", headers=hdr(c), timeout=30)
    assert r.status_code == 403, f"Pending driver accepted ride: {r.status_code}"


def test_admin_approve_then_block(tokens, new_driver):
    email, _ = new_driver
    a = tokens["admin"]
    drivers = requests.get(f"{API}/admin/drivers", headers=hdr(a), timeout=30).json()
    items = drivers if isinstance(drivers, list) else drivers.get("items", [])
    drv = next(x for x in items if x.get("email", "").lower() == email)
    assert requests.post(f"{API}/admin/drivers/{drv['id']}/status", json={"status": "approved"}, headers=hdr(a), timeout=30).status_code == 200
    dt = login(email, "Senha@2026").json()["access_token"]
    assert requests.post(f"{API}/driver/online", json={"online": True}, headers=hdr(dt), timeout=30).status_code == 200
    assert requests.post(f"{API}/driver/online", json={"online": False}, headers=hdr(dt), timeout=30).status_code == 200
    uid = drv.get("user_id")
    r = requests.post(f"{API}/admin/users/{uid}/block", json={"blocked": True}, headers=hdr(a), timeout=30)
    assert r.status_code == 200
    assert login(email, "Senha@2026").status_code == 403


# --- Tourism + admin settings
def test_packages_and_booking(tokens):
    c = tokens["client"]
    pk = requests.get(f"{API}/tourism/packages", timeout=30).json()
    assert len(pk) > 0
    r = requests.post(f"{API}/tourism/bookings", json={"package_id": pk[0]["id"], "date": "2026-03-10", "time": "09:00",
                                               "people": 2, "notes": "TEST_booking"}, headers=hdr(c), timeout=30)
    assert r.status_code == 201, r.text
    b = r.json()
    requests.post(f"{API}/tourism/bookings/{b['id']}/cancel", headers=hdr(c), timeout=30)


def test_admin_settings_affect_estimate(tokens):
    a, c = tokens["admin"], tokens["client"]
    s = requests.get(f"{API}/admin/settings", headers=hdr(a), timeout=30).json()
    old = s["price_per_km"]
    e1 = requests.post(f"{API}/estimate", json={"service_type": "transporte", "origin": ORIG, "destination": {**DEST, "lat": -15.70}},
                       headers=hdr(c), timeout=40).json()
    requests.put(f"{API}/admin/settings", json={"price_per_km": old + 5}, headers=hdr(a), timeout=30)
    e2 = requests.post(f"{API}/estimate", json={"service_type": "transporte", "origin": ORIG, "destination": {**DEST, "lat": -15.70}},
                       headers=hdr(c), timeout=40).json()
    requests.put(f"{API}/admin/settings", json={"price_per_km": old}, headers=hdr(a), timeout=30)
    assert e2["price"] > e1["price"]


def test_notifications(tokens):
    for k in ("client", "driver"):
        r = requests.get(f"{API}/notifications", headers=hdr(tokens[k]), timeout=30)
        assert r.status_code == 200
