# NEO Backend

NestJS backend service with Prisma ORM, Supabase authentication, and health check endpoints.

## Tech Stack

- **Framework**: NestJS 10
- **Database**: PostgreSQL (AWS RDS / Supabase)
- **ORM**: Prisma
- **Authentication**: Supabase Auth (Magic Link / OTP)
- **Secrets Management**: Doppler
- **Container**: Docker (ECS Fargate ready)

## Project Structure

```
Backend/
├── src/
│   ├── config/           # Environment configuration
│   ├── modules/
│   │   ├── auth/         # Supabase authentication
│   │   ├── health/       # Health check endpoints
│   │   └── users/        # User management
│   ├── prisma/           # Prisma service & module
│   ├── app.controller.ts
│   ├── app.module.ts
│   └── main.ts
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── seed.ts           # Database seeding
├── test/                 # E2E tests
├── Dockerfile
└── package.json
```

## Quick Start

### Prerequisites

- Node.js 20+
- Doppler CLI installed and authenticated
- PostgreSQL database (or use the RDS instance)

### Setup

1. **Install dependencies**
   ```bash
   cd Backend
   npm install
   ```

2. **Configure Doppler**
   ```bash
   doppler setup --project neo --config prd
   ```

3. **Generate Prisma client**
   ```bash
   npx prisma generate
   ```

4. **Run database migrations** (first time only)
   ```bash
   doppler run -- npx prisma migrate dev
   ```

### Reset remote schema (dev only)

To wipe the remote `public` schema and re-apply migrations from scratch (e.g. after drift or failed migrations):

```bash
cd Backend

# 1. Wipe public schema
doppler run -- npx prisma db execute --stdin << 'EOF'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
EOF

# 2. Apply migrations (do NOT run migrate resolve in between)
doppler run -- npx prisma migrate dev --name init
```

Do **not** run `prisma migrate resolve --rolled-back` between the drop and `migrate dev`; that recreates `_prisma_migrations` and causes "relation _prisma_migrations already exists".

5. **Start development server**
   ```bash
   doppler run -- npm run start:dev
   ```

## Environment Variables

Required environment variables (managed via Doppler):

| Variable | Description |
|----------|-------------|
| `DATABASE_HOST` | PostgreSQL host |
| `DATABASE_PORT` | PostgreSQL port (default: 5432) |
| `DATABASE_NAME` | Database name |
| `DATABASE_USER` | Database username |
| `DATABASE_PASSWORD` | Database password |
| `SUPERTOKENS_CONNECTION_URI` | SuperTokens Core URL |
| `PORT` | Server port (default: 3000) |
| `NODE_ENV` | Environment (development/production) |

## API Endpoints

### Health Checks

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Full health check (includes DB) |
| `GET /health/liveness` | Simple liveness probe |
| `GET /health/readiness` | Readiness probe with DB check |

### API (prefixed with `/api`)

| Endpoint | Description |
|----------|-------------|
| `GET /api/users` | List all users |
| `GET /api/users/:id` | Get user by ID |
| `POST /api/users` | Create new user |
| `PATCH /api/users/:id` | Update user |
| `DELETE /api/users/:id` | Soft delete user |

## Database Commands

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations (development)
npm run prisma:migrate

# Run migrations (production)
npm run prisma:migrate:prod

# Open Prisma Studio
npm run prisma:studio

# Seed database
npm run prisma:seed

# Push schema changes (without migration)
npm run db:push
```

## Docker

### Build image
```bash
docker build -t neo-backend .
```

### Run locally
```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e SUPERTOKENS_CONNECTION_URI="http://..." \
  neo-backend
```

### For ECS Deployment

The Dockerfile is optimized for ECS Fargate:
- Multi-stage build for smaller image size
- Non-root user for security
- Built-in health check
- Signal handling with dumb-init

## Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Development Tips

1. **Use Doppler for all secrets**
   ```bash
   doppler run -- npm run start:dev
   ```

2. **Watch for file changes**
   ```bash
   doppler run -- npm run start:debug
   ```

3. **Format code**
   ```bash
   npm run format
   ```

4. **Lint code**
   ```bash
   npm run lint
   ```
