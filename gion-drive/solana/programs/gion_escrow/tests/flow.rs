//! The whole escrow loop on a local SVM (no network): join → lock → report → reveal → settle, plus refunds and
//! the checks that keep a player or the server from cheating. Needs `anchor build` first (it loads the .so).

use {
    anchor_lang::{prelude::Pubkey, solana_program::{instruction::{AccountMeta, Instruction}, system_program}, AccountDeserialize, InstructionData, ToAccountMetas},
    gion_escrow::{accounts as acc, instruction as ix, Game, CREW_WINS, IMPOSTER_WINS},
    litesvm::LiteSVM,
    solana_clock::Clock,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_sha256_hasher::hashv,
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const STAKE: u64 = 100_000_000;
const SOL: u64 = 1_000_000_000;

struct T { svm: LiteSVM, server: Keypair, players: Vec<Keypair>, game: Pubkey }

impl T {
    fn new(n: usize, game_id: u64) -> T {
        let mut svm = LiteSVM::new();
        svm.add_program(gion_escrow::id(), include_bytes!("../../../target/deploy/gion_escrow.so")).unwrap();
        let server = Keypair::new();
        svm.airdrop(&server.pubkey(), 10 * SOL).unwrap();
        let players: Vec<Keypair> = (0..n).map(|_| Keypair::new()).collect();
        for p in &players { svm.airdrop(&p.pubkey(), SOL).unwrap(); }
        let game = Pubkey::find_program_address(&[b"game", server.pubkey().as_ref(), &game_id.to_le_bytes()], &gion_escrow::id()).0;
        let mut t = T { svm, server, players, game };
        let i = Instruction::new_with_bytes(gion_escrow::id(),
            &ix::CreateGame { game_id, stake: STAKE, join_secs: 60, play_secs: 600, reveal_secs: 120 }.data(),
            acc::CreateGame { authority: t.server.pubkey(), game: t.game, system_program: system_program::ID }.to_account_metas(None));
        t.send(i, &[]).unwrap();
        t
    }
    fn send(&mut self, i: Instruction, extra: &[&Keypair]) -> Result<(), String> {
        // the server pays every fee; players sign only for their own deposit or reveal
        let mut signers: Vec<&Keypair> = vec![&self.server];
        for k in extra { if k.pubkey() != self.server.pubkey() { signers.push(k) } }
        self.svm.expire_blockhash();
        let bh = self.svm.latest_blockhash();
        let msg = Message::new_with_blockhash(&[i], Some(&self.server.pubkey()), &bh);
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).unwrap();
        self.svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.meta.logs))
    }
    fn commit(&self, i: usize, wager: u64, salt: [u8; 32]) -> [u8; 32] {
        hashv(&[b"gion-wager", self.game.as_ref(), self.players[i].pubkey().as_ref(), &wager.to_le_bytes(), &salt]).to_bytes()
    }
    fn join(&mut self, i: usize, c: [u8; 32]) -> Result<(), String> {
        let p = self.players[i].insecure_clone();
        let ins = Instruction::new_with_bytes(gion_escrow::id(), &ix::Join { commitment: c }.data(),
            acc::Join { player: p.pubkey(), game: self.game, system_program: system_program::ID }.to_account_metas(None));
        self.send(ins, &[&p])
    }
    fn lock(&mut self, imposter: u8, salt: [u8; 32]) -> Result<(), String> {
        let rc = hashv(&[b"gion-role", self.game.as_ref(), &[imposter], &salt]).to_bytes();
        let ins = Instruction::new_with_bytes(gion_escrow::id(), &ix::Lock { role_commitment: rc }.data(),
            acc::AuthorityOnly { authority: self.server.pubkey(), game: self.game }.to_account_metas(None));
        self.send(ins, &[])
    }
    fn report(&mut self, outcome: u8, imposter: u8, salt: [u8; 32]) -> Result<(), String> {
        let ins = Instruction::new_with_bytes(gion_escrow::id(), &ix::Report { outcome, imposter, role_salt: salt }.data(),
            acc::AuthorityOnly { authority: self.server.pubkey(), game: self.game }.to_account_metas(None));
        self.send(ins, &[])
    }
    fn reveal(&mut self, i: usize, wager: u64, salt: [u8; 32]) -> Result<(), String> {
        let p = self.players[i].insecure_clone();
        let ins = Instruction::new_with_bytes(gion_escrow::id(), &ix::Reveal { wager, salt }.data(),
            acc::Reveal { player: p.pubkey(), game: self.game }.to_account_metas(None));
        self.send(ins, &[&p])
    }
    fn payout_ix(&self, data: Vec<u8>, caller: Pubkey) -> Instruction {
        let mut metas = acc::Settle { caller, game: self.game }.to_account_metas(None);
        for p in &self.players { metas.push(AccountMeta::new(p.pubkey(), false)) }
        Instruction::new_with_bytes(gion_escrow::id(), &data, metas)
    }
    fn settle(&mut self) -> Result<(), String> { let i = self.payout_ix(ix::Settle {}.data(), self.server.pubkey()); self.send(i, &[]) }
    fn refund_by(&mut self, k: &Keypair) -> Result<(), String> { let i = self.payout_ix(ix::Refund {}.data(), k.pubkey()); self.send(i, &[k]) }
    fn bal(&self, i: usize) -> u64 { self.svm.get_balance(&self.players[i].pubkey()).unwrap_or(0) }
    fn state(&self) -> Game { let a = self.svm.get_account(&self.game).unwrap(); Game::try_deserialize(&mut &a.data[..]).unwrap() }
    fn warp(&mut self, secs: i64) { let mut c: Clock = self.svm.get_sysvar(); c.unix_timestamp += secs; self.svm.set_sysvar(&c); }
}

fn salt(b: u8) -> [u8; 32] { [b; 32] }

#[test]
fn crew_wins_full_loop() {
    let mut t = T::new(3, 1);
    let wagers = [60_000_000, 20_000_000, 40_000_000]; // seat 0 will be the imposter
    for i in 0..3 { let c = t.commit(i, wagers[i], salt(i as u8 + 1)); t.join(i, c).unwrap(); }
    let before: Vec<u64> = (0..3).map(|i| t.bal(i)).collect();
    t.lock(0, salt(9)).unwrap();
    t.report(CREW_WINS, 0, salt(9)).unwrap();
    for i in 0..3 { t.reveal(i, wagers[i], salt(i as u8 + 1)).unwrap(); }
    t.settle().unwrap();
    // imposter keeps 40 of 100; crew split the imposter's 60 by 20:40
    assert_eq!(t.bal(0) - before[0], 40_000_000);
    assert_eq!(t.bal(1) - before[1], STAKE + 20_000_000);
    assert_eq!(t.bal(2) - before[2], STAKE + 40_000_000);
    assert_eq!(t.state().status, 3);
    assert!(t.settle().is_err(), "cannot settle twice");
}

#[test]
fn imposter_wins_and_a_missing_reveal_forfeits() {
    let mut t = T::new(4, 2);
    let wagers = [100_000_000, 10_000_000, 50_000_000, 30_000_000]; // seat 2 is the imposter
    for i in 0..4 { let c = t.commit(i, wagers[i], salt(i as u8 + 1)); t.join(i, c).unwrap(); }
    let before: Vec<u64> = (0..4).map(|i| t.bal(i)).collect();
    t.lock(2, salt(7)).unwrap();
    t.report(IMPOSTER_WINS, 2, salt(7)).unwrap();
    for i in [0, 1, 2] { t.reveal(i, wagers[i], salt(i as u8 + 1)).unwrap(); } // seat 3 never reveals
    assert!(t.settle().is_err(), "reveal window still open");
    t.warp(121);
    t.settle().unwrap();
    assert_eq!(t.bal(0) - before[0], 0);
    assert_eq!(t.bal(1) - before[1], 90_000_000);
    assert_eq!(t.bal(2) - before[2], STAKE + 100_000_000 + 10_000_000 + STAKE);
    assert_eq!(t.bal(3) - before[3], 0);
}

#[test]
fn cheating_is_rejected() {
    let mut t = T::new(3, 3);
    let c0 = t.commit(0, 50_000_000, salt(1));
    t.join(0, c0).unwrap();
    assert!(t.join(0, c0).is_err(), "no double join");
    assert!(t.lock(0, salt(9)).is_err(), "needs three players");
    for i in 1..3 { let c = t.commit(i, 50_000_000, salt(i as u8 + 1)); t.join(i, c).unwrap(); }
    assert!(t.reveal(0, 50_000_000, salt(1)).is_err(), "no reveals before the result");
    t.lock(1, salt(9)).unwrap();
    assert!(t.report(CREW_WINS, 0, salt(9)).is_err(), "server cannot change the imposter after the trip");
    assert!(t.report(CREW_WINS, 1, salt(8)).is_err(), "wrong role salt");
    t.report(CREW_WINS, 1, salt(9)).unwrap();
    assert!(t.reveal(0, 60_000_000, salt(1)).is_err(), "player cannot change their wager");
    assert!(t.reveal(0, 50_000_000, salt(2)).is_err(), "wrong salt");
    t.reveal(0, 50_000_000, salt(1)).unwrap();
    assert!(t.reveal(0, 50_000_000, salt(1)).is_err(), "no double reveal");
    let stranger = Keypair::new();
    t.svm.airdrop(&stranger.pubkey(), SOL).unwrap();
    assert!(t.refund_by(&stranger).is_err(), "no refunds once the result is in");
}

#[test]
fn refunds_when_server_aborts_or_disappears() {
    // the server aborts before the trip
    let mut t = T::new(3, 4);
    for i in 0..3 { let c = t.commit(i, 30_000_000, salt(1)); t.join(i, c).unwrap(); }
    let before: Vec<u64> = (0..3).map(|i| t.bal(i)).collect();
    let server = t.server.insecure_clone();
    t.refund_by(&server).unwrap();
    for i in 0..3 { assert_eq!(t.bal(i) - before[i], STAKE) }

    // the server never reports: anyone may refund after the result deadline, not before
    let mut t = T::new(3, 5);
    for i in 0..3 { let c = t.commit(i, 30_000_000, salt(1)); t.join(i, c).unwrap(); }
    t.lock(0, salt(9)).unwrap();
    let p1 = t.players[1].insecure_clone();
    assert!(t.refund_by(&p1).is_err(), "too early");
    t.warp(601);
    assert!(t.report(CREW_WINS, 0, salt(9)).is_err(), "too late to report");
    let before: Vec<u64> = (0..3).map(|i| t.bal(i)).collect();
    t.refund_by(&p1).unwrap();
    for i in 0..3 { assert_eq!(t.bal(i) - before[i], STAKE) }
}
