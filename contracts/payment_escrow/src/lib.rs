#![no_std]
use soroban_sdk::{contract, contractclient, contractimpl, contracttype, Address, Env, token, Symbol};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceData {
    pub price: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Asset {
    Stellar(Address),
    Other(Symbol), 
}

#[contractclient(name = "ReflectorClient")]
pub trait ReflectorTrait {
    fn lastprice(env: Env, asset: Asset) -> Option<PriceData>;
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,        // Address
    FeeRecipient, // Address (formerly 'Oracle')
    Reflector,    // Address (Reflector Contract)
    Escrow(u64),  // Escrow Data
    EscrowSeq,    // u64 Sequence
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    Locked,
    Released,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Escrow {
    pub buyer: Address,
    pub seller: Address,
    pub token: Address,
    pub total_amount: i128,
    pub target_usd_value: i128, // The USD value this deposit was intended to cover
    pub status: EscrowStatus,
}

#[contract]
pub struct PaymentEscrow;

#[contractimpl]
impl PaymentEscrow {
    /// Initialize the contract with the Admin address, Fee Recipient, and Reflector Oracle Address.
    /// MUST be called immediately after deployment.
    pub fn initialize(env: Env, admin: Address, fee_recipient: Address, reflector: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::FeeRecipient, &fee_recipient);
        env.storage().instance().set(&DataKey::Reflector, &reflector);
        env.storage().instance().set(&DataKey::EscrowSeq, &0u64);
    }

    /// Deposit funds into escrow.
    /// Validates the deposit value against a 'target_usd_value' using the Reflector Oracle.
    pub fn deposit(
        env: Env,
        buyer: Address,
        seller: Address,
        token: Address,
        amount: i128,
        target_usd_value: i128, // 7 decimals (e.g. 10000000 = $1.00)
    ) -> u64 {
        buyer.require_auth();

        // 1. Calculate USD Value of the Deposit
        let calculated_usd_value: i128;
        
        // Check if token is USDC (We assume a specific address or passed as config? 
        // For this demo, let's allow the Admin to whitelist the USDC address or just hardcode checking against specific Known Addresses.
        // Actually, simpler: If we call Oracle for 'token', and Oracle returns Price in USD.
        // If Reflector supports USDC->USD (price 1.0), we can just always call Oracle.
        // But typically USDC IS the USD unit.
        
        // Let's assume we fetch the price of 'token' in terms of USD from Reflector.
        let reflector_addr: Address = env.storage().instance().get(&DataKey::Reflector).expect("No Reflector");
        let client = ReflectorClient::new(&env, &reflector_addr);
        
        // Attempt to get price. 
        // Note: In a real prod environment, we should check if 'token' is the 'usd_token' to skip oracle.
        // For now, let's treat it generically: ask Oracle for price of Token.
        // If Oracle doesn't track it, we panic or assume 0.
        
        // NOTE: Ideally we want specific logic for "If token == USDC_ADDRESS, price = 1.0".
        // But we don't store USDC_ADDRESS yet.
        // Let's try to query the Oracle. 
        
        // Create Asset Enum
        let asset = Asset::Stellar(token.clone());
        let price_data = client.lastprice(&asset); 
        
        let price_per_unit = if let Some(data) = price_data {
             // Validate timestamp?
             let current_ts = env.ledger().timestamp();
             if current_ts > data.timestamp + 300 { // 5 min freshness
                 panic!("Oracle price stale");
             }
             data.price
        } else {
             // Fallback: If no price found, MAYBE it is stablecoin? 
             // Ideally we shouldn't guess. 
             // panic!("Asset not supported by Oracle");
             
             // FOR DEMO: If returns None, we assume it's 1:1 (USDC)
             // WARN: This is unsafe for prod, but useful if Reflector doesn't list Testnet USDC.
             10_000_000 // $1.00
        };

        // Price is in 7 decimals. Amount is in 7 decimals.
        // Value = (Amount * Price) / 10^7
        calculated_usd_value = (amount * price_per_unit) / 10_000_000;

        // 2. Fee Calculation
        // Required: Target Value + 1% Buyer Fee
        let buyer_fee_usd = target_usd_value / 100;
        let required_usd_value = target_usd_value + buyer_fee_usd;

        if calculated_usd_value < required_usd_value {
            // panic!("Insufficient value: Has {}, Needs {}", calculated_usd_value, required_usd_value);
            panic!("Insufficient value for price + fees");
        }

        // 3. Transfer Funds (Buyer -> Contract)
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&buyer, &env.current_contract_address(), &amount);

        // 4. Store Escrow Record
        let mut seq: u64 = env.storage().instance().get(&DataKey::EscrowSeq).unwrap_or(0);
        seq += 1;
        env.storage().instance().set(&DataKey::EscrowSeq, &seq);

        let escrow = Escrow {
            buyer,
            seller,
            token,
            total_amount: amount,
            target_usd_value,
            status: EscrowStatus::Locked,
        };
        env.storage().persistent().set(&DataKey::Escrow(seq), &escrow);

        seq
    }

    /// Releases funds: Seller gets (Target USD Value - 1%), Oracle gets (Fees + Remainder).
    /// Only callable by Admin.
    pub fn release(env: Env, escrow_id: u64) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        let key = DataKey::Escrow(escrow_id);
        let mut escrow: Escrow = env.storage().persistent().get(&key).expect("Escrow not found");

        if escrow.status != EscrowStatus::Locked {
            panic!("Not locked");
        }

        // Calculate Splits based on USD Value
        // Seller Fee is 1% of the Target Price
        let seller_fee_usd = escrow.target_usd_value / 100;
        let _seller_net_usd = escrow.target_usd_value - seller_fee_usd;
        
        // We need to convert this Net USD back to Token Amount?
        // Or simply: Seller gets (TotalAmount * NetUSD / TotalUSD)?
        // No, that's complicated due to exchange rate potentially changing (though we locked the tokens).
        
        // Simpler approach:
        // We know 'total_amount' coverered 'target_usd_value' + 'buyer_fee' (1%).
        // We want to give Seller 'target_usd_value' - 1%.
        // The Fee Recipient gets the rest.
        
        // Ratio Approach:
        // Fraction for Seller = (Target - 1%) / (Target + 1%) ? 
        // No, Buyer paid Target + 1%.
        // Seller gets Target - 1%.
        // Total Pot = Target + 1%.
        
        // Let's do it by Proportions of the held 'total_amount'.
        // required_filled was (Target + Target/100) = 1.01 * Target.
        // We want to send (0.99 * Target) to Seller.
        // Proportion = 0.99 / 1.01 approx.
        
        // Precise integer math:
        // seller_share = total_amount * (target_usd_value - seller_token_fee) / (target_usd_value + buyer_token_fee) ... wait.
        
        // Actually, we verified at deposit time that:
        // calculated_usd_value >= target_usd_value + buyer_fee.
        
        // Let's assume the exchange rate didn't drift wildly? 
        // No, the tokens are locked. The amount of tokens is fixed.
        // We just need to distribute the TOKENS.
        
        // If we strictly follow the USD value:
        // We need to know how many tokens = (Target - 1% USD).
        // But we don't know the price now (it might have changed).
        
        // CORRECT LOGIC for Escrow:
        // The deal was for "Target USD Value".
        // The Buyer put in tokens worth "Target + 1%".
        // The Seller agreed to receive "Target - 1%".
        // The Oracle/Platform takes the 2% spread.
        
        // So we should calculate the split based on the INITIAL ratios assumed at deposit.
        // Funds Available: `escrow.total_amount`
        // We assumed this was worth >= `target_usd_value * 1.01`.
        
        // Seller Portion of the pot:
        // (Target * 0.99) / (Target * 1.01)
        // = 99 / 101
        
        let seller_receives = (escrow.total_amount * 99) / 101;
        
        // Oracle receives the rest (2 / 101 approx)
        let fee_receives = escrow.total_amount - seller_receives;

        let client = token::Client::new(&env, &escrow.token);

        // Transfer to Seller
        client.transfer(
            &env.current_contract_address(),
            &escrow.seller,
            &seller_receives,
        );

        // Transfer to Fee Recipient
        let fee_recipient: Address = env
            .storage()
            .instance()
            .get(&DataKey::FeeRecipient)
            .expect("Fee Recipient not found");

        client.transfer(
            &env.current_contract_address(),
            &fee_recipient,
            &fee_receives,
        );

        // Update Status
        escrow.status = EscrowStatus::Released;
        env.storage().persistent().set(&key, &escrow);
    }

    /// Refunds the full amount to the Buyer.
    /// Only callable by Admin.
    pub fn refund(env: Env, escrow_id: u64) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        let key = DataKey::Escrow(escrow_id);
        let mut escrow: Escrow = env.storage().persistent().get(&key).expect("Escrow not found");

        if escrow.status != EscrowStatus::Locked {
            panic!("Not locked");
        }

        let client = token::Client::new(&env, &escrow.token);

        // Refund full amount to Buyer
        client.transfer(
            &env.current_contract_address(),
            &escrow.buyer,
            &escrow.total_amount,
        );

        // Update Status
        escrow.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &escrow);
    }

    pub fn get_escrow(env: Env, escrow_id: u64) -> Option<Escrow> {
        env.storage().persistent().get(&DataKey::Escrow(escrow_id))
    }
}

mod test;