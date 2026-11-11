# Real Estate Rental Platform

[![CI](https://github.com/NdegwaCodes/Real-Estate-Project/actions/workflows/ci.yml/badge.svg)](https://github.com/NdegwaCodes/Real-Estate-Project/actions/workflows/ci.yml)

A full stack rental marketplace for Nairobi. Tenants search for homes on a map, apply, and pay rent with M-Pesa. Property managers list properties, approve applications and track who has paid.

## Features

**Tenants**
- Search properties on an interactive Mapbox map, filtered by location, price (KES), type and amenities
- Save favourites and track the status of rental applications
- **Pay rent with M-Pesa:** an STK push sends a PIN prompt to the tenant's phone, and the payment is recorded against the month automatically
- See every rent payment for a lease, with the M-Pesa receipt once confirmed

**Property managers**
- Create listings with photo uploads (stored on Amazon S3)
- Approve or deny applications. Approval creates the one-year lease.
- See each tenant's lease and whether this month's rent is paid

**Platform**
- Sign-up and sign-in with AWS Cognito, with separate tenant and manager roles
- Every API request's Cognito ID token is verified (signature, issuer, audience, expiry) with `aws-jwt-verify`, then checked against the route's role
- Users can only read and change their own profile, applications, leases and payments
- Geospatial search with PostGIS (`geography(Point, 4326)` coordinates)

## M-Pesa rent payments

```
Tenant taps "Pay with M-Pesa"
  -> POST /leases/:id/mpesa          finds or creates this month's payment, sends the STK push
  -> Safaricom prompts the phone     tenant enters their PIN
  -> POST /mpesa/callback/:token     Safaricom reports the result
  -> payment marked Paid or PartiallyPaid, receipt stored
```

- Each attempt is stored as an `MpesaTransaction`, so failed and cancelled attempts stay on record
- The callback URL carries a secret token, compared in constant time
- Settlement is idempotent: a transaction can only move out of `Pending` once, so a repeated callback cannot credit rent twice
- The amount in the callback must match the amount requested, or the transaction is marked failed for review
- If the callback never arrives, the status endpoint falls back to Daraja's STK query after 30 seconds
- A second request is refused while one is still waiting on the tenant's phone

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15, React 19, TypeScript, Redux Toolkit (RTK Query), Tailwind CSS, Framer Motion, React Hook Form + Zod, FilePond |
| Auth | AWS Cognito with Amplify UI, verified server-side with aws-jwt-verify |
| Payments | M-Pesa Daraja API (STK push, STK query, result callback) |
| Maps | Mapbox GL |
| Backend | Node.js, Express, TypeScript, Helmet, Morgan, Multer |
| Database | PostgreSQL with PostGIS, Prisma ORM |
| Storage and hosting | Amazon S3, EC2 (PM2), see `server/aws-ec2-instructions.md` |
| CI | GitHub Actions: server type check and tests, client type check, lint and build |

## Project structure

```
client/   Next.js app: landing page, search, tenant and manager dashboards
server/   Express API: properties, applications, leases, tenants, managers, M-Pesa
  src/lib/mpesa.ts   Daraja client and payment helpers (unit tested)
  prisma/            schema, migrations and Nairobi seed data
```

## Running locally

**Prerequisites:** Node.js 20+, PostgreSQL with the PostGIS extension, an AWS Cognito user pool, an S3 bucket, a Mapbox token and a [Daraja](https://developer.safaricom.co.ke) app (the sandbox is free).

Server: copy `server/.env.example` to `server/.env` and fill it in. M-Pesa needs a public URL for the callback, so point `MPESA_CALLBACK_BASE_URL` at your deployed API or a tunnel such as ngrok.

```bash
cd server
npm install
npx prisma migrate dev
npm run seed
npm run dev
```

Client: copy `client/.env.example` to `client/.env.local` and fill it in.

```bash
cd client
npm install
npm run dev
```

The client runs at http://localhost:3000.

## Tests

```bash
cd server
npm test          # M-Pesa helpers: phone numbers, timestamps, callbacks, settlement
npm run typecheck
```
