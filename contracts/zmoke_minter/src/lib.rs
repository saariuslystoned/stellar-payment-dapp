#![no_std]
use soroban_sdk::{contract, contractimpl, token, Address, Env, Symbol};

/// ZMOKE Token Minter Contract
/// 
/// Features:
/// - Admin-controlled minting for loyalty rewards
/// - User-initiated burning
/// 
/// TODO: Upgrade to OpenZeppelin when MCP supports v0.6.0 crates
/// (adds roles, pausable, upgradeable features)
#[contract]
pub struct ZmokeMinter;

#[contractimpl]
impl ZmokeMinter {
    /// Initialize with token address and admin
    pub fn initialize(env: Env, token: Address, admin: Address) {
        env.storage().instance().set(&Symbol::new(&env, "token"), &token);
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
    }

    /// Mint ZMOKE rewards (admin only)
    pub fn mint_rewards(env: Env, to: Address, amount: i128) {
        let admin: Address = env.storage().instance().get(&Symbol::new(&env, "admin")).unwrap();
        admin.require_auth();

        let token_addr: Address = env.storage().instance().get(&Symbol::new(&env, "token")).unwrap();
        let client = token::StellarAssetClient::new(&env, &token_addr);
        
        client.mint(&to, &amount);
    }

    /// Burn ZMOKE (user must auth)
    pub fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();

        let token_addr: Address = env.storage().instance().get(&Symbol::new(&env, "token")).unwrap();
        let client = token::Client::new(&env, &token_addr);

        client.burn(&from, &amount);
    }
}

#[cfg(test)]
mod test;
