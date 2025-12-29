#![cfg(test)]

extern crate std;
use super::{PaymentEscrow, PaymentEscrowClient, EscrowStatus, PriceData, ReflectorTrait};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env, contract, contractimpl,
};

#[contract]
pub struct MockReflector;

#[contractimpl]
impl ReflectorTrait for MockReflector {
    fn last_price(env: Env, _asset: Address) -> Option<PriceData> {
        // Mock Price: 2.0 USD (20_000_000 units)
        Some(PriceData {
            price: 20_000_000, 
            timestamp: env.ledger().timestamp(),
        })
    }
}

fn create_token_contract<'a>(e: &Env, admin: &Address) -> token::StellarAssetClient<'a> {
    let contract_address = e.register_stellar_asset_contract(admin.clone());
    token::StellarAssetClient::new(e, &contract_address)
}

fn create_payment_escrow_contract<'a>(e: &Env) -> PaymentEscrowClient<'a> {
    let contract_address = e.register_contract(None, PaymentEscrow);
    PaymentEscrowClient::new(e, &contract_address)
}

fn create_reflector_contract<'a>(e: &Env) -> Address {
    e.register_contract(None, MockReflector)
}

#[test]
fn test_deposit_and_fees() {
    let env = Env::default();
    env.mock_all_auths();

    // 1. Setup
    let admin = Address::generate(&env);
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let fee_recipient = Address::generate(&env);

    let client = create_payment_escrow_contract(&env);
    let reflector_addr = create_reflector_contract(&env);
    
    let token_admin = Address::generate(&env);
    let token_asset_client = create_token_contract(&env, &token_admin);
    let token_client = token::Client::new(&env, &token_asset_client.address);

    // Initialize Contract
    client.initialize(&admin, &fee_recipient, &reflector_addr);

    // Mint tokens to buyer
    // Scenario: Item costs $200 USD.
    // Exchange Rate: 1 Token = $2.0.
    // Tokens needed for $200 = 100 Tokens.
    // Fee = 1% of Target ($200) = $2.
    // Tokens needed for Fee = 1 Token.
    // Total Tokens Required = 101.
    
    let target_usd_value: i128 = 200; // Let's use low numbers for simplicity, assuming scale is handled consistent
    // Wait, the contract divides by 10_000_000.
    // If we use raw numbers like "200", we must ensure strict scaling.
    // Contract: `calculated_usd_value = (amount * price) / 10_000_000`
    
    // Let's use REAL scaled numbers (7 decimals).
    // Target $2.00 = 20_000_000.
    let target_usd_value = 20_000_000;
    
    // Fee = 1% of 20M = 200_000.
    // Total USD required = 20_200_000.
    
    // Price = 2.0 USD per Token (20_000_000).
    // Tokens Needed = 20_200_000 / 20_000_000 = 1.01 Token.
    // 1.01 Token = 10_100_000 units.
    
    let total_deposit_amount = 10_100_000;
    
    token_asset_client.mint(&buyer, &20_000_000); // Give plenty

    // 2. Deposit
    // Set timestamp
    env.ledger().set_timestamp(1000); 

    let seq = client.deposit(
        &buyer,
        &seller,
        &token_client.address,
        &total_deposit_amount,
        &target_usd_value,
    );

    // 3. Verify Balances
    // Buyer should have 20M - 10.1M = 9.9M
    assert_eq!(token_client.balance(&buyer), 9_900_000);
    // Contract should have 10.1M
    assert_eq!(token_client.balance(&client.address), 10_100_000);

    // 4. Release
    // Logic: 
    // Seller gets Target ($2.00) - 1% = $1.98.
    // Fee Recipient gets the rest ($0.04 - or 2% total spread).
    
    // Tokens:
    // Seller Portion = (Total * 99) / 101.
    // 10.1 * 99 / 101 = 9.9 Token units (9_900_000).
    // Fee Recipient = 10.1 - 9.9 = 0.2 units (200_000).
    
    client.release(&seq);

    // 5. Verify Final Balances
    assert_eq!(token_client.balance(&seller), 9_900_000);
    assert_eq!(token_client.balance(&fee_recipient), 200_000);
    
    // Escrow status should be Released
    let escrow = client.get_escrow(&seq).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Released);
}

#[test]
fn test_refund() {
    let env = Env::default();
    env.mock_all_auths();

    // Setup
    let admin = Address::generate(&env);
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let fee_recipient = Address::generate(&env);

    let client = create_payment_escrow_contract(&env);
    let reflector_addr = create_reflector_contract(&env);
    
    let token_admin = Address::generate(&env);
    let token_asset_client = create_token_contract(&env, &token_admin);
    let token_client = token::Client::new(&env, &token_asset_client.address);

    client.initialize(&admin, &fee_recipient, &reflector_addr);

    // Target: $1.00 (10M). Price 2.0. Need 0.5 Token (+fee).
    let target_usd_value = 10_000_000;
    // 1% Fee = 100_000. Total = 10_100_000 USD.
    // Tokens = 10.1M / 20M = 0.505 Token = 5_050_000 units.
    
    let deposit_amount = 5_050_000;
    token_asset_client.mint(&buyer, &10_000_000);

    let seq = client.deposit(
        &buyer,
        &seller,
        &token_client.address,
        &deposit_amount,
        &target_usd_value,
    );

    // Refund
    client.refund(&seq);

    // Buyer gets everything back
    assert_eq!(token_client.balance(&buyer), 10_000_000);
    let escrow = client.get_escrow(&seq).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Refunded);
}

#[test]
#[should_panic(expected = "Insufficient value for price + fees")]
fn test_insufficient_deposit() {
    let env = Env::default();
    env.mock_all_auths();
    
    let admin = Address::generate(&env);
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let fee_recipient = Address::generate(&env);

    let client = create_payment_escrow_contract(&env);
    let reflector_addr = create_reflector_contract(&env);
    
    let token_admin = Address::generate(&env);
    let token_asset_client = create_token_contract(&env, &token_admin);
    let token_client = token::Client::new(&env, &token_asset_client.address);
    
    client.initialize(&admin, &fee_recipient, &reflector_addr);
    
    let target_usd_value = 20_000_000; // $2.00
    // Required: 10_100_000 tokens (as per test 1).
    // Send less: 10_000_000 tokens.
    
    token_asset_client.mint(&buyer, &20_000_000);
    
    client.deposit(
        &buyer,
        &seller,
        &token_client.address,
        &10_000_000, 
        &target_usd_value,
    );
}
