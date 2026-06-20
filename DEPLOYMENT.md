# Pinga Backend Deployment

Use Render for the API service and Neon for Postgres.

## Neon database

1. Create a Neon project.
2. Copy the pooled Postgres connection string.
3. Use it as `DATABASE_URL` on Render.

## Render web service

Create a new Render Web Service from:

```text
https://github.com/AbdulmalikAbdulwakeel1/pinga-backend
```

Use these settings:

```text
Runtime: Node
Build command: npm ci
Start command: npm start
Health check path: /health
Plan: Free
```

Required environment variables:

```text
NODE_ENV=production
API_VERSION=v1
DATABASE_URL=<neon pooled connection string>
JWT_SECRET=<long random secret>
JWT_REFRESH_SECRET=<another long random secret>
ALLOWED_ORIGINS=<vercel frontend url>
FRONTEND_URL=<vercel frontend url>
```

Optional environment variables:

```text
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
OPENAI_API_KEY=
RESEND_API_KEY=
EMAIL_FROM=
META_APP_ID=
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
```

After the first successful deploy, run:

```text
npm run migrate
```

from Render Shell, or add it as a one-time job after `DATABASE_URL` is configured.
