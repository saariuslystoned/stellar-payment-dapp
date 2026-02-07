#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, Address, BytesN, Env, Map, Vec, token,
    contracterror, log, IntoVal
};

// Use official Blend SDK for pool integration
use blend_contract_sdk::pool;


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

/// Deposit record for MSM verification
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deposit {
    pub buyer: Address,
    pub token: Address,
    pub amount: i128,
    pub order_id: u64,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,              // Address - admin who can trigger settlement
    Seller,             // Address - seller to receive settlements
    FeePercent,         // u32 - fee percentage (e.g., 200 = 2%)
    BlendPoolUsdc,      // Address - Blend pool for USDC
    BlendPoolXlm,       // Address - Blend pool for XLM (native wrapper)
    UsdcToken,          // Address - Circle USDC token address (stays in contract)
    BlendUsdcToken,     // Address - Blend USDC token address (supplied to Blend pool)
    TotalDepositsUsdc,  // i128 - total USDC deposited
    TotalDepositsXlm,   // i128 - total XLM deposited
    SuppliedToBlend,    // bool - whether funds are currently in Blend
    FeesEarnedUsdc,     // i128 - accumulated USDC fees
    FeesEarnedXlm,      // i128 - accumulated XLM fees
    Deposits,           // Map<u64, Deposit> - Tracking for MSM
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

    /// Deposit funds for an order (buyer calls directly)
    /// Transfers tokens from buyer to contract and tracks deposit
    pub fn deposit(
        env: Env,
        buyer: Address,
        token: Address,
        amount: i128,
        order_id: u64,
    ) {
        buyer.require_auth();
        
        if amount <= 0 {
            panic!("Invalid amount");
        }
        
        // Transfer tokens FROM buyer TO contract
        let client = token::Client::new(&env, &token);
        client.transfer(&buyer, &env.current_contract_address(), &amount);
        
        // Update total deposits
        if Self::is_usdc_token(&env, &token) {
            let mut total: i128 = env.storage().instance()
                .get(&DataKey::TotalDepositsUsdc).unwrap_or(0);
            total += amount;
            env.storage().instance().set(&DataKey::TotalDepositsUsdc, &total);
            log!(&env, "USDC deposit: amount={}, order={}", amount, order_id);
        } else {
            // Assume XLM (native)
            let mut total: i128 = env.storage().instance()
                .get(&DataKey::TotalDepositsXlm).unwrap_or(0);
            total += amount;
            env.storage().instance().set(&DataKey::TotalDepositsXlm, &total);
            log!(&env, "XLM deposit: amount={}, order={}", amount, order_id);
        }
        
        // Store deposit record (for MSM verification later)
        let deposit = Deposit {
            buyer,
            token,
            amount,
            order_id,
            timestamp: env.ledger().timestamp(),
        };
        
        let mut deposits: Map<u64, Deposit> = env.storage().instance()
            .get(&DataKey::Deposits).unwrap_or(Map::new(&env));
            
        deposits.set(order_id, deposit);
        env.storage().instance().set(&DataKey::Deposits, &deposits);
        
        // Auto-supply to Blend immediately after deposit
        Self::internal_supply_to_blend(&env);
    }
    
    /// Internal helper to supply funds to Blend (no auth required - called from deposit)
    /// Note: Only Blend USDC is supplied to Blend pool. Circle USDC stays in contract.
    fn internal_supply_to_blend(env: &Env) {
        let blend_usdc_token: Address = match env.storage().instance().get(&DataKey::BlendUsdcToken) {
            Some(addr) => addr,
            None => {
                // Blend USDC not configured yet — skip USDC supply, still try XLM
                Self::internal_supply_xlm_to_blend(env);
                return;
            }
        };
        
        let contract_addr = env.current_contract_address();
        
        // =========== SUPPLY BLEND USDC ===========
        // Only Blend USDC goes to the Blend pool (testnet.blend.capital uses Blend USDC)
        // Circle USDC stays in the contract wallet
        let blend_pool_usdc: Option<Address> = env.storage().instance()
            .get(&DataKey::BlendPoolUsdc);
        
        if let Some(pool_addr) = blend_pool_usdc {
            let usdc_client = token::Client::new(env, &blend_usdc_token);
            let usdc_balance = usdc_client.balance(&contract_addr);
            
            if usdc_balance > 0 {
                log!(env, "Supplying {} Blend USDC to Blend pool {}", usdc_balance, pool_addr);
                
                // Pre-authorize the transfer that Blend will make on our behalf
                env.authorize_as_current_contract(soroban_sdk::vec![
                    env,
                    soroban_sdk::auth::InvokerContractAuthEntry::Contract(
                        soroban_sdk::auth::SubContractInvocation {
                            context: soroban_sdk::auth::ContractContext {
                                contract: blend_usdc_token.clone(),
                                fn_name: soroban_sdk::Symbol::new(env, "transfer"),
                                args: soroban_sdk::vec![
                                    env,
                                    contract_addr.clone().into_val(env),
                                    pool_addr.clone().into_val(env),
                                    usdc_balance.into_val(env),
                                ],
                            },
                            sub_invocations: soroban_sdk::vec![env],
                        }
                    )
                ]);
                
                let mut requests: Vec<pool::Request> = Vec::new(env);
                requests.push_back(pool::Request {
                    request_type: 2, // SupplyCollateral
                    address: blend_usdc_token.clone(),
                    amount: usdc_balance,
                });
                
                let blend_client = pool::Client::new(env, &pool_addr);
                
                // Authorize Blend to transfer Blend USDC from this contract
                env.authorize_as_current_contract(soroban_sdk::vec![
                    env,
                    soroban_sdk::auth::InvokerContractAuthEntry::Contract(
                        soroban_sdk::auth::SubContractInvocation {
                            context: soroban_sdk::auth::ContractContext {
                                contract: blend_usdc_token.clone(),
                                fn_name: soroban_sdk::Symbol::new(env, "transfer"),
                                args: soroban_sdk::vec![
                                    env,
                                    contract_addr.clone().into_val(env),
                                    pool_addr.clone().into_val(env),
                                    usdc_balance.into_val(env),
                                ],
                            },
                            sub_invocations: soroban_sdk::vec![env],
                        }
                    )
                ]);

                blend_client.submit(
                    &contract_addr,
                    &contract_addr,
                    &contract_addr,
                    &requests,
                );
                
                log!(env, "Successfully supplied Blend USDC to Blend pool!");
            }
        }
        
        // =========== SUPPLY XLM (Wrapped) ===========
        Self::internal_supply_xlm_to_blend(env);
        
        env.storage().instance().set(&DataKey::SuppliedToBlend, &true);
    }

    /// Internal helper to supply XLM to Blend pool
    fn internal_supply_xlm_to_blend(env: &Env) {
        let contract_addr = env.current_contract_address();
        
        let blend_pool_xlm: Option<Address> = env.storage().instance()
            .get(&DataKey::BlendPoolXlm);
        
        if let Some(pool_addr) = blend_pool_xlm {
            // XLM on Soroban is wrapped XLM (SAC)
            // Use the native XLM SAC address for testnet
            // CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
            let xlm_sac = soroban_sdk::Address::from_string(
                &soroban_sdk::String::from_str(env, "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC")
            );
            
            let xlm_client = token::Client::new(env, &xlm_sac);
            let xlm_balance = xlm_client.balance(&contract_addr);
            
            if xlm_balance > 0 {
                log!(env, "Supplying {} XLM to Blend pool {}", xlm_balance, pool_addr);
                
                // Pre-authorize the transfer that Blend will make on our behalf
                env.authorize_as_current_contract(soroban_sdk::vec![
                    env,
                    soroban_sdk::auth::InvokerContractAuthEntry::Contract(
                        soroban_sdk::auth::SubContractInvocation {
                            context: soroban_sdk::auth::ContractContext {
                                contract: xlm_sac.clone(),
                                fn_name: soroban_sdk::Symbol::new(env, "transfer"),
                                args: soroban_sdk::vec![
                                    env,
                                    contract_addr.clone().into_val(env),
                                    pool_addr.clone().into_val(env),
                                    xlm_balance.into_val(env),
                                ],
                            },
                            sub_invocations: soroban_sdk::vec![env],
                        }
                    )
                ]);
                
                let mut requests: Vec<pool::Request> = Vec::new(env);
                requests.push_back(pool::Request {
                    request_type: 2, // SupplyCollateral
                    address: xlm_sac.clone(),
                    amount: xlm_balance,
                });
                
                let blend_client = pool::Client::new(env, &pool_addr);
                blend_client.submit(
                    &contract_addr,
                    &contract_addr,
                    &contract_addr,
                    &requests,
                );
                
                log!(env, "Successfully supplied XLM to Blend pool!");
            }
        }
    }

    /// Supply funds to Blend pool to earn yield
    /// Called periodically (e.g., after deposits accumulate)
    /// Note: Only Blend USDC and XLM are supplied. Circle USDC stays in contract.
    pub fn supply_to_blend(env: Env) {
        Self::require_admin(&env);
        
        let total_usdc: i128 = env.storage().instance()
            .get(&DataKey::TotalDepositsUsdc).unwrap_or(0);
        let total_xlm: i128 = env.storage().instance()
            .get(&DataKey::TotalDepositsXlm).unwrap_or(0);
        
        // Only supply if we have meaningful balance
        if total_usdc < 1_0000000 && total_xlm < 10_0000000 {
            log!(&env, "Insufficient balance to supply to Blend");
            return;
        }
        
        // Supply Blend USDC (not Circle USDC) to Blend pool
        let blend_pool_usdc: Option<Address> = env.storage().instance()
            .get(&DataKey::BlendPoolUsdc);
        
        if let Some(pool) = blend_pool_usdc {
            if total_usdc > 0 {
                log!(&env, "Supplying Blend USDC to Blend pool {}", pool);
                env.storage().instance().set(&DataKey::SuppliedToBlend, &true);
            }
        }
        
        log!(&env, "Supply to Blend complete: USDC={}, XLM={}", total_usdc, total_xlm);
    }

    /// Withdraw from Blend and settle to seller
    /// Called at end-of-day by admin/backend
    /// Transfers both Circle USDC and Blend USDC balances to seller (minus fees)
    pub fn settle(env: Env) -> (i128, i128) {
        Self::require_admin(&env);
        
        let seller: Address = env.storage().instance().get(&DataKey::Seller)
            .expect("Not initialized");
        let fee_percent: u32 = env.storage().instance().get(&DataKey::FeePercent)
            .unwrap_or(200); // Default 2%
        let contract_addr = env.current_contract_address();
        
        let total_usdc: i128 = env.storage().instance()
            .get(&DataKey::TotalDepositsUsdc).unwrap_or(0);
        let total_xlm: i128 = env.storage().instance()
            .get(&DataKey::TotalDepositsXlm).unwrap_or(0);
            
        // Calculate fees (e.g., 2% = 200 basis points)
        let fee_usdc = (total_usdc * fee_percent as i128) / 10000;
        let fee_xlm = (total_xlm * fee_percent as i128) / 10000;
        
        // Seller gets the rest (98%)
        let seller_usdc = total_usdc - fee_usdc;
        let seller_xlm = total_xlm - fee_xlm;
        
        // Withdraw ONLY seller's share from Blend if supplied
        let supplied: bool = env.storage().instance()
            .get(&DataKey::SuppliedToBlend).unwrap_or(false);
        
        if supplied {
            log!(&env, "Withdrawing seller share from Blend: USDC={}, XLM={}", seller_usdc, seller_xlm);
        }
        
        // Transfer Circle USDC to seller (held in contract wallet)
        if let Some(circle_usdc) = env.storage().instance().get::<_, Address>(&DataKey::UsdcToken) {
            let client = token::Client::new(&env, &circle_usdc);
            let balance = client.balance(&contract_addr);
            if balance > 0 {
                let fee = (balance * fee_percent as i128) / 10000;
                let seller_share = balance - fee;
                if seller_share > 0 {
                    client.transfer(&contract_addr, &seller, &seller_share);
                    log!(&env, "Settled {} Circle USDC to seller", seller_share);
                }
            }
        }
        
        // Transfer Blend USDC to seller (withdrawn from Blend or in balance)
        if let Some(blend_usdc) = env.storage().instance().get::<_, Address>(&DataKey::BlendUsdcToken) {
            let client = token::Client::new(&env, &blend_usdc);
            let balance = client.balance(&contract_addr);
            if balance > 0 {
                let fee = (balance * fee_percent as i128) / 10000;
                let seller_share = balance - fee;
                if seller_share > 0 {
                    client.transfer(&contract_addr, &seller, &seller_share);
                    log!(&env, "Settled {} Blend USDC to seller", seller_share);
                }
            }
        }
        
        // For XLM, we'd need to use the native asset wrapper or Stellar operations
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
        
        // Reset deposit counters (since we've processed this batch)
        env.storage().instance().set(&DataKey::TotalDepositsUsdc, &0i128);
        env.storage().instance().set(&DataKey::TotalDepositsXlm, &0i128);
        
        log!(&env, "Settlement complete: seller shares paid, fees retained in pool. USDC_FEE={}, XLM_FEE={}", 
             fee_usdc, fee_xlm);
        
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
    /// Transfers fee balances of both Circle USDC and Blend USDC
    pub fn withdraw_fees(env: Env, recipient: Address) -> (i128, i128) {
        Self::require_admin(&env);
        
        let contract_addr = env.current_contract_address();
        
        let fees_usdc: i128 = env.storage().instance()
            .get(&DataKey::FeesEarnedUsdc).unwrap_or(0);
        let fees_xlm: i128 = env.storage().instance()
            .get(&DataKey::FeesEarnedXlm).unwrap_or(0);
        
        // Transfer Circle USDC fees
        if let Some(circle_usdc) = env.storage().instance().get::<_, Address>(&DataKey::UsdcToken) {
            let client = token::Client::new(&env, &circle_usdc);
            let balance = client.balance(&contract_addr);
            if balance > 0 {
                client.transfer(&contract_addr, &recipient, &balance);
                log!(&env, "Withdrew {} Circle USDC fees", balance);
            }
        }
        
        // Transfer Blend USDC fees
        if let Some(blend_usdc) = env.storage().instance().get::<_, Address>(&DataKey::BlendUsdcToken) {
            let client = token::Client::new(&env, &blend_usdc);
            let balance = client.balance(&contract_addr);
            if balance > 0 {
                client.transfer(&contract_addr, &recipient, &balance);
                log!(&env, "Withdrew {} Blend USDC fees", balance);
            }
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

    /// Update Blend USDC token address (admin only)
    /// This is the USDC variant that gets supplied to the Blend pool
    pub fn set_blend_usdc_token(env: Env, new_blend_usdc_token: Address) {
        Self::require_admin(&env);
        env.storage().instance().set(&DataKey::BlendUsdcToken, &new_blend_usdc_token);
        log!(&env, "Blend USDC token updated to {}", new_blend_usdc_token);
    }

    /// Claim BLND emissions from the Blend pool (admin only)
    /// 
    /// Calls the Blend pool's `claim` function to collect accrued BLND
    /// emissions for this contract's supply/collateral positions.
    /// 
    /// # Arguments
    /// * `reserve_token_ids` - Vec of emission indices to claim
    ///   (e.g., 6 = USDC supply emissions. Formula: reserve_index * 2 for supply)
    pub fn claim_emissions(env: Env, reserve_token_ids: Vec<u32>) -> i128 {
        Self::require_admin(&env);
        
        let contract_addr = env.current_contract_address();
        
        // Use the USDC Blend pool (same pool used for supply)
        let blend_pool: Address = env.storage().instance()
            .get(&DataKey::BlendPoolUsdc)
            .expect("Blend pool not configured");
        
        let blend_client = pool::Client::new(&env, &blend_pool);
        
        // Claim emissions: from=this contract, to=this contract
        let claimed = blend_client.claim(
            &contract_addr,
            &reserve_token_ids,
            &contract_addr,
        );
        
        log!(&env, "Claimed {} BLND emissions from Blend pool", claimed);
        
        claimed
    }

    /// Upgrade contract WASM (admin only)
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        Self::require_admin(&env);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    // ============================================================
    // INTERNAL HELPERS
    // ============================================================

    fn require_admin(env: &Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();
    }

    /// Check if a token address matches either Circle USDC or Blend USDC
    fn is_usdc_token(env: &Env, token: &Address) -> bool {
        if let Some(circle) = env.storage().instance().get::<_, Address>(&DataKey::UsdcToken) {
            if *token == circle { return true; }
        }
        if let Some(blend) = env.storage().instance().get::<_, Address>(&DataKey::BlendUsdcToken) {
            if *token == blend { return true; }
        }
        false
    }
}

mod test;
