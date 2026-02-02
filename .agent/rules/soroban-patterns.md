# Soroban Smart Contract Patterns

## Security
- **Auth**: Always use `address.require_auth()` for privileged actions.
- **Checks**: Validate all inputs at the start of functions.
- **Balances**: Use safe math (checked_add, checked_sub) or `i128` to prevent overflow.

## Storage
- **Instance**: For global contract state (admin, config).
- **Persistent**: For user balances and long-lived data.
- **Temporary**: For data that can expire (e.g., oracle cache).

## Testing
- Use `soroban_sdk::testutils` for detailed unit tests.
- Verify events are published correctly.
- Test failure cases (unauthorized access, insufficient balance).

## Modularity
- Contracts should implement traits for standard interfaces.
- Separate logic into modules (e.g., `admin`, `storage`, `token`).
