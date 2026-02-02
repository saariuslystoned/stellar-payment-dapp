# Frontend Deployment Reminder

When making changes to the frontend (`frontend/src/`), remember:

1. **Local `npm run build`** only updates `frontend/dist/` which is used for **local testing** via the Go backend.

2. **Production deploys to Cloudflare Pages** at `smoky-frontend.pages.dev`.
   - After building, run: `cd frontend && npx wrangler pages deploy dist --project-name smoky-frontend`
   - The WooCommerce iframe on `smokyproduct.co` loads from Cloudflare, NOT from the local backend.

3. **Always deploy to Cloudflare** after frontend changes if you want them live on WooCommerce.
