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

#[test]
fn test_set_blend_usdc_token() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register(PoolContract, ());
    let client = PoolContractClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let circle_usdc = Address::generate(&env);
    let blend_usdc = Address::generate(&env);
    
    // Initialize with Circle USDC
    client.initialize(&admin, &seller, &200u32, &circle_usdc);
    
    // Set Blend USDC token
    client.set_blend_usdc_token(&blend_usdc);
    
    // Contract should still be functional
    let (total_usdc, total_xlm, fees_usdc, fees_xlm, supplied) = client.get_status();
    assert_eq!(total_usdc, 0);
    assert_eq!(total_xlm, 0);
    assert_eq!(fees_usdc, 0);
    assert_eq!(fees_xlm, 0);
    assert_eq!(supplied, false);
}

#[test]
fn test_admin_functions() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register(PoolContract, ());
    let client = PoolContractClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let new_seller = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let blend_usdc = Address::generate(&env);
    
    client.initialize(&admin, &seller, &200u32, &usdc_token);
    
    // Test set_seller
    client.set_seller(&new_seller);
    
    // Test set_fee_percent
    client.set_fee_percent(&300u32);
    
    // Test set_blend_usdc_token
    client.set_blend_usdc_token(&blend_usdc);
    
    // All admin functions should succeed with mock auth
    let (total_usdc, _, _, _, _) = client.get_status();
    assert_eq!(total_usdc, 0);
}
