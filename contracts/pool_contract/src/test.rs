// Tests for Pool Contract
#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

#[test]
fn test_initialize() {
    let env = Env::default();
    let contract_id = env.register(PoolContract, ());
    let client = PoolContractClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    
    client.initialize(&admin, &seller, &200u32, &usdc_token);
    
    let (total_usdc, total_xlm, fees_usdc, fees_xlm, supplied) = client.get_status();
    
    assert_eq!(total_usdc, 0);
    assert_eq!(total_xlm, 0);
    assert_eq!(fees_usdc, 0);
    assert_eq!(fees_xlm, 0);
    assert_eq!(supplied, false);
}
