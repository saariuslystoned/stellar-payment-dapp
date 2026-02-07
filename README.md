# Stellar Payment DApp

A secure, oracle-backed payment escrow platform on the Stellar network (Soroban) with **WooCommerce integration**, **Blend Protocol yield generation**, and **ZMOKE token rewards**. Buyers deposit funds that automatically earn yield in Blend Protocol while awaiting order fulfillment.

## ✨ Key Features

- **🏦 Blend Protocol Integration**: Deposited funds (Blend USDC & XLM) automatically supply to Blend for yield
- **💰 BLND Emission Claiming**: Pool contract can claim accrued BLND token rewards via `claim_emissions()`
- **🛒 WooCommerce Ready**: Payment gateway plugin with customer enrollment and wallet management
- **🪙 ZMOKE Rewards**: Buyers earn ZMOKE tokens ($1 spent = 10 ZMOKE)
- **👤 Stellar Customer Accounts**: Custom user role with G-address attached to profile
- **💼 Store Credit System**: Burn ZMOKE for store credit at checkout
- **💱 Multi-Asset**: Supports Blend USDC, Circle USDC, and XLM payments
- **⛽ Gasless Deposits**: Oracle-sponsored fee-bump transactions — buyers never pay gas fees

## 🚀 Quick Start

### Development Setup

```bash
# 1. Clone and install
git clone https://github.com/saariuslystoned/stellar-payment-dapp.git
cd stellar-payment-dapp
./setup_dev_env.sh

# 2. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your WooCommerce credentials and ZMOKE keys

# 3. Start all services
npm run start:frontend     # Frontend on :5173
cd backend && go run .     # Backend on :8080
ngrok http 8080            # Tunnel for webhooks
```

---

## 📋 Prerequisites

- **Stellar CLI**: `curl -s https://raw.githubusercontent.com/stellar/bin/main/install.sh | bash`
- **Go 1.21+**: For the backend server
- **Node.js v18+**: For the frontend
- **ngrok**: For exposing local backend to webhooks

### Optional

- **Rust/Cargo**: For contract development
- **Python 3.11+**: For utility scripts

---

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   WooCommerce   │────▶│   Go Backend    │────▶│  Stellar Chain  │
│   (WordPress)   │     │   (Port 8080)   │     │   (Soroban)     │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
        │                        │                       │
        │               ┌────────┴────────┐              ▼
        ▼               │  Fee-Bump Proxy │      ┌─────────────────┐
┌─────────────────┐     │  /tx/submit     │      │  Pool Contract  │
│  Payment Plugin │     │  (Oracle pays   │      │ (deposits/yield)│
│  (PHP Gateway)  │     │   gas fees) ⛽  │      └────────┬────────┘
└─────────────────┘     └─────────────────┘              │
                                                         ▼
                                                ┌─────────────────┐
                                                │ Blend Protocol  │
                                                │ (Earn Yield)    │
                                                └─────────────────┘
```

### Flow

1. Customer selects Stellar payment at WooCommerce checkout
2. Redirected to React frontend with order details
3. Connects wallet (Albedo) and signs deposit transaction
4. **Frontend sends signed XDR to backend — oracle fee-bumps and submits (gasless for buyer)** ⛽
5. **Pool Contract automatically supplies funds to Blend for yield**
6. Backend confirms payment, updates WooCommerce order status
7. Buyer receives ZMOKE rewards
8. Admin can call `claim_emissions()` to collect accrued BLND rewards

---

## 🖥️ Running the Backend

The Go backend handles WooCommerce webhooks, fee-bump transaction sponsorship, and ZMOKE token distribution.

### 1. Configure Environment

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```env
# WooCommerce API Credentials
WC_BASE_URL=https://your-store.com
WC_CONSUMER_KEY=ck_your_key
WC_CONSUMER_SECRET=cs_your_secret

# ZMOKE Token Distribution
ZMOKE_DISTRIBUTOR_SECRET=S...
ZMOKE_DISTRIBUTOR_PUBLIC_KEY=G...
ZMOKE_ISSUER_SECRET=S...
ZMOKE_ISSUER_PUBLIC_KEY=G...
```

### 2. Run the Backend

```bash
cd backend
set -a && source .env && set +a
go run .
```

The backend will start on `http://localhost:8080`.

---

## 🌐 ngrok Setup (Required for Webhooks)

WooCommerce needs a public URL to send webhooks. Use ngrok to tunnel your local backend:

### 1. Install ngrok

```bash
# macOS
brew install ngrok

# Linux
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc > /dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok

# Or download from https://ngrok.com/download
```

### 2. Start the Tunnel

```bash
ngrok http 8080
```

Copy the `https://xxx.ngrok-free.dev` URL - you'll need it for WooCommerce.

### 3. Configure WooCommerce Webhook

In WordPress Admin → WooCommerce → Settings → Advanced → Webhooks:

- **Name**: Stellar Payment Webhook
- **Status**: Active
- **Topic**: Order created
- **Delivery URL**: `https://your-ngrok-url.ngrok-free.dev/webhook`
- **Secret**: (leave empty or match backend)

---

## 🛒 WooCommerce Integration

### 1. Install the Payment Gateway Plugin

Copy the plugin to your WordPress installation:

```bash
# Upload via FTP/SFTP or copy directly
cp smoky-stellar-gateway.php wp-content/plugins/
```

Or upload `smoky-stellar-gateway.php` via WordPress Admin → Plugins → Add New → Upload Plugin.

### 2. Activate and Configure

1. Go to **Plugins** → Activate "Smoky Stellar Gateway"
2. Go to **WooCommerce** → **Settings** → **Payments**
3. Enable "Stellar (USDC / XLM)" and click **Manage**
4. Configure:
   - **Frontend URL**: Your Cloudflare Pages URL (e.g., `https://your-app.pages.dev`)
   - **Backend URL**: Your ngrok/backend URL for enrollment
   - **Enable/Disable**: Checked

### 3. Plugin Features

**Customer Enrollment Flow:**

1. Customer sees "Enroll in ZMOKE Rewards" checkbox at checkout
2. If checked, $0.25 activation fee added to order
3. On order completion, backend creates Stellar wallet
4. Secret key modal displays (one-time display with copy button)
5. User assigned `stellar_customer` role with G-address in profile

**Admin Features:**

- **Users List**: "Stellar Wallet" column shows abbreviated G-address
- **User Profile**: Full G-address displayed in "Stellar Wallet Information" section
- **WooCommerce → Stellar Payments**: Dashboard showing all Stellar transactions

**My Account Integration:**

- G-address displayed with full public key
- Live ZMOKE balance fetched from Stellar Horizon API
- Store credit balance display

### 4. Payment Flow

1. Customer selects "Stellar" at checkout
2. Redirected to React frontend with `orderId` and `amount`
3. Connects wallet (Albedo) and signs deposit transaction
4. Backend fee-bumps and submits (buyer pays zero gas) ⛽
5. Backend receives webhook, updates order to "Processing"
6. ZMOKE rewards distributed ($1 = 10 ZMOKE)

See [docs/woocommerce_setup.md](docs/woocommerce_setup.md) for detailed setup guide.

---

## 💻 Running the Frontend

### Local Development

```bash
cd frontend
npm install
npm run dev
```

Access at [http://localhost:5173](http://localhost:5173).

### Build for Production

```bash
cd frontend
VITE_BACKEND_URL=https://your-ngrok-url.ngrok-free.dev npm run build
```

### Deploy to Cloudflare Pages

```bash
cd frontend
npx wrangler pages deploy dist --project-name=your-project-name
```

See [docs/DEPLOY_FRONTEND.md](docs/DEPLOY_FRONTEND.md) for Cloudflare deployment details.

---

## 🪙 ZMOKE Token Rewards

Buyers automatically receive ZMOKE tokens as rewards:

- **Rate**: $1 spent = 10 ZMOKE
- **Auto-replenishment**: Backend mints 100k ZMOKE when distributor balance < 50k
- **Requirements**: Buyer must have ZMOKE trustline (frontend provides "Claim ZMOKE" button)

### Setup ZMOKE Tokens

```bash
# Use the setup script
./tools/setup_zmoke.sh

# Or manually (see docs/tokenomics.md)
```

---

## 📜 Smart Contract Operations

---

## 💰 Economics

- **Buyer Pays**: `Price + 1%`
- **Seller Receives**: `Price - 1%`
- **Platform Fee**: Combined **2% fee**
- **Gas Fees**: Sponsored by oracle account (buyers pay zero)
- **Buyer Bonus**: ZMOKE rewards (10 per $1 spent)

---

## 🤖 AI Agent Workflows

If using an AI coding assistant with workflow support:

| Command           | Description                     |
| ----------------- | ------------------------------- |
| `/fund-buyer`     | Swap XLM→USDC for buyer account |
| `/setup-tokens`   | Initialize SMOKY/ZMOKE tokens   |
| `/test-contracts` | Run contract test suite         |

---

## 📁 Project Structure

```
stellar-payment-dapp/
├── backend/              # Go backend server
│   ├── main.go          # Main server (webhooks, escrow, ZMOKE)
│   ├── woocommerce.go   # WC API client
│   └── .env             # Environment config
├── frontend/             # React frontend
│   ├── src/components/  # UI components
│   └── src/services/    # Soroban/Stellar services
├── contracts/            # Soroban smart contracts
│   ├── pool_contract/   # Main pool contract (Blend-integrated)
│   └── zmoke_minter/    # ZMOKE token minter
├── docs/                 # Documentation
│   ├── woocommerce_setup.md
│   ├── DEPLOY_FRONTEND.md
│   ├── tokenomics.md
│   └── ROADMAP.md
├── tools/                # Setup scripts
└── smoky-stellar-gateway.php  # WooCommerce plugin
```

---

## 📚 Documentation

- [WooCommerce Setup](docs/woocommerce_setup.md) - Payment gateway configuration
- [Frontend Deployment](docs/DEPLOY_FRONTEND.md) - Cloudflare Pages setup
- [Tokenomics](docs/tokenomics.md) - SMOKY/ZMOKE token design
- [Roadmap](docs/ROADMAP.md) - Development path

---

## 🔒 Security Notes (Testnet vs Mainnet)

**Current setup is for Testnet only.** For mainnet:

- Move `ZMOKE_ISSUER_SECRET` to a separate secure service
- Implement HSM or multi-sig for token minting
- Use environment-specific configurations
- See [ROADMAP.md](docs/ROADMAP.md) Phase 3 for security checklist

---

## License

MIT
