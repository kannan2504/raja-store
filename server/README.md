# Raja Store API Persistence

## Development memory mode

The default development mode uses the injectable in-memory repositories for local UI work:

```text
PERSISTENCE_MODE=memory
```

## MongoDB mode

Set `PERSISTENCE_MODE=mongo` and `DATABASE_URL` in `server/.env`. The API refuses to start in Mongo mode without a working connection, and production always requires MongoDB persistence.

Seed only a development database:

```text
PERSISTENCE_MODE=mongo NODE_ENV=development DATABASE_URL=mongodb://localhost:27017/raja-store-dev npm run seed
```

The seed uses upserts keyed by `productId`; it does not drop collections or overwrite production data. Orders are stored separately with unique customer-facing `orderId` and `idempotencyKey` indexes. Product stock reservation uses conditional MongoDB updates so two requests cannot reserve the same stock unit.
