# Estate360 API Contract

**Version:** 1.0.0  
**Base URL:** `/api/v1`  
**Auth:** JWT — `Authorization: Bearer <access_token>` (access token 15 min, rotating refresh in httpOnly cookie)  
**Machine-readable spec:** [`openapi.yaml`](./openapi.yaml)

---

## Authentication (`/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Register a tenant, landlord, or agent. |
| POST | `/auth/login` | — | Email + password login. Returns access token + sets refresh cookie. |
| POST | `/auth/refresh` | Refresh cookie + `X-Requested-With: estate360-web` | Issue a new access token. |
| POST | `/auth/logout` | Bearer | Blacklist refresh token, clear cookie. |
| POST | `/auth/verify-email` | — | Confirm email with 6-digit OTP. |
| POST | `/auth/verify-email/resend` | — | Resend email verification OTP (60s cooldown). |
| POST | `/auth/password-reset` | — | Send password-reset OTP to email. |
| POST | `/auth/password-reset/verify-otp` | — | Verify the OTP and return a short-lived reset token. |
| POST | `/auth/password-reset/confirm` | — | Set a new password with the reset token. |

### Register payload
```json
{ "email": "user@example.com", "password": "...", "confirm_password": "...", "full_name": "...", "phone": "+232...", "role": "tenant|landlord|agent" }
```

`confirm_password` is recommended and validated when supplied; it remains optional for compatibility with existing API clients.

### OTP rules
- 6 digits, 10-minute TTL
- Max 5 validation attempts before invalidation
- 60-second resend cooldown

---

## Users (`/users`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET/PATCH | `/users/me` | Bearer | Get or update own profile. |
| GET | `/users/{id}` | — | Public user profile (role, listings count, verified status). |

### Role capabilities

| Role | Primary capabilities |
|------|----------------------|
| `tenant` | Browse, save, receive recommendations, and enquire about approved listings. |
| `landlord` | Create and manage their own verified property listings and answer tenant enquiries. |
| `agent` | Create and manage verified listings on behalf of landlords and answer tenant enquiries as the listing contact. |
| `admin` | Review verifications/listings, moderate users and reports, and handle support. |

`Listing.owner` is the account managing a listing, so it can be either a landlord or an agent. Public listing responses include `owner_role` for accurate labels.

---

## Verification (`/verification`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/verification/` | Bearer (non-admin) | Upload ID document(s) for identity verification. |
| GET | `/verification/me` | Bearer (non-admin) | View own verification status. |
| GET | `/admin/verifications/` | Bearer (admin) | List pending verifications. |
| POST | `/admin/verifications/{id}/decision` | Bearer (admin) | Approve or reject. Body: `{"decision":"approved"|"rejected","notes":"..."}` |

---

## Listings (`/listings`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/listings` | Optional | Browse approved listings. Supports filtering & sort. |
| POST | `/listings` | Bearer (verified landlord or agent) | Create a listing (starts as `draft`). Agents use this to manage properties on behalf of landlords. |
| GET | `/listings/{id}` | Optional | Get approved listing detail. Unpublished listings are visible only to their owner and admins. Tenant views are logged (deduped 24h per user). |
| PATCH | `/listings/{id}` | Bearer (owner) | Update listing. |
| DELETE | `/listings/{id}` | Bearer (owner or admin) | Soft-archive listing. |
| POST | `/listings/{id}/submit` | Bearer (owner) | Submit for review (`draft` → `pending`). Requires ≥1 ready panorama. |
| GET | `/admin/listings` | Bearer (admin) | Pending approval queue. |
| POST | `/admin/listings/{id}/decision` | Bearer (admin) | Approve or reject. `{"decision":"approved"|"rejected","notes":"..."}` |

### Listing filters (GET `/listings`)
| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Full-text search (PostgreSQL FTS / SQLite icontains fallback) |
| `owner_id` | UUID | Approved listings managed by one landlord or agent |
| `area` | enum (multi) | `aberdeen`, `lumley`, `goderich`, `hill_station`, `wilberforce`, `murray_town`, `brookfields`, `kissy`, `wellington`, `calaba_town`, `other` |
| `min_price` / `max_price` | integer | Annual price in SLE or USD |
| `min_bedrooms` / `max_bedrooms` | integer | Bedroom count |
| `property_type` | enum (multi) | `apartment`, `house`, `studio`, `room`, `commercial` |
| `currency` | `SLE` \| `USD` | Currency filter |
| `sort` | string | `-created_at` (default), `price_annual`, `-price_annual`, `bedrooms` |

### Listing status flow
```
draft → pending → approved → rented | expired | archived
              ↘ rejected
```

### Pricing note
All prices are **annual** (`price_annual` integer field). Display conversion is the frontend's responsibility.

---

## Panoramas (`/listings/{listing_id}/panoramas`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/listings/{listing_id}/panoramas` | Optional | List panoramas for listing. |
| POST | `/listings/{listing_id}/panoramas` | Bearer (owner) | Upload panorama. Returns 202; processing is async. |
| GET | `/listings/{listing_id}/panoramas/{id}` | Optional | Get panorama detail + tile config URL. |
| DELETE | `/listings/{listing_id}/panoramas/{id}` | Bearer (owner) | Delete panorama + enqueue S3 cleanup. |

### Panorama pipeline (async, Celery)
1. ClamAV virus scan (503 if service down)
2. EXIF strip (piexif)
3. Projection detect — equirectangular (2:1 ratio) or cylindrical (4:1)
4. Pannellum tile pyramid generation
5. S3 upload: `panoramas/{id}/tiles/`, `…/original.jpg`, `…/thumbnail.jpg`, `…/preview.jpg`
6. Status → `ready`; `panorama.ready` notification pushed via WebSocket

### Panorama statuses: `pending` → `processing` → `ready` | `failed`

---

## Conversations & Messaging (`/conversations`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/conversations` | Bearer | List user's conversations. |
| POST | `/conversations` | Bearer (tenant) | Start a conversation with the listing's landlord or agent. Send `provider_id` (preferred) or the legacy `landlord_id`; when a `listing_id` is supplied, its owner is the recipient. |
| GET | `/conversations/{id}/messages` | Bearer (participant) | Cursor-paginated message history (newest first). |
| POST | `/conversations/{id}/messages` | Bearer (participant) | Send message (REST fallback; prefer WebSocket). |

### WebSocket
```
wss://<host>/ws/conversations/{id}/
Sec-WebSocket-Protocol: bearer, <access_token>
```
- Server accepts with `Sec-WebSocket-Protocol: bearer`
- Auth failure: close code **4401**
- Per-connection rate limit: **20 messages / 10 seconds**
- Message deduplication via `client_key` (UUID generated by client)

### WebSocket message frame
```json
{ "type": "chat.message", "body": "Hello!", "client_key": "<uuid>" }
```

---

## Chatbot (`/chatbot`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/chatbot/query` | Optional | Query the retrieval-based chatbot. |

### Request / Response
```json
// Request
{ "message": "how does verification work?" }

// Response
{
  "intent": "verification_process",
  "confidence": 0.78,
  "reply": "To get verified as a landlord, you need to...",
  "followups": ["What documents do I need?"]
}
```

Threshold: **0.3** cosine similarity (tuned down from the original 0.45, which routed most real questions to fallback). Below threshold → `intent: null` + generic fallback message.

**Deviation from brief:** the brief specifies a pure retrieval-based chatbot with no LLM calls. This implementation adds an optional local-LLM rewrite layer (`apps/chatbot/llm.py`, Qwen2.5-1.5B-Instruct via `llama-cpp-python`, no external API) on top of the TF-IDF retriever: the retriever still picks the intent/facts, but if the model is downloaded and loads successfully, its grounded, context-aware phrasing replaces the canned template reply. If the model is absent or fails to load, `generate_reply` returns `None` and the response falls back to the retriever's templated reply unchanged — so the contract's response shape (`intent`, `confidence`, `followups`) is unaffected either way. This was a deliberate, accepted tradeoff (free, local, no per-message cost) rather than an oversight.

Rate limit: **20 requests / minute**.

---

## Recommendations (`/recommendations`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/recommendations` | Bearer (tenant) | Personalised listing recommendations. |
| GET | `/preferences/me` | Bearer (tenant) | Get current search preferences. |
| PUT | `/preferences/set` | Bearer (tenant) | Replace search preferences. |

### Algorithm
- TF-IDF over listing text + attributes
- User vector = mean of saved + viewed + inquiry interactions (last 50 views)
- Cold start: filter by `SearchPreference` if set, else top-20 recent approved listings

---

## Saved Listings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/saved/` | Bearer (tenant) | List saved listings. |
| POST | `/listings/{id}/save` | Bearer (tenant) | Save listing. Triggers recommender recompute (30s delay). |
| DELETE | `/listings/{id}/save` | Bearer (tenant) | Unsave listing. |

---

## Fraud Reports (`/reports`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/reports` | Bearer | Submit fraud report for a listing. |
| GET | `/admin/reports` | Bearer (admin) | List all reports. |
| POST | `/admin/reports/{id}/resolve` | Bearer (admin) | Resolve or dismiss. `{"status":"resolved"|"dismissed","notes":"..."}` |

### Report reasons
Listing reasons: `fake_listing` · `misleading` · `scam` · `wrong_price` · `not_available`
User-conduct reasons (reporting a person directly, e.g. from a conversation): `harassment` · `abusive_behavior` · `non_payment` · `property_damage` · `unresponsive`
Either kind: `other`

---

## Notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/notifications` | Bearer | List notifications (unread first). |
| POST | `/notifications/{id}/read` | Bearer | Mark one notification as read. |
| POST | `/notifications/read-all` | Bearer | Mark all as read. |

### WebSocket
```
wss://<host>/ws/notifications/
Sec-WebSocket-Protocol: bearer, <access_token>
```

### Notification frame
```json
{ "type": "notification.new", "id": 42, "notification_type": "panorama.ready", "payload": {...}, "created_at": "..." }
```

---

## Idempotency

For `POST` endpoints that support it, include:
```
Idempotency-Key: <UUID>
```

| Scenario | Response |
|----------|----------|
| First request | Normal response + persisted |
| Same key + same body | Replay stored response |
| Same key + different body | `422 Unprocessable Entity` |
| Same key, still in progress | `409 Conflict` |
| After 24 hours | Key expired — treated as new |

---

## Rate Limits

| Scope | Limit |
|-------|-------|
| `auth` | 10 / minute |
| `chatbot` | 20 / minute |
| `messaging` | 60 / minute |
| `upload` | 20 / hour |
| `read` | 600 / minute |
| Anonymous | 60 / minute |
| Authenticated | 240 / minute |
| WebSocket per-connection | 20 messages / 10 seconds |

Rate limits are Redis-backed (shared across workers).

---

## Error Format

All errors follow DRF's default structure:
```json
{ "detail": "..." }
// or for field errors:
{ "field_name": ["error message"] }
```

Common status codes:
- `400` — Validation error
- `401` — Authentication required
- `403` — Permission denied
- `404` — Not found
- `409` — Idempotency conflict (in-progress)
- `422` — Idempotency body mismatch
- `429` — Rate limit exceeded
- `503` — ClamAV antivirus unavailable

---

## Storage

- Files served via **presigned S3 URLs** (24-hour expiry)
- Panorama tiles: `panoramas/{id}/tiles/`
- Verification documents: `verification/{user_id}/{filename}`
- Recommender model: `<MEDIA_ROOT>/recommender/current.pkl` (symlink)

---

*Generated from `docs/openapi.yaml` — regenerate with `make schema`.*
