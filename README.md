# Real Estate Rental Platform

A full stack rental marketplace where tenants search for homes on a map, favourite listings and apply, and property managers list properties, review applications and manage leases.

## Features

**Tenants**
- Search properties on an interactive Mapbox map, filtered by location, price, type and amenities
- Save favourites and track the status of rental applications
- View current residences, leases and payment history

**Property managers**
- Create listings with photo uploads (stored on Amazon S3)
- Approve or reject tenant applications, which creates the lease
- Manage properties and account settings

**Platform**
- Sign-up and sign-in with AWS Cognito, with separate tenant and manager roles
- Every API request's Cognito ID token is verified (signature, issuer, audience, expiry) with `aws-jwt-verify`, then checked against the route's role
- Users can only read and change their own profile, applications, leases and payments
- Geospatial search with PostGIS (`geography(Point, 4326)` coordinates)

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15, React 19, TypeScript, Redux Toolkit (RTK Query), Tailwind CSS, Framer Motion, React Hook Form + Zod, FilePond |
| Auth | AWS Cognito with Amplify UI |
| Maps | Mapbox GL |
| Backend | Node.js, Express, TypeScript, aws-jwt-verify, Helmet, Morgan, Multer |
| Database | PostgreSQL with PostGIS, Prisma ORM |
| Storage and hosting | Amazon S3, EC2 (PM2), see `server/aws-ec2-instructions.md` |

## Project structure

```
client/   Next.js app: landing page, search, tenant and manager dashboards
server/   Express API: properties, applications, leases, tenants, managers
  prisma/ schema, migrations and seed data
```

## Running locally

**Prerequisites:** Node.js 20+, PostgreSQL with the PostGIS extension, an AWS Cognito user pool, an S3 bucket and a Mapbox token.

Server (`server/.env`):

```env
PORT=3002
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/realestate
AWS_REGION=your-region
S3_BUCKET_NAME=your-bucket
COGNITO_USER_POOL_ID=your-user-pool-id
COGNITO_USER_POOL_CLIENT_ID=your-client-id
```

```bash
cd server
npm install
npx prisma migrate dev
npm run seed
npm run dev
```

Client (`client/.env.local`):

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3002
NEXT_PUBLIC_AWS_COGNITO_USER_POOL_ID=your-user-pool-id
NEXT_PUBLIC_AWS_COGNITO_USER_POOL_CLIENT_ID=your-client-id
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your-mapbox-token
```

```bash
cd client
npm install
npm run dev
```

The client runs at http://localhost:3000.
