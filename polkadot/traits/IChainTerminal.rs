/// Trait definition for ChainTerminal — end of the chain, stores the final record.
#[ink::trait_definition]
pub trait IChainTerminal {
    /// Sets the previous link address (last ChainLink in the chain).
    #[ink(message)]
    fn set_prev_link(&mut self, prev_link: AccountId);

    /// Receives the final validated data and stores it permanently.
    /// Called only by the last ChainLink.
    #[ink(message)]
    fn receive_final(&mut self, chain_id: u32, data: Vec<u8>) -> bool;

    /// Returns the stored record for a given chain ID.
    #[ink(message)]
    fn get_record(&self, chain_id: u32) -> (u32, Vec<u8>, [u8; 32], u64, bool);

    /// Returns all stored records.
    #[ink(message)]
    fn get_all_records(
        &self,
    ) -> (Vec<u32>, Vec<Vec<u8>>, Vec<[u8; 32]>, Vec<u64>);

    /// Returns the total number of records stored.
    #[ink(message)]
    fn get_record_count(&self) -> u32;
}