# Deployment

Three free tiers: **Neon** (Postgres), **Render** (FastAPI), **Vercel**
(Next.js). Roughly 15 minutes end to end.

---

## 1. Postgres — Neon

1. Create a project at <https://neon.tech>. Pick **PostgreSQL 17 or 18** and a
   region near you (`ap-southeast-1` for India).
2. Copy the **pooled** connection string. It looks like:

   ```
   postgresql://user:pass@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

   Use the **pooled** one (`-pooler` in the host). The direct endpoint allows
   few concurrent connections, and a couple of web workers will exhaust them.

3. Seed it from your machine — there is no need to run the seed on Render:

   ```bash
   cd backend
   # PowerShell:  $env:DATABASE_URL="postgresql://..."
   export DATABASE_URL="postgresql://...?sslmode=require"
   python -m scripts.seed
   ```

   It should report **10,000 rows loaded, 0 rejected**.

---

## 2. Backend — Render

1. New → **Web Service**, connect the GitHub repo.
2. Render reads [`render.yaml`](render.yaml). If entering values by hand:

   | Setting | Value |
   |---|---|
   | Root directory | `backend` |
   | Build command | `pip install -r requirements.txt` |
   | Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
   | Health check path | `/health` |

3. Environment variables:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Neon **pooled** string |
   | `CORS_ORIGINS` | your Vercel URL, e.g. `https://coinstack.vercel.app` |
   | `POOL_MAX_SIZE` | `5` |

4. Deploy, then confirm:

   ```bash
   curl https://<your-service>.onrender.com/health
   # {"status":"ok","database":"connected"}
   ```

   `"database":"connected"` means it really reached Postgres — the health check
   runs an actual query rather than just returning 200.

---

## 3. Frontend — Vercel

1. New Project → import the repo.
2. **Root directory: `frontend`.** Vercel autodetects Next.js from there.
3. Environment variable:

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://<your-service>.onrender.com` (no trailing slash) |

4. Deploy.

---

## 4. Close the CORS loop

Vercel assigns the real URL only after the first deploy, so `CORS_ORIGINS` on
Render has to be set (or corrected) afterwards. Set it to the production URL and
redeploy the Render service.

Preview deployments are already covered: the API also allows any
`https://*.vercel.app` origin via a regex, so branch previews work without
touching config each time.

---

## Verifying

- `GET /health` → `{"status":"ok","database":"connected"}`
- Dashboard shows **10,000** transactions and a **2,57,238** coin balance
- Clicking a donut slice filters the table, and both charts reshape
- Redeeming the ₹500 Amazon voucher drops the header balance by 5,000
- The ₹2,999 fee waiver (300,000 coins) is disabled and shows a progress bar

## Notes

- **Render free tier sleeps after 15 minutes idle.** The first request can take
  ~30 seconds. Worth mentioning to anyone opening the link cold.
- **Neon free tier also suspends.** It wakes in a second or two.
- The seed is destructive — it drops and recreates every table. Safe to re-run,
  but it will wipe any redemptions made through the live UI.
