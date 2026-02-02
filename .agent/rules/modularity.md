# Modularity & Reuse Guidelines

This project prioritizes modular components that can be reused across different dApps.

## Contract Modules
Each smart contract should be a standalone crate in the `contracts/` workspace.
- **Manifest**: Define clear `Stellar.toml` and package metadata.
- **Interfaces**: Export a client implementation for easy integration.

## React Components
Frontend components should be designed for the `@stellar/design-system` ecosystem.
- **Props**: Pass dependencies (like Wallet SDK hooks) as props.
- **Styles**: Use standard CSS/Tailwind classes, avoid hardcoded colors.

## Reusable Packages
| Component | Reusability Scope |
|-----------|-------------------|
| `payment_escrow` | Universal Stellar Asset Escrow |
| `zmoke_minter` | Generic Rewards Token Minter |
| `BlendService` | TypeScript SDK for Blend Protocol |
| `Go-Stellar-Webhook` | Generic WooCommerce-Stellar Bridge |
