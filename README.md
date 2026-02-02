# Stellar Payment DApp

A secure, oracle-backed payment escrow platform on the Stellar network (Soroban). This platform allows Buyers to deposit funds into escrow with volatility protection, which are then released to the Seller upon completion of the transaction, with a combined 2% fee going to the Oracle.

## Quick Start

Run the setup script to check dependencies and install packages:
```bash
./setup_dev_env.sh
```

## Prerequisites

- **Stellar CLI**: Install with:
  ```bash
  curl -s https://raw.githubusercontent.com/stellar/bin/main/install.sh | bash
  ```
  ([Official Guide](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup#install-the-stellar-cli))
- **Rust/Cargo**: Install with:
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- **Node.js**: v18+ recommended.
- **Python 3.11+**: For utility scripts.

### Python Environment (Optional, for tools/)
```bash
python3 -m venv venv
./venv/bin/python3 -m pip install stellar-sdk
```

### Frontend Dependencies
```bash
cd frontend && npm install
```

## 1. Setup Identities & Funding

Generate and fund the four required roles on the Testnet:

```bash
# Identities
stellar keys generate deployer --network testnet
stellar keys generate buyer --network testnet
stellar keys generate seller --network testnet
stellar keys generate oracle --network testnet

# Faucet Funding (XLM)
stellar keys fund buyer --network testnet
stellar keys fund seller --network testnet
stellar keys fund deployer --network testnet
stellar keys fund oracle --network testnet
```

### 1.1 Funding with USDC (Swap XLM → USDC)

The Buyer needs USDC for the transaction. Sellers and Oracles also need a USDC trustline.

> 💡 **AI Workflow**: Use `/fund-buyer` to automate this step.

```bash
# Add Trustlines
# Run for buyer, seller, AND oracle:
stellar tx new change-trust \
  --source <IDENTITY_NAME> \
  --line USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 \
  --network testnet \
  --build-only \
  | stellar tx sign --sign-with-key <IDENTITY_NAME> --network testnet \
  | stellar tx send --network testnet

# Swap XLM for USDC (Buyer only)
# Note: Amounts are in STROOPS (1 unit = 10^7 stroops)
# 150 USDC = 1,500,000,000 stroops | 2000 XLM max = 20,000,000,000 stroops
stellar tx new path-payment-strict-receive \
  --source buyer \
  --send-asset native \
  --send-max 20000000000 \
  --dest-asset USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 \
  --dest-amount 1500000000 \
  --destination buyer \
  --network testnet \
  --build-only \
  | stellar tx sign --sign-with-key buyer --network testnet \
  | stellar tx send --network testnet
```

## 2. Deploy & Initialize Contract

> 💡 **AI Workflow**: Use `/deploy-testnet` to automate build, deploy, and initialization.

### 2.1 Build & Deploy
```bash
stellar contract build
stellar contract deploy \
  --wasm target/wasm32v1-none/release/payment_escrow.wasm \
  --source deployer \
  --network testnet \
  --alias payment_escrow
```

### 2.2 Initialize
Initialize the contract with Admin, Fee Recipient, and the Reflector Oracle address.

**Note**: For Testnet, you can use the official Reflector contract address or a mock.
Example Reflector (Testnet): `CAVLP5DH2GJPZMVO7IJY4CVOD5MWEFTJFVPD2YY2FQXOQHRGHK4D6HLP`

```bash
stellar contract invoke \
  --id payment_escrow \
  --source deployer \
  --network testnet \
  -- \
  initialize \
  --admin $(stellar keys address deployer) \
  --fee_recipient $(stellar keys address oracle) \
  --reflector CAVLP5DH2GJPZMVO7IJY4CVOD5MWEFTJFVPD2YY2FQXOQHRGHK4D6HLP
```

## 3. Execute Workflow

### 3.1 Deposit (Buyer)
The Buyer locks funds into the escrow. The contract automatically checks the Reflector Oracle for the price.

```bash
stellar contract invoke \
  --id payment_escrow \
  --source buyer \
  --network testnet \
  -- \
  deposit \
  --buyer $(stellar keys address buyer) \
  --seller $(stellar keys address seller) \
  --token <USDC_TOKEN_ID> \
  --amount <DEPOSIT_AMOUNT_IN_STROOPS> \
  --target_usd_value <TARGET_USD_IN_7_DECIMALS>
```
*Note: Amount and Target Value are in 7 decimals (e.g. 10000000 = 1 unit).*

### 3.2 Release (Admin/Deployer)
Once the transaction terms are met, the Admin releases the funds:

> 💡 **AI Workflow**: Use `/release-escrow` to automate this step.
```bash
stellar contract invoke \
  --id payment_escrow \
  --source deployer \
  --network testnet \
  -- \
  release \
  --escrow_id 1
```

## Economics
- **Buyer Pays**: `Price + 1%`
- **Seller Receives**: `Price - 1%`
- **Oracle Receives**: Combined **2% fee**.

## 4. Running the DApp (Local Development)

The project includes a React frontend for easy interaction.

1.  **Start the Development Server**:
    This will start the Vite frontend (usually port 5173).
    ```bash
    npm run dev
    ```

2.  **Access the DApp**:
    Open [http://localhost:5173](http://localhost:5173) in your browser.

3.  **Usage**:
    *   **Login**: Connect with Albedo or use a Secret Key.
    *   **Deposit**: Fill in the form to create an escrow.
    *   **Verify**: Check balances on the Testnet explorer.

## 5. AI Agent Workflows

If using an AI coding assistant with workflow support, the following slash commands are available in `.agent/workflows/`:

| Command | Description |
|---------|-------------|
| `/deploy-testnet` | Build, deploy & initialize payment_escrow contract |
| `/release-escrow` | Release escrowed funds to seller |
| `/fund-buyer` | Swap XLM→USDC for buyer account |
| `/setup-tokens` | Initialize SMOKY/ZMOKE tokens |
| `/test-contracts` | Run contract test suite |
