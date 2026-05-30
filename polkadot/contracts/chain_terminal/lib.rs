#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod chain_terminal {
    use ink::prelude::vec::Vec;

    #[derive(scale::Decode, scale::Encode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub struct FinalRecord {
        pub chain_id: u32,
        pub data: Vec<u8>,
        pub data_hash: [u8; 32],
        pub timestamp: u64,
        pub exists: bool,
    }

    #[ink(storage)]
    pub struct ChainTerminal {
        prev_link: Option<AccountId>,
        owner: AccountId,
        record_count: u32,
        records: ink::storage::Mapping<u32, FinalRecord>,
        chain_ids: Vec<u32>,
    }

    #[ink(event)]
    pub struct FinalReceived {
        #[ink(topic)]
        from: AccountId,
        #[ink(topic)]
        chain_id: u32,
        data: Vec<u8>,
        timestamp: u64,
    }

    #[ink(event)]
    pub struct ChainCompleted {
        #[ink(topic)]
        chain_id: u32,
        data_hash: [u8; 32],
    }

    impl ChainTerminal {
        #[ink(constructor)]
        pub fn new() -> Self {
            Self {
                prev_link: None,
                owner: Self::env().caller(),
                record_count: 0,
                records: ink::storage::Mapping::new(),
                chain_ids: Vec::new(),
            }
        }

        #[ink(message)]
        pub fn set_prev_link(&mut self, prev_link: AccountId) {
            self.ensure_owner();
            self.prev_link = Some(prev_link);
        }

        #[ink(message)]
        pub fn receive_final(&mut self, chain_id: u32, data: Vec<u8>) -> bool {
            self.ensure_prev_link();

            // Prevent duplicate chain IDs
            assert!(
                !self.records.contains(chain_id),
                "Chain ID already exists"
            );

            // Hash the data using blake2b
            let data_hash = self.env().hash_bytes::<ink::H256>(&data).into();

            let timestamp = self.env().block_timestamp();

            self.records.insert(
                chain_id,
                &FinalRecord {
                    chain_id,
                    data: data.clone(),
                    data_hash,
                    timestamp,
                    exists: true,
                },
            );
            self.chain_ids.push(chain_id);
            self.record_count += 1;

            self.env().emit_event(FinalReceived {
                from: self.env().caller(),
                chain_id,
                data: data.clone(),
                timestamp,
            });

            self.env().emit_event(ChainCompleted {
                chain_id,
                data_hash,
            });

            true
        }

        #[ink(message)]
        pub fn get_record(&self, chain_id: u32) -> (u32, Vec<u8>, [u8; 32], u64, bool) {
            if let Some(r) = self.records.get(chain_id) {
                (r.chain_id, r.data, r.data_hash, r.timestamp, r.exists)
            } else {
                (0, Vec::new(), [0u8; 32], 0, false)
            }
        }

        #[ink(message)]
        pub fn get_all_records(
            &self,
        ) -> (Vec<u32>, Vec<Vec<u8>>, Vec<[u8; 32]>, Vec<u64>) {
            let mut ids = Vec::new();
            let mut datas = Vec::new();
            let mut hashes = Vec::new();
            let mut timestamps = Vec::new();

            for chain_id in &self.chain_ids {
                if let Some(r) = self.records.get(chain_id) {
                    ids.push(r.chain_id);
                    datas.push(r.data);
                    hashes.push(r.data_hash);
                    timestamps.push(r.timestamp);
                }
            }

            (ids, datas, hashes, timestamps)
        }

        #[ink(message)]
        pub fn record_count(&self) -> u32 {
            self.record_count
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