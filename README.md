# nodejs-complete-guide

A full-stack e-commerce shop built as part of the Udemy Node.js Complete Guide course, converted to **TypeScript** and extended with local object storage, container-based development, and a full test suite.

## Tech Stack

| Layer          | Technology                                           |
| -------------- | ---------------------------------------------------- |
| Runtime        | Node.js ≥ 22                                         |
| Language       | TypeScript (tsx — no build step for server)          |
| Framework      | Express 4                                            |
| Database       | MongoDB via Mongoose 5                               |
| Object Storage | MinIO (S3-compatible)                                |
| Sessions       | express-session + connect-mongodb-session            |
| Payments       | Stripe (Checkout)                                    |
| Email          | SendGrid via Nodemailer                              |
| Views          | EJS                                                  |
| Security       | helmet, csurf, bcryptjs                              |
| Testing        | Mocha + Chai + Sinon (unit), Playwright (end-to-end) |

## Features

- Product listing with pagination
- Product detail pages
- Shopping cart (add / remove)
- Stripe Checkout (card payments)
- Order history with downloadable PDF invoices
- User authentication (signup, login, password reset via email)
- Admin panel: add / edit / delete products
- Product image upload → stored in MinIO
- Mobile-responsive layout with slide-out drawer nav
- CSRF protection on all forms

## Prerequisites

- **Node.js ≥ 22** (`node --version`)
- **Docker Desktop** (for MongoDB + MinIO)
- Stripe test account, SendGrid API key (optional for local dev — payments and email can be skipped)

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd nodejs-complete-guide
npm install

# 2. Environment
cp .env.example .env
# Fill in STRIPE_*, SENDGRID_API_KEY, SESSION_SECRET (see table below)

# 3. Start containers (MongoDB + MinIO)
docker compose up -d

# 4. Build client-side TypeScript
npm run build:client

# 5. Start the server
npm start              # production mode
npm run start:dev      # dev mode with nodemon (restarts on .ts changes)
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Copy `.env.example` to `.env` and fill in the values.

| Variable                 | Required | Description                                                                                                                |
| ------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `MONGODB_URI`            | Yes      | MongoDB connection string                                                                                                  |
| `SESSION_SECRET`         | Yes      | Long random string for session signing                                                                                     |
| `APP_BASE_URL`           | No       | Public base URL used to build absolute links in emails (e.g. the password-reset link); defaults to `http://localhost:3000` |
| `MINIO_ENDPOINT`         | Yes      | MinIO hostname (e.g. `127.0.0.1`)                                                                                          |
| `MINIO_PORT`             | Yes      | MinIO port (default `9000`)                                                                                                |
| `MINIO_SECURE`           | Yes      | `true` for HTTPS, `false` for plain HTTP                                                                                   |
| `MINIO_ACCESS_KEY`       | Yes      | MinIO access key                                                                                                           |
| `MINIO_SECRET_KEY`       | Yes      | MinIO secret key                                                                                                           |
| `MINIO_BUCKET`           | Yes      | Bucket name (created automatically)                                                                                        |
| `STRIPE_PUBLISHABLE_KEY` | Yes      | Stripe publishable key (`pk_test_…`)                                                                                       |
| `STRIPE_SECRET_KEY`      | Yes      | Stripe secret key (`sk_test_…`)                                                                                            |
| `SENDGRID_API_KEY`       | No       | SendGrid key for password-reset emails                                                                                     |
| `SENDGRID_FROM_EMAIL`    | No       | Verified sender address for password-reset emails — no default, must be set to send them                                   |

## NPM Scripts

| Script                 | Description                                                                  |
| ---------------------- | ---------------------------------------------------------------------------- |
| `npm start`            | Start server (production)                                                    |
| `npm run start:dev`    | Start with nodemon (auto-restart on TS changes)                              |
| `npm test`             | Run Mocha unit test suite                                                    |
| `npm run test:e2e`     | Run Playwright end-to-end test suite (requires the app running on port 3000) |
| `npm run test:e2e:ui`  | Run Playwright tests in interactive UI mode                                  |
| `npm run build:client` | Compile `src/client/*.ts` → `public/js/` via esbuild                         |
| `npm run build`        | Typecheck + build client                                                     |
| `npm run typecheck`    | Type-check server and client TypeScript                                      |

## Project Structure

```
.
├── app.ts                  # Express app entry point
├── controllers/            # Route handlers
│   ├── admin.ts
│   ├── auth.ts
│   ├── error.ts
│   └── shop.ts
├── middleware/
│   └── is-auth.ts          # Session auth guard
├── models/                 # Mongoose schemas
│   ├── order.ts
│   ├── product.ts
│   └── user.ts
├── routes/
│   ├── admin.ts
│   ├── auth.ts
│   └── shop.ts
├── src/
│   ├── client/             # Browser TypeScript (compiled to public/js/)
│   │   ├── admin.ts        # AJAX product delete
│   │   └── main.ts         # Mobile nav drawer
│   └── types/              # Ambient declarations
│       ├── express.d.ts    # Request.user + Session augmentation
│       └── nodemailer-sendgrid-transport.d.ts
├── util/
│   ├── file.ts             # Disk file deletion helper
│   └── minio.ts            # MinIO client + bucket init
├── views/                  # EJS templates
├── public/                 # Static assets
│   ├── css/
│   └── js/                 # Compiled from src/client/
├── test/                   # Mocha unit tests (tsx/cjs)
│   ├── auth-controller.ts
│   ├── auth-middleware.ts
│   └── shop-controller.ts
├── e2e/                    # Playwright end-to-end tests
│   └── app.spec.ts
├── compose.yaml  # Docker: MongoDB + MinIO
├── playwright.config.ts    # Playwright config (Chrome desktop + iPhone 12 viewport)
├── tsconfig.json           # Server TypeScript config
├── tsconfig.client.json    # Browser TypeScript config
└── nodemon.json            # Watches *.ts, restarts via tsx
```

## Running Tests

Tests mock Mongoose and run entirely in-process (no live database needed).

```bash
npm test
```

The test suite covers:

- Auth middleware: session guard redirects unauthenticated requests
- Auth controller: DB failures propagate via `next(err)`, 422 renders on bad credentials
- Shop controller: DB failures propagate via `next(err)`, orders render correctly

## End-to-End Tests (Playwright)

Unlike the Mocha suite, the Playwright tests exercise the app for real, in a
browser, against a live MongoDB + MinIO stack — no mocking. They cover:

- Public pages (home, product listing)
- Auth guards (unauthenticated redirects) and full signup/login/logout flows
- Admin: add / edit / delete product (including image upload)
- Cart: add / remove items, checkout page, order history
- Password reset page and 404 handling
- CSS/visual properties (colors, fonts, box-shadows, centering, pagination styling)
- Mobile responsiveness: hamburger menu, slide-out drawer animation, backdrop,
  and breakpoint switching — run against both a desktop Chrome viewport and an
  iPhone 12 (WebKit) viewport

Each test that needs an account creates its **own** unique user at run time
(no shared/seeded test user), so tests are independent and safe to run in any
order or in parallel.

**Neither a real Stripe nor a real SendGrid account is required** to run the
suite:

- Stripe: only the publishable key (client-side) is exercised, to confirm the
  Checkout button widget renders. No card is actually charged.
- SendGrid: only the app-side flow (token generation, redirect, no crash) is
  verified — actual email delivery isn't required or tested.

```bash
# 1. Make sure MongoDB + MinIO are up and the app is running
docker compose up -d
npm run build:client
npm start                 # in a separate terminal, keep it running

# 2. Install browser binaries (first time only)
npx playwright install

# 3. Run the suite
npm run test:e2e          # headless, both projects (Chrome + mobile Safari)
npm run test:e2e:ui       # interactive UI mode, great for debugging
```

Playwright writes an HTML report to `playwright-report/` (open with
`npx playwright show-report`) and screenshots of any failures to
`test-results/`. Both are gitignored.

## Docker Services

```bash
# Start
docker compose up -d

# Stop
docker compose down

# Logs
docker compose logs -f
```

| Service       | Port  | UI                                              |
| ------------- | ----- | ----------------------------------------------- |
| MongoDB       | 27017 | —                                               |
| MinIO API     | 9000  | —                                               |
| MinIO Console | 9001  | http://localhost:9001 (minioadmin / minioadmin) |

## License

MIT — see [LICENSE](LICENSE).
