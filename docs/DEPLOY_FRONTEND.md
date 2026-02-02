# Frontend Deployment Guide (Cloudflare Pages)

Follow this guide to deploy your Smoky Coins frontend to Cloudflare Pages and integrate it with WooCommerce.

## 1. Build the Frontend

Run this command locally to create the production build:

```bash
npm run build
```

This creates a `dist` folder in the `stellar-payment-dapp` directory.

## 2. Deploy to Cloudflare Pages

### Option A: Using Wrangler (CLI) - **Recommended**

1.  Install Wrangler globally (if not already):
    ```bash
    npm install -g wrangler
    ```
2.  Login to Cloudflare:
    ```bash
    wrangler login
    ```
3.  Deploy the `dist` folder:
    ```bash
    wrangler pages deploy dist --project-name smoky-frontend
    ```
4.  It will give you a public URL (e.g., `https://smoky-frontend.pages.dev`).

### Option B: Manual Upload

1. Go to [Cloudflare Dashboard > Workers & Pages](https://dash.cloudflare.com/?to=/:account/pages).
2. Click **Create Application** > **Pages** > **Upload Assets**.
3. Name project: `smoky-frontend`.
4. Upload the contents of the `dist` folder.

## 3. Configuration

In Cloudflare Pages Settings > **Environment Variables**, add:

- `VITE_BACKEND_URL`: Your backend URL (e.g., `https://smokyproduct.co/api` or your backend tunnel URL).
  *Note: For `localhost`/ngrok dev, you'll need the ngrok URL here.*

## 4. Integrate with WooCommerce (Redirect Flow)

The goal is to automatically redirect users to your Stellar Checkout page when they select "Stellar" payment method.

### Step A: Create the Payment Gateway Plugin

1.  Download the `smoky-stellar-gateway.php` file provided by the Assistant.
2.  Compress it into a zip file (`smoky-stellar-gateway.zip`) or upload it to `wp-content/plugins/` via FTP.
3.  Go to WordPress Admin > **Plugins** > **Activate** "Smoky Stellar Payment Gateway".
4.  Go to **WooCommerce** > **Settings** > **Payments**.
5.  Enable **Stellar (USDC / XLM)** and click **Manage**.
6.  Ensure "Checkout Page URL" is set to `/stellar-checkout/`.

### Step B: Create the Checkout Page in WordPress

1.  Create a new Page in WordPress titled "Stellar Checkout" (slug: `stellar-checkout`).
2.  Add a **Custom HTML** block with the following code (replace the `src` with your Cloudflare URL):

    ```html
    <style>
      /* Ensure full width and height for the checkout experience */
      .stellar-app-container {
        width: 100%;
        height: 100vh;
        min-height: 800px;
        border: none;
        overflow: hidden;
      }
      /* Optional: Hide header/footer on this page if your theme allows, for a cleaner look */
    </style>

    <script>
      // Pass URL parameters (order_id, amount) from the parent WP page to the iframe
      const urlParams = new URLSearchParams(window.location.search);
      const orderId = urlParams.get('order_id');
      const amount = urlParams.get('amount');
      const iframeSrc = `https://smoky-frontend.pages.dev/?order_id=${orderId}&amount=${amount}`;
      
      document.write(`<iframe src="${iframeSrc}" class="stellar-app-container" title="Stellar Checkout"></iframe>`);
    </script>
    ```

3.  **Publish** the page.

### How it works:
1.  User selects "Stellar (USDC/XLM)" at checkout.
2.  Order is created as "Pending Payment".
3.  WooCommerce redirects user to `/stellar-checkout/?order_id=123&amount=50`.
4.  The script passes these params to your Cloudflare App in the iframe.
5.  User connects wallet (Albedo/Freighter) and pays.
6.  Backends links payment -> Releases Escrow -> Updates Order to "Processing".
