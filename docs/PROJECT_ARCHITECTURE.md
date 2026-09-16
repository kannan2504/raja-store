# Raja Store — Project Architecture

> Last updated: 2026-09-15
> Source: Senior architect inspection of all source files

---

## 1. Project Structure

```
d:\Raja store\
├── .env                          ← Root env (VITE_ frontend vars + shared backend defaults)
├── .env.example                  ← Vite env variable reference
├── .gitignore
├── index.html                    ← SPA HTML shell (no favicon, no meta description)
├── package.json                  ← Monorepo root: all deps + all scripts
├── vite.config.ts                ← Vite config (proxy: /api → http://localhost:5000)
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── docs/                         ← This documentation directory
│
├── src/                          ← Frontend (React 19 / Vite / TypeScript)
│   ├── main.tsx                  ← Entry point: CartProvider wraps App
│   ├── App.tsx                   ← ALL pages + hooks in one file (~34KB)
│   ├── AdminPage.tsx             ← Admin dashboard component
│   ├── DevDatabasePage.tsx       ← Dev-only DB verification page
│   ├── index.css                 ← Core styles (15KB)
│   ├── checkout.css
│   ├── phase3-ux.css
│   ├── phase4-payment.css
│   ├── admin.css
│   ├── dev-database.css
│   ├── context/
│   │   └── CartContext.tsx       ← Cart state (localStorage-backed React context)
│   ├── services/
│   │   ├── productService.ts     ← GET /api/products + demo fallback
│   │   ├── orderService.ts       ← POST /api/orders + POST /api/orders/track
│   │   ├── adminService.ts       ← All /api/admin/* calls
│   │   └── developmentService.ts ← GET /api/dev/database-status
│   ├── types/
│   │   └── product.ts            ← Product, ProductVariant, Category TypeScript types
│   └── utils/
│       └── format.ts             ← formatPrice(), getDiscountPercent()
│
└── server/                       ← Backend (Express 5 / Mongoose 9 / TypeScript)
    ├── .env                      ← Server env (authoritative; overrides root .env)
    ├── .env.example
    ├── tsconfig.json
    ├── README.md
    ├── private/
    │   ├── payment-proofs/       ← UPI screenshots (NOT web-accessible; git-ignored)
    │   └── product-images/       ← Product images (NOT web-accessible; git-ignored)
    ├── tests/
    │   ├── orderService.test.ts
    │   ├── phase4.test.ts
    │   ├── orderNotification.test.ts
    │   ├── mongoPersistence.test.ts
    │   └── developmentVerification.test.ts
    └── src/
        ├── appFactory.ts         ← Express app factory (dependency injection root)
        ├── server.ts             ← Entrypoint: DB connect → pick repos → listen
        ├── seed.ts               ← One-shot seed script (dev only)
        ├── config/
        │   ├── env.ts            ← Zod-validated env schema (single source of truth)
        │   └── database.ts       ← Mongoose connect/disconnect/status helpers
        ├── models/
        │   ├── productModel.ts   ← TypeScript types: ServerProduct, CatalogProduct
        │   ├── productDocument.ts← Mongoose schema + ProductModel
        │   ├── orderModel.ts     ← TypeScript type: Order
        │   ├── orderDocument.ts  ← Mongoose schema + OrderModel
        │   └── counterDocument.ts← Mongoose Counter (sequential order IDs)
        ├── repositories/
        │   ├── productRepository.ts      ← Interface + InMemoryProductRepository
        │   ├── mongoProductRepository.ts ← MongoProductRepository (production)
        │   ├── orderRepository.ts        ← Interface + InMemoryOrderRepository
        │   ├── mongoOrderRepository.ts   ← MongoOrderRepository (production)
        │   └── developmentRepository.ts  ← DevelopmentProduct/Order type definitions
        ├── services/
        │   ├── orderService.ts           ← Core business logic (order creation + tracking)
        │   ├── orderNotification.ts      ← Email + WhatsApp notification services
        │   ├── productImageStorage.ts    ← LocalProductImageStorage (upload/get/delete)
        │   ├── paymentProofStorage.ts    ← LocalPrivatePaymentProofStorage
        │   └── imageValidation.ts        ← Magic-byte file signature validation
        ├── controllers/
        │   ├── productController.ts      ← GET /api/products, image serving
        │   ├── orderController.ts        ← POST /api/orders
        │   ├── trackingController.ts     ← POST /api/orders/track
        │   ├── paymentController.ts      ← GET /api/payment-config
        │   ├── adminController.ts        ← All /api/admin/* handlers
        │   ├── adminProofController.ts   ← GET /api/admin/orders/:id/payment-proof
        │   └── developmentController.ts  ← GET /api/dev/*
        ├── routes/
        │   ├── adminRoutes.ts            ← /api/admin/* router
        │   ├── createOrderRoutes.ts      ← /api/orders/* factory (receives repos)
        │   ├── orderRoutes.ts            ← DEAD CODE — never mounted by appFactory
        │   └── developmentRoutes.ts      ← /api/dev/* router (dev-only)
        ├── middleware/
        │   ├── adminAuth.ts              ← Bearer token auth guard
        │   └── errorHandler.ts           ← Global Express error handler
        ├── validators/
        │   └── adminProduct.ts           ← Zod schemas for admin product CRUD
        └── utils/
            └── httpError.ts              ← HttpError class (status, code, message)
```

---

## 2. Frontend Architecture

### Technology Stack
| Concern | Technology |
|---------|-----------|
| Framework | React 19 (latest) + TypeScript |
| Routing | React Router DOM v7 |
| Build | Vite (latest) |
| Icons | lucide-react |
| State | React useState / useContext only (no Redux, no Zustand) |
| Styling | Vanilla CSS (5 separate CSS files) |
| Cart | localStorage (`raja-store-cart`) |
| Favorites | localStorage (`raja-store-favourites`) |
| Tracking session | sessionStorage (`raja-store-tracking-lookup`) |
| Admin token | sessionStorage (`raja-admin-token`) |

### Entry Point Chain
```
index.html
  -> src/main.tsx
     -> <CartProvider>          (CartContext.tsx)
        -> <App>                (App.tsx)
           -> <BrowserRouter>
              -> <Routes>       (all pages defined inline)
```

### Route Map

| Path | Component | Notes |
|------|-----------|-------|
| `/` | `HomePage` | Hero, value strip, category links |
| `/products` | `ProductsPage` | Catalog: filter, sort, search (client-side) |
| `/product/:slug` | `ProductPage` | Detail: gallery, variants, add to bag |
| `/cart` | `CartPage` | Cart view with order summary |
| `/checkout` | `CheckoutPage` | Customer form + COD/UPI payment |
| `/order-success/:orderId` | `OrderSuccessPage` | Confirmation |
| `/order-failure` | `OrderFailurePage` | Failure with retry link |
| `/track-order` | `TrackOrderPage` | Guest tracking by orderId + phone |
| `/dev/database` | `DevDatabasePage` | Dev-only DB status (hidden in prod) |
| `/admin` | `AdminPage` | Admin dashboard (token-gated) |

### Key Custom Hooks (all in App.tsx)
- `useCatalog()` — fetches `/api/products` on mount; re-fetches on `raja-store-products-invalidated` window event
- `useFavourites()` — localStorage-backed set of liked product IDs

### Important Frontend Behaviours
- **Cart subtotal uses cached frontend price** (`item.product.price * item.quantity`) — server always recalculates and ignores client prices
- **Stock validation is client-side only** — based on last catalog fetch, not real-time
- **After successful checkout** — dispatches `raja-store-products-invalidated` event to trigger catalog refresh
- **Checkout redirects to `/cart`** if cart is empty and form was not just submitted

---

## 3. Backend Architecture

### Technology Stack
| Concern | Technology |
|---------|-----------|
| Runtime | Node.js via `tsx` (dev) / `tsc` (prod) |
| Framework | Express 5.2.x |
| Database ORM | Mongoose 9.x |
| Validation | Zod 4.x |
| File upload | Multer 2.x (memory storage) |
| Email | Nodemailer (Gmail SMTP) |
| Rate limiting | express-rate-limit 8.x |
| Security headers | Helmet 8.x |
| Testing | Vitest + Supertest + mongodb-memory-server |

### Dependency Injection Pattern
`makeApp(products: ProductRepository, orders: OrderRepository)` in `appFactory.ts` is the composition root. It receives repository implementations as parameters — enabling production (Mongo) and test (InMemory) modes without changing any business logic.

```
server.ts
  -> connectDatabase()
  -> if connected: makeApp(MongoProductRepository, MongoOrderRepository)
  -> if failed:    makeApp(InMemoryProductRepository, InMemoryOrderRepository)
  -> app.listen(PORT)
```

### Request Pipeline
```
HTTP Request
  -> Helmet (security headers)
  -> CORS (allow FRONTEND_URL only)
  -> express.json (50 KB body limit)
  -> [Rate limiter — order/tracking routes only]
  -> [Multer — multipart routes only]
  -> [requireAdmin — /api/admin/* only]
  -> Controller function
  -> Service (business logic)
  -> Repository (data access)
  -> MongoDB or InMemory store
  -> JSON response
  -> [errorHandler — global fallback for unhandled errors]
```

### Environment Loading
`env.ts` loads root `.env` first, then `server/.env` with `override: true`. Parsed and validated by Zod at startup — the server will not start with invalid env. `server/.env` always wins for backend config values.

---

## 4. Database / Repository Architecture

### MongoDB Collections

#### `products`
```
productId        String   unique, indexed  ("prod_<16 hex chars>")
name             String   required
slug             String   unique, indexed
description      String   required
shortDescription String   required
sku              String   unique, indexed
category         Object   { slug, name }
price            Number   required, >= 0
compareAtPrice   Number   optional
discount         Number   optional (DEAD FIELD — never written by application code)
stock            Number   required, >= 0 (base stock; ignored if variants present)
images           [String] UUID filenames e.g. "abc-123.jpg"
variants         [Object] { id, sku, label, price?, stock, options: Map<string,string> }
active           Boolean  indexed (false = soft-deleted)
rating           Number   optional
isNew            Boolean  optional
isBestSeller     Boolean  optional
tone             String   optional (CSS class hint for storefront)
createdAt        Date     auto
updatedAt        Date     auto
```

#### `orders`
```
orderId             String   unique, indexed  ("ORD-YYYY-NNNNNN")
idempotencyKey      String   unique, indexed  (prevents duplicate orders)
trackingTokenHash   String   indexed          (SHA-256 hash — NEVER sent to clients)
customer            Object   { fullName, phone(indexed), email?, address, city, state, pincode, notes? }
items               [Object] { productId, productNameSnapshot, skuSnapshot, quantity, unitPrice, lineTotal, variant? }
pricing             Object   { subtotal, deliveryCharge, discount, total }
payment             Object   { method, status, utrNumber|null, proofFileId|null, verifiedAt|null, verifiedBy|null }
orderStatus         String   indexed
notification        Object   { orderCreated: { status, event, sentAt } }
createdAt           Date     auto, indexed DESC
updatedAt           Date     auto
```

Payment method values: `'cod'` | `'manual_upi'`
Payment status values: `'pending'` | `'pending_verification'` | `'paid'` | `'failed'` | `'rejected'`
Order status values: `'pending'` | `'confirmed'` | `'processing'` | `'shipped'` | `'out_for_delivery'` | `'delivered'` | `'cancelled'`

#### `counters`
```
_id    String   e.g. "orders-2026"
value  Number   atomically incremented via $inc + upsert
```
Used to generate sequential order IDs (`ORD-2026-000001`, `ORD-2026-000002`, ...).

### Repository Interface Contract

**ProductRepository** (`productRepository.ts`):
- `findByIds(ids)` — used by order service for price lookup
- `getCatalogProducts()` — public storefront catalog
- `getProductCount()` — dev page
- `getRecentProducts(limit)` — dev page
- `reserveStock(items)` — atomic stock decrement; returns false if any item unavailable
- `releaseStock(items)` — rollback reserved stock on order failure
- `getStockSnapshot(items)` — current stock for notification formatter

**OrderRepository** (`orderRepository.ts`):
- `findByIdempotencyKey(key)` — idempotency check before creating
- `findByOrderId(orderId)` — tracking + admin detail
- `create(order)` — persist new order
- `nextOrderId(year)` — atomic sequential ID
- `getOrderCount()` — dev page
- `getRecentOrders(limit)` — dev page
- `claimOrderCreatedNotification(orderId)` — atomic claim; returns false if already sent

### Two Implementations Per Repository

| Repository | InMemory (dev/test) | Mongo (production) |
|-----------|--------------------|--------------------|
| Product | `productRepository.ts` | `mongoProductRepository.ts` |
| Order | `orderRepository.ts` | `mongoOrderRepository.ts` |

Both implement the same interface. `makeApp()` selects based on DB connection status.

---

## 5. Product / Image Flow

### Upload Flow (Admin → Storage)

```
AdminPage.tsx (browser)
  -> Product form submit: FormData with:
     - product: JSON string (all product fields)
     - imageOrder: JSON string (["file:0", "file:1", "ref:existing-uuid.ext", ...])
     - images: File[] (each file as multipart field named "images")
  -> POST /api/admin/products   (or PATCH /api/admin/products/:id)
  -> multer (memory storage, 5MB per file, max 5 files)
  -> requireAdmin middleware
  -> adminController.makeAdminProductController(storage).create()
     -> multipartProductBody(): parses product JSON + imageOrder JSON from body
     -> storage.upload(file) per uploaded file:
        -> validates size <= 5MB
        -> validates extension in [jpg, jpeg, png, webp]
        -> validates mimetype matches extension
        -> validates magic bytes (binary signature in file buffer)
        -> writes to server/private/product-images/{uuid}.{ext} (mode 0o600)
        -> returns reference string: "{uuid}.{ext}"
     -> maps imageOrder tokens to final references:
        - "file:N" -> reference from uploaded files array
        - "ref:existing" -> passthrough (keep existing image)
     -> adminProductSchema.parse() (Zod validation)
     -> ProductModel.create() / findOneAndUpdate()
```

### Serve Flow (MongoDB → Storefront)

```
GET /api/products
  -> MongoProductRepository.getCatalogProducts()
     -> ProductModel.find({ active: true }).sort({ createdAt: -1 })
     -> images[] mapped to: "/api/products/{productId}/images/{reference}"
  -> Response: products array with full image URLs

Browser renders <img src="/api/products/.../images/uuid.jpg" />

GET /api/products/:productId/images/:reference
  -> makeProductImageController(storage)
     -> storage.get(reference):
        -> validates reference against /^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i
           (path traversal protection — rejects "../" and similar)
        -> createReadStream(server/private/product-images/{reference})
     -> sets Cache-Control: public, max-age=31536000, immutable
     -> pipes stream to response
```

### Image Token System (PATCH/Update)
`imageOrder` array entries:
- `"file:0"`, `"file:1"`, ... — newly uploaded files (index into FormData files array)
- `"ref:{uuid}.{ext}"` — keep an existing stored image

Entries NOT in the new `imageOrder` are deleted from disk. Entries present in old images but absent from new `imageOrder` are passed to `storage.delete()`.

---

## 6. Order / Payment Flow

### Full Order Creation Sequence

```
1. CartPage: user reviews items
   - Stock check is CLIENT-SIDE ONLY against last catalog fetch

2. CheckoutPage: user fills form + selects payment
   - COD: fills form and submits
   - manual_upi: pays externally via UPI, gets UTR, takes screenshot, uploads

3. Frontend createOrder() (src/services/orderService.ts):
   - Builds FormData: items (JSON), customer (JSON), paymentMethod, utrNumber?, paymentProof?
   - Generates idempotency key: crypto.randomUUID()
   - Sends: POST /api/orders with header Idempotency-Key: {key}

4. Express: rate-limited (20 requests / 15 min), multer (single file, 5MB)

5. orderController.makeCreateOrderController():
   - Parses multipart body
   - If file present: validatePaymentProof() magic-byte check -> paymentProofStorage.upload()
   - createOrderSchema.parse() — Zod validates all fields
   - Calls orderService.createOrder(input, idempotencyKey)

6. OrderService.createOrder():
   a. Idempotency: findByIdempotencyKey() — if found, re-notify and return existing order
   b. Validate: manual_upi requires both utrNumber AND proofFileId
   c. findByIds() — validates all products exist and are active
   d. Build items: server-side price lookup — CLIENT PRICES ARE IGNORED
   e. Calculate subtotal — enforce MINIMUM_ORDER_VALUE (Rs.200)
   f. reserveStock() — atomic MongoDB findOneAndUpdate with $gte stock check
      - If any item fails: rollback all previously reserved items
   g. Generate tracking token: randomBytes(32) -> SHA-256 -> store hash only
   h. nextOrderId(year) — atomic counter increment -> "ORD-2026-NNNNNN"
   i. Set payment.status: COD -> 'pending', UPI -> 'pending_verification'
   j. orders.create() — persist to MongoDB
   k. notifyOrderCreated() — claim atomically -> send email + WhatsApp

7. Response: { orderId, total, status, paymentMethod, paymentStatus }

8. Frontend:
   - navigate to /order-success/:orderId
   - clearCart()
   - dispatch 'raja-store-products-invalidated' (triggers catalog re-fetch)
```

### COD Workflow
- Order created with `payment.status = 'pending'`
- Admin reviews order and manually updates order status
- No automated payment verification

### Manual UPI Workflow
- Order created with `payment.status = 'pending_verification'`
- Admin views proof: GET `/api/admin/orders/:orderId/payment-proof`
- Admin verifies: PATCH `/api/admin/orders/:orderId/payment` → `{ paymentStatus: 'paid' }`
- Admin rejects: PATCH `/api/admin/orders/:orderId/payment` → `{ paymentStatus: 'rejected' }`

### Stock Reservation (MongoDB atomic operations)
```javascript
// Product-level stock:
filter = { productId, active: true, stock: { $gte: quantity } }
update = { $inc: { stock: -quantity } }
// findOneAndUpdate — atomic; returns null if stock insufficient

// Variant-level stock:
filter = { productId, active: true, variants: { $elemMatch: { id: variantId, stock: { $gte: quantity } } } }
update = { $inc: { 'variants.$.stock': -quantity } }
// Uses positional $ operator — requires $elemMatch in filter
```

If any item's reservation fails, previously reserved items are rolled back in a loop.

### Guest Order Tracking
- Input: `orderId` + `phone`
- Server verifies: `order.customer.phone === phone`
- Returns: status, payment method/status, items, pricing, shippingAddress
- Deliberately omits: `proofFileId`, `trackingTokenHash`, `idempotencyKey`, `email`, `notes`

### Idempotency
- Key generated: `crypto.randomUUID()` per submit attempt (frontend)
- Sent as: `Idempotency-Key` request header
- Server: stores as `idempotencyKey` in MongoDB (unique index enforced)
- On duplicate: returns existing order + re-triggers notification safely

---

## 7. Admin Architecture

### Authentication
- Type: Static Bearer token
- Header: `Authorization: Bearer <ADMIN_API_TOKEN>`
- Middleware: `requireAdmin` — exact string comparison against `env.ADMIN_API_TOKEN`
- Client storage: `sessionStorage` key `raja-admin-token` (clears on tab close)
- No JWT, no expiry, no refresh tokens

### Admin Dashboard UI (`AdminPage.tsx`)
Two tabs:

**Orders tab** (`OrdersPanel`):
- Table of all orders (server limit: 100, no pagination)
- Click row → loads full order detail via GET `/api/admin/orders/:id`
- Inline order status dropdown → PATCH `/api/admin/orders/:id/status`
- "Verify payment" / "Reject payment" buttons (UPI orders only)

**Inventory tab** (`InventoryPanel`):
- Products table with Edit / Stock buttons
- Product create/edit form (fields: name, slug, sku, price, compareAtPrice, stock, category, description, shortDescription, active checkbox)
- Image manager: upload, preview, reorder (← →), remove
- Stock quick-update via `window.prompt()` (known UX debt)

### Admin API Routes (`adminRoutes.ts`)
All routes under `/api/admin/` are protected by `requireAdmin` middleware applied at router level.

| Method | Path | Handler |
|--------|------|---------|
| GET | `/orders` | `listAdminOrders` |
| GET | `/orders/:orderId` | `getAdminOrder` |
| GET | `/orders/:orderId/payment-proof` | `makeAdminProofController` |
| PATCH | `/orders/:orderId/status` | `updateAdminOrder` |
| PATCH | `/orders/:orderId/payment` | `updateAdminPayment` |
| GET | `/products` | `listAdminProducts` |
| POST | `/products` | `makeAdminProductController().create` |
| PATCH | `/products/:productId` | `makeAdminProductController().update` |
| PATCH | `/products/:productId/stock` | `updateAdminStock` |

---

## 8. API Map

| Method | Path | Auth | Rate Limited | Notes |
|--------|------|------|-------------|-------|
| GET | `/api/health` | None | No | Health check |
| GET | `/api/payment-config` | None | No | Returns storeName, upiId, qrUrl |
| GET | `/api/products` | None | No | Active products catalog |
| GET | `/api/products/:productId/images/:reference` | None | No | Image file stream |
| POST | `/api/orders` | None | Yes (20/15min) | Create order, multipart |
| POST | `/api/orders/track` | None | Yes (20/15min) | Guest tracking |
| GET | `/api/admin/orders` | Bearer | No | Last 100 orders |
| GET | `/api/admin/orders/:orderId` | Bearer | No | Full order detail |
| GET | `/api/admin/orders/:orderId/payment-proof` | Bearer | No | Stream proof image |
| PATCH | `/api/admin/orders/:orderId/status` | Bearer | No | Update order status |
| PATCH | `/api/admin/orders/:orderId/payment` | Bearer | No | Update payment status |
| GET | `/api/admin/products` | Bearer | No | All products (inc. inactive) |
| POST | `/api/admin/products` | Bearer | No | Create product, multipart |
| PATCH | `/api/admin/products/:productId` | Bearer | No | Update product, multipart |
| PATCH | `/api/admin/products/:productId/stock` | Bearer | No | Stock update only |
| GET | `/api/dev/database-status` | None | No | Dev only; 404 in prod |
| GET | `/api/dev/orders` | None | No | Dev only; 404 in prod |

---

## 9. Environment / Configuration

### Env File Precedence (backend)
1. Root `.env` is loaded first
2. `server/.env` is loaded with `override: true` — always wins for backend values
3. Validated at startup by Zod — server refuses to start on invalid config

### Frontend Variables (root `.env`, `VITE_` prefix required)

| Variable | Default | Used In |
|----------|---------|---------|
| `VITE_API_BASE_URL` | `http://localhost:5000` | All frontend API calls |
| `VITE_DELIVERY_CHARGE` | `50` | `CheckoutPage.tsx` display only |
| `VITE_PUBLIC_STORE_NAME` | `Raja Store` | Unused currently |
| `VITE_ENABLE_CHATBOT` | `false` | Feature flag (chatbot not built) |

> **WARNING**: `VITE_DELIVERY_CHARGE` is used only for *display*. The server's `DELIVERY_CHARGE` is what gets charged. These must be kept in sync manually.

### Backend Variables (`server/.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `development` | Dev routes enabled when `development` |
| `PORT` | `5000` | Express listen port |
| `DATABASE_URL` | `mongodb://127.0.0.1:27017/raja-store` | MongoDB URI |
| `PERSISTENCE_MODE` | `mongo` | `mongo` or `memory` |
| `FRONTEND_URL` | `http://localhost:5173` | CORS allowed origin |
| `DELIVERY_CHARGE` | `50` | **Authoritative** delivery charge |
| `MINIMUM_ORDER_VALUE` | `200` | Minimum cart value |
| `MAX_ITEM_QUANTITY` | `100` | Max quantity per line item |
| `STORE_NAME` | `Raja Store` | Used in notifications |
| `STORE_UPI_ID` | `yourupi@upi` | Shown to customers at checkout |
| `STORE_UPI_QR_URL` | Placeholder URL | QR code image URL |
| `ADMIN_API_TOKEN` | `development-admin-token` | Admin Bearer token |
| `ADMIN_NOTIFICATION_EMAIL` | (set) | Admin email for order alerts |
| `ADMIN_NOTIFICATION_WHATSAPP` | (empty) | WhatsApp number (not implemented) |
| `GMAIL_SMTP_USER` | (set) | Gmail sender address |
| `GMAIL_SMTP_APP_PASSWORD` | (set) | Gmail App Password (not account password) |

> **SECURITY**: Real Gmail credentials are in `server/.env`. This file is git-ignored but must never be accidentally committed.

---

## 10. Important Dependencies Between Systems

### Frontend → Backend
- All API calls go through `src/services/` — these are the only files that call `fetch()`
- `productService.ts` uses `VITE_API_BASE_URL` as base URL
- `orderService.ts` sends multipart FormData with `Idempotency-Key` header
- `adminService.ts` sends `Authorization: Bearer {token}` header on all calls
- Vite dev proxy rewrites `/api/*` to `http://localhost:5000/api/*` — no CORS in dev

### Backend → Database
- `appFactory.ts` receives repository instances — it does NOT create them
- `server.ts` creates the right repository based on DB connection success
- Repository interface guarantees both InMemory and Mongo behave identically
- `orderService.ts` depends on BOTH `ProductRepository` AND `OrderRepository`

### Admin Product Form → Image Storage → Storefront
- Admin uploads files → `LocalProductImageStorage` stores in `server/private/product-images/`
- MongoDB stores only the filename reference (UUID.ext string)
- `getCatalogProducts()` transforms references into full API URLs
- Storefront fetches images via `/api/products/:id/images/:ref`
- Image URL is immutable (Cache-Control: 1 year) — content changes require new UUID

### Order → Stock → Notification
- `reserveStock()` must succeed before order is created
- If `orders.create()` throws, `releaseStock()` is called to undo reservation
- `notifyOrderCreated()` runs after `orders.create()` — notification failure does NOT fail the order
- `claimOrderCreatedNotification()` is atomic — notification sent exactly once even on retry

---

## 11. Protected / Risky Areas

These sections of code should **not be modified casually**. Changes require careful review and testing.

### CRITICAL — Do Not Touch Without Full Review

| File | Risk | Reason |
|------|------|--------|
| `server/src/services/orderService.ts` | Very High | Stock reservation rollback, idempotency, server-side pricing — all in one function |
| `server/src/repositories/mongoProductRepository.ts` `reserveStock()` | Very High | Atomic MongoDB operations; incorrect positional operator use will cause data corruption |
| `server/src/repositories/mongoOrderRepository.ts` `claimOrderCreatedNotification()` | High | Atomic claim pattern; breaking this causes duplicate notifications |
| `server/src/services/productImageStorage.ts` `get()` | High | Path traversal protection regex — any relaxation is a security vulnerability |
| `server/src/middleware/adminAuth.ts` | High | Only auth gate for admin routes |

### HIGH CAUTION — Test Thoroughly Before Changing

| File | Risk | Reason |
|------|------|--------|
| `server/src/controllers/adminController.ts` `makeAdminProductController()` | High | Image upload/update/delete orchestration; orphan file risk on error |
| `server/src/services/orderNotification.ts` | Medium | Gmail credentials used; bad change can stop all order notifications |
| `server/src/config/env.ts` | Medium | Zod schema change can break server startup |
| `src/services/orderService.ts` (frontend) | Medium | Idempotency key generation; multipart form construction |

### STABLE — Lower Risk

| Area | Notes |
|------|-------|
| `src/context/CartContext.tsx` | Self-contained; localStorage-backed |
| `server/src/controllers/productController.ts` | Very thin; just calls repository and pipes stream |
| `server/src/controllers/paymentController.ts` | Single env read, one response |
| `server/src/controllers/trackingController.ts` | Simple Zod parse + service call |
| CSS files | No logic; purely presentational |
