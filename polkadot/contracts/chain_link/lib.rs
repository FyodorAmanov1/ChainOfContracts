#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod chain_link {
    use ink::env::call::{
        build_call,
        ExecutionInput,
        Selector,
    };
    use ink::prelude::vec::Vec;

    #[derive(scale::Decode, scale::Encode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub struct ExecutionRecord {
        pub executed: bool,
        pub result: Vec<u8>,
    }

    #[ink(storage)]
    pub struct ChainLink {
        next_link: Option<AccountId>,
        prev_link: Option<AccountId>,
        owner: AccountId,
        step_number: u32,
        execution_count: u32,
        executions: ink::storage::Mapping<u32, ExecutionRecord>,
    }

    #[ink(event)]
    pub struct LinkExecuted {
        #[ink(topic)]
        chain_id: u32,
        #[ink(topic)]
        step_number: u32,
        #[ink(topic)]
        next_link: Option<AccountId>,
        transformed_data: Vec<u8>,
    }

    #[ink(event)]
    pub struct LinkValidationFailed {
        #[ink(topic)]
        chain_id: u32,
        reason: Vec<u8>,
    }

    impl ChainLink {
        #[ink(constructor)]
        pub fn new(step_number: u32) -> Self {
            Self {
                next_link: None,
                prev_link: None,
                owner: Self::env().caller(),
                step_number,
                execution_count: 0,
                executions: ink::storage::Mapping::new(),
            }
        }

        #[ink(message)]
        pub fn set_next_link(&mut self, next_link: AccountId) {
            self.ensure_owner();
            self.next_link = Some(next_link);
        }

        #[ink(message)]
        pub fn set_prev_link(&mut self, prev_link: AccountId) {
            self.ensure_owner();
            self.prev_link = Some(prev_link);
        }

        #[ink(message)]
        pub fn set_step_number(&mut self, step: u32) {
            self.ensure_owner();
            self.step_number = step;
        }

        /// Entry point called by the previous link (Entry or another ChainLink)
        #[ink(message)]
        pub fn process_and_forward(&mut self, chain_id: u32, data: Vec<u8>) -> bool {
            self.ensure_prev_link();
            self.execute_and_forward(chain_id, data)
        }

        /// Alternate entry point so the previous link can call via receive_final
        #[ink(message)]
        pub fn receive_final(&mut self, chain_id: u32, data: Vec<u8>) -> bool {
            self.ensure_prev_link();
            self.execute_and_forward(chain_id, data)
        }

        fn execute_and_forward(&mut self, chain_id: u32, data: Vec<u8>) -> bool {
            // Validate: data must be non-empty and within reasonable length
            if data.is_empty() {
                self.env().emit_event(LinkValidationFailed {
                    chain_id,
                    reason: "Data is empty".into(),
                });
                return false;
            }
            if data.len() > 1024 {
                self.env().emit_event(LinkValidationFailed {
                    chain_id,
                    reason: "Data exceeds maximum length".into(),
                });
                return false;
            }

            // Transform data by prepending a validation marker
            let mut transformed_data = b"[VALIDATED]".to_vec();
            transformed_data.extend_from_slice(&data);

            self.executions.insert(chain_id, &ExecutionRecord {
                executed: true,
                result: transformed_data.clone(),
            });
            self.execution_count += 1;

            self.env().emit_event(LinkExecuted {
                chain_id,
                step_number: self.step_number,
                next_link: self.next_link,
                transformed_data: transformed_data.clone(),
            });

            // Forward to next contract via receive_final (uniform interface)
            if let Some(next) = self.next_link {
                let result: bool = build_call::<ink::env::DefaultEnvironment>()
                    .call(next)
                    .gas_limit(5000000000)
                    .transferred_value(0)
                    .exec_input(
                        ExecutionInput::new(Selector::new(ink::selector_bytes!("receive_final")))
                            .push_arg(chain_id)
                            .push_arg(transformed_data),
                    )
                    .returns::<bool>()
                    .invoke();

                assert!(result, "Forward to next contract failed");
            }

            true
        }

        #[ink(message)]
        pub fn get_step_number(&self) -> u32 {
            self.step_number
        }

        #[ink(message)]
        pub fn get_next_link(&self) -> Option<AccountId> {
            self.next_link
        }

        #[ink(message)]
        pub fn get_execution_count(&self) -> u32 {
            self.execution_count
        }

        #[ink(message)]
        pub fn get_execution(&self, chain_id: u32) -> (bool, Vec<u8>) {
            if let Some(e) = self.executions.get(chain_id) {
                (e.executed, e.result)
            } else {
                (false, Vec::new())
            }
        }

        fn ensure_owner(&self) {
            assert_eq!(self.env().caller(), self.owner, "Only owner can call this");
        }

        fn ensure_prev_link(&self) {
            let caller = self.env().caller();
            let expected = self.prev_link.expect("PrevLink not set");
            assert_eq!(caller, expected, "Only prevLink can call this");
        }
    }
}