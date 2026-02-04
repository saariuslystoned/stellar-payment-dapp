---
trigger: always_on
---

# Frontend Deployment Reminder

When making changes to the frontend (`frontend/src/`), remember:

1. **Local `npm run build`** only updates `frontend/dist/` which is used for **local testing** via the Go backend.

2. **Production deploys to Cloudflare Pages** at `smoky-frontend.pages.dev`.
   - After building, run: `cd frontend && npx wrangler pages deploy dist --project-name smoky-frontend`
   - The WooCommerce iframe on `smokyproduct.co` loads from Cloudflare, NOT from the local backend.

3. **Always deploy to Cloudflare** after frontend changes if you want them live on WooCommerce.

## Backend Restart

**Always use `fuser -k 8080/tcp`** to free the port when restarting the backend:

```bash
cd backend && go build -o main . && fuser -k 8080/tcp 2>/dev/null; set -a && source .env && set +a && ./main &
```

Do NOT use `pkill` - it's slower and less reliable than `fuser`.
