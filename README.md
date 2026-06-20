# Pinga Backend

AI Social Sales Agent for Nigerian SMBs.

## Setup

1. `cp .env.example .env` and fill in values
2. `npm install`
3. Create PostgreSQL database: `createdb pinga_dev`
4. `npm run migrate` to run migrations
5. `npm run dev` to start development server

## API Base URL

`http://localhost:3001/api/v1`

## Platforms

- Instagram DMs (Meta Graph API)
- Facebook Messenger (Meta)
- WhatsApp Business API (Meta Cloud API)

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with nodemon (development) |
| `npm start` | Start production server |
| `npm run migrate` | Run pending migrations |
| `npm run migrate:status` | Show migration status |
| `npm run migrate:rollback` | Rollback last batch |
| `npm run migrate:fresh` | Drop all tables & re-migrate |
| `npm run migrate:create -- <name>` | Create new migration file |
