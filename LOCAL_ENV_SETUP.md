# Local Development Environment Setup

## Important Configuration

**⚠️ ALWAYS use production backend for local development**

The frontend is configured to use the production backend API:
- **Backend URL**: `https://api.hackandbuild.dev`
- **Configuration**: Set in `frontend/.env.local`

## Starting Local Environment

### Frontend Only (Recommended)
```bash
cd frontend
npm run dev
```

The frontend will run on `http://localhost:3000` and connect to the production backend.

### Why Production Backend?
- Consistent data across all environments
- No need to run local backend
- Always testing against real API
- Simpler development workflow

## Current Setup

- **Frontend**: `http://localhost:3000` (local)
- **Backend**: `https://api.hackandbuild.dev` (production)
- **Configuration**: `frontend/.env.local` → `NEXT_PUBLIC_API_URL=https://api.hackandbuild.dev`

## Notes

- ❌ **DO NOT** change `NEXT_PUBLIC_API_URL` to `http://localhost:8000`
- ✅ **ALWAYS** use production backend API
- 🔄 Frontend auto-reloads on code changes
- 🌐 Backend is always production (`https://api.hackandbuild.dev`)

