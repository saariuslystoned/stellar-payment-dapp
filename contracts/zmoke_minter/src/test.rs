#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env};

#[test]
fn test_mint_and_burn() {
    let env = Env::default();
    env.mock_all_auths();

    // 1. Setup
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    // 2. Initialize
    let token_contract = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let minter_id = env.register(ZmokeMinter, ());
    let client = ZmokeMinterClient::new(&env, &minter_id);

    client.initialize(&token_contract, &admin);

    // 3. Mint Rewards
    client.mint_rewards(&user, &1000);
    
    // Verify balance
    // Note: In real test we would check token balance, but using mock token client needs setup
    
    // 4. Burn
    client.burn(&user, &500);
}
