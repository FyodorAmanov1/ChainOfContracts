/// Trait definition for ChainLink — mid-chain contract that processes and forwards.
#[ink::trait_definition]
pub trait IChainLink {
    /// Sets the next link address (another ChainLink or ChainTerminal).
    #[ink(message)]
    fn set_next_link(&mut self, next_link: AccountId);

    /// Sets the previous link address (ChainEntry or previous ChainLink).
    #[ink(message)]
    fn set_prev_link(&mut self, prev_link: AccountId);

    /// Sets the step number for this link in the chain.
    #[ink(message)]
    fn set_step_number(&mut self, step: u32);

    /// Processes incoming data, validates it, and forwards to the next link.
    #[ink(message)]
    fn process_and_forward(&mut self, chain_id: u32, data: Vec<u8>) -> bool;

    /// Alternate entry point so the previous link can call via receive_final.
    #[ink(message)]
    fn receive_final(&mut self, chain_id: u32, data: Vec<u8>) -> bool;

    /// Returns the current step number.
    #[ink(message)]
    fn get_step_number(&self) -> u32;

    /// Returns the next link address.
    #[ink(message)]
    fn get_next_link(&self) -> Option<AccountId>;

    /// Returns the execution count (number of chains processed).
    #[ink(message)]
    fn get_execution_count(&self) -> u32;
}