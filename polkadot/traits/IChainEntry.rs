/// Trait definition for ChainEntry — entry point of the generic message chain.
#[ink::trait_definition]
pub trait IChainEntry {
    /// Sets the address of the next link (first ChainLink).
    #[ink(message)]
    fn set_next_link(&mut self, next_link: AccountId);

    /// Initiates the chain of contracts with the given data.
    /// Returns the chain ID and whether the operation succeeded.
    #[ink(message)]
    fn start_chain(&mut self, data: Vec<u8>) -> (u32, bool);

    /// Returns the receipt for a given chain execution.
    #[ink(message)]
    fn get_receipt(&self, chain_id: u32) -> (u32, AccountId, Vec<u8>, bool);

    /// Returns all chain IDs that have been started.
    #[ink(message)]
    fn get_all_chain_ids(&self) -> Vec<u32>;
}