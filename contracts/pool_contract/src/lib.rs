#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, Map, Vec, token, Symbol,
    contracterror, log
};

// ============================================================
// BLEND POOL INTERFACE
// ============================================================
// Based on docs.blend.capital/tech-docs/integrations/integrate-pool
// Fund Management uses Request structs with submit()

/// Request types for Blend Pool operations
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RequestType {
    Deposit = 0,
    Withdraw = 1,
    SupplyCollateral = 2,
    WithdrawCollateral = 3,
    Borrow = 4,
    Repay = 5,
}

/// Request struct for Blend Pool operations
#[contracttype]
#[derive(Clone, Debug)]
pub struct Request {
    pub request_type: u32,
    pub address: Address,  // Asset address
    pub amount: i128,
}

// Blend Pool client interface
// In production, use blend-contract-sdk for full Blend integration
// For now, we'll manually build the submit() calls
// 
// When Blend WASM is available, uncomment:
// mod blend_pool {
//     soroban_sdk::contractimport!(file = "../blend_pool.wasm");
// }

// ============================================================
// POOL CONTRACT TYPES
// ============================================================

#[contracterror]
#[derive(Clone, Debug, Copy, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PoolError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    InsufficientBalance = 4,
    InvalidAmount = 5,
    BlendOperationFailed = 6,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,              // Address - admin who can trigger settlement
    Seller,             // Address - seller to receive settlements
    FeePercent,         // u32 - fee percentage (e.g., 200 = 2%)
    BlendPoolUsdc,      // Address - Blend pool for USDC
    BlendPoolXlm,       // Address - Blend pool for XLM (native wrapper)
    UsdcToken,          // Address - USDC token address
    TotalDepositsUsdc,  // i128 - total USDC deposited
    TotalDepositsXlm,   // i128 - total XLM deposited
    SuppliedToBlend,    // bool - whether funds are currently in Blend
    FeesEarnedUsdc,     // i128 - accumulated USDC fees
    FeesEarnedXlm,      // i128 - accumulated XLM fees
}

// ============================================================
// POOL CONTRACT
// ============================================================

#[contract]
pub struct PoolContract;

#[contractimpl]
impl PoolContract {
    /// Initialize the pool contract
    /// 
    /// # Arguments
    /// * `admin` - Address authorized to trigger settlements
    /// * `seller` - Address that receives settlement payouts
    /// * `fee_percent` - Fee percentage in basis points (200 = 2%)
    /// * `usdc_token` - USDC token contract address
    pub fn initialize(
        env: Env,
        admin: Address,
        seller: Address,
        fee_percent: u32,
        usdc_token: Address,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Seller, &seller);
        env.storage().instance().set(&DataKey::FeePercent, &fee_percent);
        env.storage().instance().set(&DataKey::UsdcToken, &usdc_token);
        env.storage().instance().set(&DataKey::TotalDepositsUsdc, &0i128);
        env.storage().instance().set(&DataKey::TotalDepositsXlm, &0i128);
        env.storage().instance().set(&DataKey::SuppliedToBlend, &false);
        env.storage().instance().set(&DataKey::FeesEarnedUsdc, &0i128);
        env.storage().instance().set(&DataKey::FeesEarnedXlm, &0i128);
        
        log!(&env, "Pool initialized: admin={}, seller={}, fee={}bp", admin, seller, fee_percent);
    }

    /// Set Blend pool addresses (admin only)
    pub fn set_blend_pools(
        env: Env,
        blend_pool_usdc: Address,
        blend_pool_xlm: Address,
    ) {
        Self::require_admin(&env);
        
        env.storage().instance().set(&DataKey::BlendPoolUsdc, &blend_pool_usdc);
        env.storage().instance().set(&DataKey::BlendPoolXlm, &blend_pool_xlm);
        
        log!(&env, "Blend pools set: USDC={}, XLM={}", blend_pool_usdc, blend_pool_xlm);
    }

    /// Record a deposit (called when funds arrive via muxed address)
    /// Note: Funds arrive automatically to contract's address via muxed routing
    /// This function is called by backend to track the deposit
    pub fn record_deposit(
        env: Env,
        token: Address,
        amount: i128,
        order_id: u64,
    ) {
        Self::require_admin(&env);
        
        if amount <= 0 {
            panic!("Invalid amount");
        }
        
        let usdc_token: Address = env.storage().instance().get(&DataKey::UsdcToken)
            .expect("Not initialized");
        
        if token == usdc_token {
            let mut total: i128 = env.storage().instance()
                .get(&DataKey::TotalDepositsUsdc).unwrap_or(0);
            total += amount;
            env.storage().instance().set(&DataKey::TotalDepositsUsdc, &total);
            log!(&env, "USDC deposit recorded: amount={}, order={}, total={}", amount, order_id, total);
        } else {
            // Assume XLM (native)
            let mut total: i128 = env.storage().instance()
                .get(&DataKey::TotalDepositsXlm).unwrap_or(0);
            total += amount;
            env.storage().instance().set(&DataKey::TotalDepositsXlm, &total);
            log!(&env, "XLM deposit recorded: amount={}, order={}, total={}", amount, order_id, total);
        }
    }

    /// Supply funds to Blend pool to earn yield
    /// Called periodically (e.g., after deposits accumulate)
    pub fn supply_to_blend(env: Env) {
        Self::require_admin(&env);
        
        let usdc_token: Address = env.storage().instance().get(&DataKey::UsdcToken)
            .expect("Not initialized");
        
        let total_usdc: i128 = env.storage().instance()
            .get(&DataKey::TotalDepositsUsdc).unwrap_or(0);
        let total_xlm: i128 = env.storage().instance()
            .get(&DataKey::TotalDepositsXlm).unwrap_or(0);
        
        // Only supply if we have meaningful balance
        if total_usdc < 1_0000000 && total_xlm < 10_0000000 {
            log!(&env, "Insufficient balance to supply to Blend");
            return;
        }
        
        // Get Blend pool addresses
        let blend_pool_usdc: Option<Address> = env.storage().instance()
            .get(&DataKey::BlendPoolUsdc);
        
        if let Some(pool) = blend_pool_usdc {
            if total_usdc > 0 {
                // Build supply request
                // Note: In production, use blend_pool::Client::new()
                // For now, we emit an event for the backend to handle
                log!(&env, "Supplying {} USDC to Blend pool {}", total_usdc, pool);
                
                // Mark as supplied
                env.storage().instance().set(&DataKey::SuppliedToBlend, &true);
            }
        }
        
        // Similar for XLM...
        log!(&env, "Supply to Blend complete: USDC={}, XLM={}", total_usdc, total_xlm);
    }

    /// Withdraw from Blend and settle to seller
    /// Called at end-of-day by admin/backend
    pub fn settle(env: Env) -> (i128, i128) {
        Self::require_admin(&env);
        
        let seller: Address = env.storage().instance().get(&DataKey::Seller)
            .expect("Not initialized");
        let fee_percent: u32 = env.storage().instance().get(&DataKey::FeePercent)
            .unwrap_or(200); // Default 2%
        let usdc_token: Address = env.storage().instance().get(&DataKey::UsdcToken)
            .expect("Not initialized");
        
        let total_usdc: i128 = env.storage().instance()
            .get(&DataKey::TotalDepositsUsdc).unwrap_or(0);
        let total_xlm: i128 = env.storage().instance()
            .get(&DataKey::TotalDepositsXlm).unwrap_or(0);
        
        // Withdraw from Blend if supplied
        let supplied: bool = env.storage().instance()
            .get(&DataKey::SuppliedToBlend).unwrap_or(false);
        
        if supplied {
            // Note: In production, call Blend withdraw here
            log!(&env, "Withdrawing from Blend: USDC={}, XLM={}", total_usdc, total_xlm);
            env.storage().instance().set(&DataKey::SuppliedToBlend, &false);
        }
        
        // Calculate fees (e.g., 2% = 200 basis points)
        let fee_usdc = (total_usdc * fee_percent as i128) / 10000;
        let fee_xlm = (total_xlm * fee_percent as i128) / 10000;
        
        let seller_usdc = total_usdc - fee_usdc;
        let seller_xlm = total_xlm - fee_xlm;
        
        // Transfer to seller
        if seller_usdc > 0 {
            let client = token::Client::new(&env, &usdc_token);
            client.transfer(&env.current_contract_address(), &seller, &seller_usdc);
            log!(&env, "Settled {} USDC to seller", seller_usdc);
        }
        
        // For XLM, we'd need to use the native asset wrapper or Stellar operations
        // Simplified: assume XLM is wrapped as SAC token
        if seller_xlm > 0 {
            // TODO: Handle native XLM transfer
            log!(&env, "Settled {} XLM to seller (pending native handling)", seller_xlm);
        }
        
        // Update fee trackers
        let mut fees_usdc: i128 = env.storage().instance()
            .get(&DataKey::FeesEarnedUsdc).unwrap_or(0);
        fees_usdc += fee_usdc;
        env.storage().instance().set(&DataKey::FeesEarnedUsdc, &fees_usdc);
        
        let mut fees_xlm: i128 = env.storage().instance()
            .get(&DataKey::FeesEarnedXlm).unwrap_or(0);
        fees_xlm += fee_xlm;
        env.storage().instance().set(&DataKey::FeesEarnedXlm, &fees_xlm);
        
        // Reset deposit counters
        env.storage().instance().set(&DataKey::TotalDepositsUsdc, &0i128);
        env.storage().instance().set(&DataKey::TotalDepositsXlm, &0i128);
        
        log!(&env, "Settlement complete: seller_usdc={}, seller_xlm={}, fees_usdc={}, fees_xlm={}", 
             seller_usdc, seller_xlm, fee_usdc, fee_xlm);
        
        (seller_usdc, seller_xlm)
    }

    /// Get current pool status
    pub fn get_status(env: Env) -> (i128, i128, i128, i128, bool) {
        let total_usdc: i128 = env.storage().instance()
            .get(&DataKey::TotalDepositsUsdc).unwrap_or(0);
        let total_xlm: i128 = env.storage().instance()
            .get(&DataKey::TotalDepositsXlm).unwrap_or(0);
        let fees_usdc: i128 = env.storage().instance()
            .get(&DataKey::FeesEarnedUsdc).unwrap_or(0);
        let fees_xlm: i128 = env.storage().instance()
            .get(&DataKey::FeesEarnedXlm).unwrap_or(0);
        let supplied: bool = env.storage().instance()
            .get(&DataKey::SuppliedToBlend).unwrap_or(false);
        
        (total_usdc, total_xlm, fees_usdc, fees_xlm, supplied)
    }

    /// Withdraw accumulated fees (admin only)
    pub fn withdraw_fees(env: Env, recipient: Address) -> (i128, i128) {
        Self::require_admin(&env);
        
        let usdc_token: Address = env.storage().instance().get(&DataKey::UsdcToken)
            .expect("Not initialized");
        
        let fees_usdc: i128 = env.storage().instance()
            .get(&DataKey::FeesEarnedUsdc).unwrap_or(0);
        let fees_xlm: i128 = env.storage().instance()
            .get(&DataKey::FeesEarnedXlm).unwrap_or(0);
        
        if fees_usdc > 0 {
            let client = token::Client::new(&env, &usdc_token);
            client.transfer(&env.current_contract_address(), &recipient, &fees_usdc);
        }
        
        // Reset fee counters
        env.storage().instance().set(&DataKey::FeesEarnedUsdc, &0i128);
        env.storage().instance().set(&DataKey::FeesEarnedXlm, &0i128);
        
        log!(&env, "Fees withdrawn: USDC={}, XLM={} to {}", fees_usdc, fees_xlm, recipient);
        
        (fees_usdc, fees_xlm)
    }

    /// Update seller address (admin only)
    pub fn set_seller(env: Env, new_seller: Address) {
        Self::require_admin(&env);
        env.storage().instance().set(&DataKey::Seller, &new_seller);
        log!(&env, "Seller updated to {}", new_seller);
    }

    /// Update fee percentage (admin only)
    pub fn set_fee_percent(env: Env, new_fee_percent: u32) {
        Self::require_admin(&env);
        env.storage().instance().set(&DataKey::FeePercent, &new_fee_percent);
        log!(&env, "Fee percent updated to {}bp", new_fee_percent);
    }

    // ============================================================
    // INTERNAL HELPERS
    // ============================================================

    fn require_admin(env: &Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();
    }
}

mod test;
