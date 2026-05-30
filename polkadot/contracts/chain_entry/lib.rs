#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod chain_entry {
    use ink::env::call::{
        build_call,
        ExecutionInput,
        Selector,
    };
    use ink::prelude::vec::Vec;

    #[derive(scale::Decode, scale::Encode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub struct ChainReceipt {
        pub chain_id: u32,
        pub initiator: AccountId,
        pub data: Vec<u8>,
        pub completed: bool,
    }

    #[ink(storage)]
    pub struct ChainEntry {
        next_link: Option<AccountId>,
        owner: AccountId,
        chain_counter: u32,
        receipts: ink::storage::Mapping<u32, ChainReceipt>,
        chain_id_list: Vec<u32>,
    }

    #[ink(event)]
    pub struct ChainStarted {
        #[ink(topic)]
        chain_id: u32,
        #[ink(topic)]
        initiator: AccountId,
        data: Vec<u8>,
    }

    #[ink(event)]
    pub struct EntryExecuted {
        #[ink(topic)]
        chain_id: u32,
        #[ink(topic)]
        next_link: AccountId,
    }

    impl ChainEntry {
        #[ink(constructor)]
        pub fn new() -> Self {
            Self {
                next_link: None,
                owner: Self::env().caller(),
                chain_counter: 0,
                receipts: ink::storage::Mapping::new(),
                chain_id_list: Vec::new(),
            }
        }

        #[ink(message)]
        pub fn set_next_link(&mut self, next_link: AccountId) {
            self.ensure_owner();
            self.next_link = Some(next_link);
        }

        #[ink(message)]
        pub fn start_chain(&mut self, data: Vec<u8>) -> (u32, bool) {
            let next_link = self.next_link.expect("NextLink not set");
            assert!(!data.is_empty(), "Data cannot be empty");

            self.chain_counter += 1;
            let chain_id = self.chain_counter;

            self.receipts.insert(chain_id, &ChainReceipt {
                chain_id,
                initiator: self.env().caller(),
                data: data.clone(),
                completed: false,
            });
            self.chain_id_list.push(chain_id);

            self.env().emit_event(ChainStarted {
                chain_id,
                initiator: self.env().caller(),
                data: data.clone(),
            });

            self.env().emit_event(EntryExecuted {
                chain_id,
                next_link,
            });

            // Forward to first ChainLink via process_and_forward
            let result: bool = build_call::<ink::env::DefaultEnvironment>()
                .call(next_link)
                .gas_limit(5000000000)
                .transferred_value(0)
                .exec_input(
                    ExecutionInput::new(Selector::new(ink::selector_bytes!("process_and_forward")))
                        .push_arg(chain_id)
                        .push_arg(data),
                )
                .returns::<bool>()
                .invoke();

            assert!(result, "Chain forwarding failed");

            if let Some(mut receipt) = self.receipts.get(chain_id) {
                receipt.completed = true;
                self.receipts.insert(chain_id, &receipt);
            }

            (chain_id, true)
        }

        #[ink(message)]
        pub fn get_receipt(&self, chain_id: u32) -> (u32, AccountId, Vec<u8>, bool) {
            if let Some(r) = self.receipts.get(chain_id) {
                (r.chain_id, r.initiator, r.data, r.completed)
            } else {
                (0, AccountId::from([0u8; 32]), Vec::new(), false)
            }
        }

        #[ink(message)]
        pub fn get_all_chain_ids(&self) -> Vec<u32> {
            self.chain_id_list.clone()
        }

        #[ink(message)]
        pub fn chain_counter(&self) -> u32 {
            self.chain_counter
        }

        fn ensure_owner(&self) {
            assert_eq!(self.env().caller(), self.owner, "Only owner can call this");
        }
    }
}