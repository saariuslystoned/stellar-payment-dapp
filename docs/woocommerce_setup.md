# WooCommerce Integration Setup Guide

Follow these steps to connect your WooCommerce store (`smokyproduct.co`) to the Smoky Coins backend.

## 1. Create REST API Keys

The backend needs these keys to update order metadata (linking the escrow ID).

1. Log in to your WordPress Admin dashboard (`/wp-admin`).
2. Go to **WooCommerce > Settings > Advanced**.
3. Click on the **REST API** tab.
4. Click **Add key**.
5. **Description**: `Smoky Coins Backend`
6. **User**: Select your admin user.
7. **Permissions**: Select **Read/Write** (Important!).
8. Click **Generate API key**.
9. **Copy and Save** the `Consumer key:ck_6d31dabb6b21098dc68bc8e0b829370f47119be0` and `Consumer secret:cs_ad3164e0ac03fd08f9d05b0dcc5bb96f53a441c3` immediately. You won't be able to see the secret again.

## 2. Set Up Webhook

This notifies the backend when a new order is placed.

1. Go to **WooCommerce > Settings > Advanced > Webhooks**.
2. Click **Add webhook**.
3. **Name**: `Smoky Coins Pending Order`
4. **Status**: **Active**
5. **Topic**: **Order created**
6. **Delivery URL**:
   - *If running locally*: You need a specific public URL (see Section 3).
   - Format: `https://<your-public-url>/webhook/pending-order`
7. **Secret**: Leave blank or set a custom secret (optional, for verification).
8. **API Version**: `WP REST API Integration v3`.
9. Click **Save webhook**.

## 3. Expose Local Backend (Tunneling)

Since your backend is running on `localhost:8080`, WooCommerce can't reach it directly. You need a tunnel.

### Option A: Install ngrok (Recommended)
1. Install ngrok:
   ```bash
   curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null && echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list && sudo apt update && sudo apt install ngrok
   ```
2. Start the tunnel:
   ```bash
   ngrok http 8080
   ```
3. Copy the `https://...` URL provided by ngrok. Use this for your Webhook Delivery URL.

### Option B: Cloudflare Tunnel (Alternative)
If you use Cloudflare, you can use `cloudflared` to create a tunnel similarly.

## 4. Configure Backend Environment

Set the variables in your terminal before running the server:

```bash
export WC_BASE_URL="https://smokyproduct.co"
export WC_CONSUMER_KEY="ck_..."
export WC_CONSUMER_SECRET="cs_..."
export ZMOKE_ISSUER_SECRET="SERVER_SECRET_KEY_WITH_ZMOKE_ISSUER_ACCESS"

# Restart the server
cd backend
go run .
```
