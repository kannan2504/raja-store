# Raja Store — Development Status

> Last updated: 2026-09-15
> Status: Stable core; minor feature gaps and technical debt

---

## 1. Completed Functionality

### Storefront (Frontend)
- **Product catalog**: Fetches from API with demo data fallback
- **Product detail page**: Full image gallery with touch swipe, variant selection, quantity, add to bag
- **Favorites**: localStorage persistence for liked products
- **Shopping cart**: localStorage persistence, quantity management, variant tracking, subtotal
- **Checkout form**: Full customer detail fields with validation
- **COD payment**: End-to-end order placement
- **Manual UPI payment**: End-to-end with UTR input and screenshot upload
- **Order confirmation**: Success and failure screens with retry logic
- **Guest order tracking**: orderId + phone verification to view status safely

### Admin Dashboard (Frontend)
- **Authentication**: Bearer token login (sessionStorage)
- **Orders panel**: List view, detailed view, status update dropdown
- **Payment verification**: Verify/reject UPI screenshots (streams securely from server)
- **Inventory panel**: List all products, quick stock update, product create/edit form
- **Image manager**: Upload up to 5 images, preview, reorder, remove

### Backend System
- **Server-side pricing**: Client prices ignored; subtotal/total recalculated securely
- **Stock reservation**: Atomic MongoDB operations with rollback on failure
- **Minimum order value**: Enforced on server (₹200)
- **Idempotency**: Duplicate order prevention via Idempotency-Key header
- **Rate limiting**: 20 requests/15min on order creation and tracking
- **Payment proof storage**: Secure server-side private storage (no public access)
- **Image processing**: Multipart upload with magic-byte validation, extension/MIME checks
- **Image serving**: Protected endpoint with path traversal prevention and immutable caching
- **Email notifications**: Gmail SMTP integration on order creation
- **Notification idempotency**: Claim-once pattern to prevent duplicate emails
- **Repositories**: Both InMemory (fallback/test) and MongoDB (production) implementations
- **Dev tools**: `/dev/database` endpoint for status verification and seed script
- **Security**: Helmet headers, global error handling, CORS restricted to frontend URL

---

## 2. Incomplete Functionality

- **WhatsApp notifications**: Config exists, infrastructure exists, but sending is a `console.log` stub.
- **Product discount field**: Schema has `discount` field, but it is never calculated or saved by any code path.
- **Variants admin form**: The frontend product form does NOT expose variant editing (id, sku, label, stock, options).
- **Payment verifiedBy**: Order schema tracks who verified payment but it's always set to `null`.
- **payment.failed status**: Defined in type, available in admin dropdown, but no automated trigger.
- **Product active toggle**: Soft-delete exists (`active: false`) but requires editing the full product form (no quick toggle).
- **Customer email notifications**: Only admin gets emails; customers get no confirmation.
- **Order cancellation**: Customers cannot cancel their own orders.
- **Pagination**: Admin orders are hard-limited to 100; no pagination implemented.
- **Server-side search**: Search is entirely client-side.
- **Image CDN**: Images stored locally on filesystem, not S3/Cloudinary.

---

## 3. Known Bugs

1. **CURRENT BUG - Admin Product Error**:
   Admin Product Add/Edit is showing: "Please check the product details."
   *Previous investigation:*
   - multipart request uses `product`
   - multipart request uses `imageOrder`
   - images are uploaded through FormData
   - stale create/edit state and generic error handling were suspected
   - a small fix was already being applied

2. **Delivery charge mismatch**: `CheckoutPage.tsx` reads `VITE_DELIVERY_CHARGE` (frontend env) but the server reads `env.DELIVERY_CHARGE`. The server value is authoritative, meaning the displayed total can differ from the charged total if environments aren't synced.

3. **Admin proof Content-Type header**: `adminProofController.ts` pipes the stream but does NOT set the `Content-Type` header (browsers may not render it correctly).

4. **Variant stock update positional operator race**: `variants.$.stock` in MongoDB requires the `$elemMatch` filter. If a product has multiple matching variants, only the first is updated.

---

## 4. Technical Debt

1. **`orderRoutes.ts` is dead code**: Creates InMemory repos and exports a router but is never imported by `appFactory.ts`. Confusing for developers.
2. **App.tsx monolith**: All 10 pages + 5 hooks + sub-components live in a single 196-line dense file (~34KB). Extremely hard to maintain.
3. **Admin stock updates use `window.prompt()`**: An accessibility and UX anti-pattern.
4. **Image files not cleaned up on update failure**: If `ProductModel.findOneAndUpdate` fails after images are uploaded, newly uploaded files won't be cleaned up (orphan files).
5. **Seeded products have no images**: `seed.ts` creates 6 products with `images: []`. Admin must add images manually.
6. **`LocalPrivatePaymentProofStorage` uses in-memory Map**: Cache is lost on server restart. Fallback compensates, but busy restart could cause brief 404s.
7. **No CSRF protection**: Static token in sessionStorage is vulnerable to XSS.
8. **Announcement bar hardcoded**: "Free delivery on orders above ₹999" is hardcoded in `SiteHeader` but actual minimum is ₹200 and delivery is ₹50.
9. **Cart subtotal uses frontend price**: If prices change between catalog fetch and checkout, displayed total is wrong (server still charges correct price).
10. **No structured logging**: Errors go to `console.error()`. No log levels or rotation.
11. **`defaultOrderRepository` in `orderService.ts`**: Module-level singleton is unused in production but its existence is misleading.

---

## 5. Current Task

The primary current task is to fix the **Admin Product Add/Edit bug** (detailed in the Known Bugs section) without refactoring the entire file or making unnecessary sweeping changes.

---

## 6. Recommended Next Tasks

### Priority 1: Critical Fixes
1. Fix the Admin Product Add/Edit bug.
2. Fix delivery charge sync (make `CheckoutPage` fetch delivery charge from `/api/payment-config`).
3. Add `Content-Type` header in `adminProofController.ts`.
4. Remove/archive the dead `orderRoutes.ts` file.

### Priority 2: Missing Features
1. Add Customer order confirmation emails (using the existing `GmailSmtpEmailProvider`).
2. Add pagination for admin orders (`page`/`limit` params).
3. Add variant management UI to the admin product form.
4. Replace `DevelopmentWhatsAppProvider` with a real WhatsApp API integration.

### Priority 3: Tech Debt & UX
1. Split `App.tsx` into `/src/pages/` and `/src/components/` directories.
2. Replace `window.prompt()` in admin stock updates with an inline UI.
3. Fix the hardcoded announcement bar text.
4. Add image cleanup on product update failure (try/finally).
