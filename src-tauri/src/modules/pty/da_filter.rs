// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

const ESC: u8 = 0x1b;
const LBRACKET: u8 = 0x5b;
const FINAL_C: u8 = 0x63;
const PREFIX_GT: u8 = 0x3e;
const PREFIX_EQ: u8 = 0x3d;

const DA1_REPLY: &[u8] = b"\x1b[?1;2c";
const DA2_REPLY: &[u8] = b"\x1b[>0;276;0c";

const HOLD_MAX: usize = 256;

#[derive(Clone, Copy)]
enum State {
    Idle,
    AfterEsc,
    InsideCsi,
}

pub struct DaFilter {
    state: State,
    hold: Vec<u8>,
}

impl Default for DaFilter {
    fn default() -> Self {
        Self::new()
    }
}

impl DaFilter {
    pub fn new() -> Self {
        DaFilter {
            state: State::Idle,
            hold: Vec::with_capacity(16),
        }
    }

    pub fn process<F: FnMut(&[u8])>(&mut self, input: &[u8], out: &mut Vec<u8>, mut respond: F) {
        if matches!(self.state, State::Idle) && !input.contains(&ESC) {
            out.extend_from_slice(input);
            return;
        }

        for &b in input {
            match self.state {
                State::Idle => {
                    if b == ESC {
                        self.state = State::AfterEsc;
                        self.hold.clear();
                        self.hold.push(b);
                    } else {
                        out.push(b);
                    }
                }
                State::AfterEsc => {
                    if b == LBRACKET {
                        self.state = State::InsideCsi;
                        self.hold.push(b);
                    } else if b == ESC {
                        out.extend_from_slice(&self.hold);
                        self.hold.clear();
                        self.hold.push(b);
                    } else {
                        out.extend_from_slice(&self.hold);
                        out.push(b);
                        self.hold.clear();
                        self.state = State::Idle;
                    }
                }
                State::InsideCsi => {
                    self.hold.push(b);
                    if (0x40..=0x7e).contains(&b) {
                        if b == FINAL_C {
                            let middle = &self.hold[2..self.hold.len() - 1];
                            let is_response = middle.contains(&b'?') || middle.contains(&b';');
                            let prefix = middle.first().copied().unwrap_or(0);
                            if is_response {
                                out.extend_from_slice(&self.hold);
                            } else {
                                match prefix {
                                    PREFIX_GT => respond(DA2_REPLY),
                                    PREFIX_EQ => {}
                                    0 | b'0'..=b'9' => respond(DA1_REPLY),
                                    _ => out.extend_from_slice(&self.hold),
                                }
                            }
                        } else {
                            out.extend_from_slice(&self.hold);
                        }
                        self.hold.clear();
                        self.state = State::Idle;
                    } else if self.hold.len() >= HOLD_MAX {
                        out.extend_from_slice(&self.hold);
                        self.hold.clear();
                        self.state = State::Idle;
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(filter: &mut DaFilter, input: &[u8]) -> (Vec<u8>, Vec<Vec<u8>>) {
        let mut out = Vec::new();
        let mut replies = Vec::new();
        filter.process(input, &mut out, |r| replies.push(r.to_vec()));
        (out, replies)
    }

    #[test]
    fn da1_bare() {
        let mut f = DaFilter::new();
        let (out, replies) = run(&mut f, b"\x1b[c");
        assert!(out.is_empty());
        assert_eq!(replies, vec![DA1_REPLY.to_vec()]);
    }

    #[test]
    fn da1_with_zero_param() {
        let mut f = DaFilter::new();
        let (out, replies) = run(&mut f, b"\x1b[0c");
        assert!(out.is_empty());
        assert_eq!(replies, vec![DA1_REPLY.to_vec()]);
    }

    #[test]
    fn da2_secondary() {
        let mut f = DaFilter::new();
        let (out, replies) = run(&mut f, b"\x1b[>c");
        assert!(out.is_empty());
        assert_eq!(replies, vec![DA2_REPLY.to_vec()]);
    }

    #[test]
    fn da3_consumed_silently() {
        let mut f = DaFilter::new();
        let (out, replies) = run(&mut f, b"\x1b[=c");
        assert!(out.is_empty());
        assert!(replies.is_empty());
    }

    #[test]
    fn plain_text_passes_through() {
        let mut f = DaFilter::new();
        let (out, replies) = run(&mut f, b"hello world\n");
        assert_eq!(out, b"hello world\n");
        assert!(replies.is_empty());
    }

    #[test]
    fn embedded_da_preserves_surrounding() {
        let mut f = DaFilter::new();
        let (out, replies) = run(&mut f, b"pre\x1b[0cpost");
        assert_eq!(out, b"prepost");
        assert_eq!(replies, vec![DA1_REPLY.to_vec()]);
    }

    #[test]
    fn non_da_csi_passes_through() {
        let mut f = DaFilter::new();
        let (out, replies) = run(&mut f, b"\x1b[?2004h");
        assert_eq!(out, b"\x1b[?2004h");
        assert!(replies.is_empty());
    }

    #[test]
    fn split_across_chunks() {
        let mut f = DaFilter::new();
        let (out1, r1) = run(&mut f, b"\x1b");
        let (out2, r2) = run(&mut f, b"[");
        let (out3, r3) = run(&mut f, b"c");
        assert!(out1.is_empty() && out2.is_empty() && out3.is_empty());
        assert!(r1.is_empty() && r2.is_empty());
        assert_eq!(r3, vec![DA1_REPLY.to_vec()]);
    }

    #[test]
    fn escape_then_non_csi() {
        let mut f = DaFilter::new();
        let (out, replies) = run(&mut f, b"\x1bM");
        assert_eq!(out, b"\x1bM");
        assert!(replies.is_empty());
    }

    #[test]
    fn double_esc() {
        let mut f = DaFilter::new();
        let (out, replies) = run(&mut f, b"\x1b\x1b[c");
        assert_eq!(out, b"\x1b");
        assert_eq!(replies, vec![DA1_REPLY.to_vec()]);
    }

    #[test]
    fn da1_response_passes_through_no_loop() {
        let mut f = DaFilter::new();
        let (out, replies) = run(&mut f, b"\x1b[?1;2c");
        assert_eq!(out, b"\x1b[?1;2c");
        assert!(replies.is_empty());
    }

    #[test]
    fn da2_response_passes_through_no_loop() {
        let mut f = DaFilter::new();
        let (out, replies) = run(&mut f, b"\x1b[>0;276;0c");
        assert_eq!(out, b"\x1b[>0;276;0c");
        assert!(replies.is_empty());
    }

    #[test]
    fn da_with_question_prefix_is_response() {
        let mut f = DaFilter::new();
        let (out, replies) = run(&mut f, b"\x1b[?6c");
        assert_eq!(out, b"\x1b[?6c");
        assert!(replies.is_empty());
    }

    #[test]
    fn runaway_csi_flushes_at_hold_max() {
        let mut f = DaFilter::new();
        let mut input = Vec::from(b"\x1b[".as_slice());
        input.extend(std::iter::repeat_n(b'0', HOLD_MAX));
        let (out, replies) = run(&mut f, &input);
        assert_eq!(out.len(), HOLD_MAX + 2);
        assert!(replies.is_empty());
    }

    // ──────────────────────────────────────────────────────────────────────
    // Property / fuzz-lite tests (dependency-free)
    //
    // The DA filter parses bytes that come from arbitrary programs, so the
    // bugs that bite are the ones nobody writes a hand example for: a DA query
    // split across an awkward chunk boundary, a runaway CSI, an escape byte
    // mid-sequence. These tests assert invariants over a large random corpus
    // instead of specific cases.
    // ──────────────────────────────────────────────────────────────────────

    /// Feed `input` one byte at a time through a fresh filter.
    fn run_split(input: &[u8]) -> (Vec<u8>, Vec<Vec<u8>>) {
        let mut f = DaFilter::new();
        let mut out = Vec::new();
        let mut replies = Vec::new();
        for &b in input {
            f.process(&[b], &mut out, |r| replies.push(r.to_vec()));
        }
        (out, replies)
    }

    /// True if `needle` is an in-order subsequence of `haystack`.
    fn is_subsequence(needle: &[u8], haystack: &[u8]) -> bool {
        let mut hay = haystack.iter();
        needle.iter().all(|n| hay.any(|h| h == n))
    }

    /// Tiny deterministic xorshift64 PRNG — keeps the fuzz corpus reproducible
    /// in CI without pulling in the `rand` crate.
    struct XorShift64(u64);
    impl XorShift64 {
        fn next_u64(&mut self) -> u64 {
            let mut x = self.0;
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            self.0 = x;
            x
        }
        fn pick(&mut self, alphabet: &[u8]) -> u8 {
            alphabet[(self.next_u64() as usize) % alphabet.len()]
        }
    }

    #[test]
    fn fuzz_lite_invariants_hold_over_random_inputs() {
        // Alphabet biased toward bytes the CSI/DA state machine branches on,
        // plus a few ordinary bytes, so most random strings exercise real
        // parser transitions rather than the plain-text fast path.
        const ALPHABET: &[u8] = b"\x1b[]>=?;:cmhlH0123456789AZaz \n\xff";
        let mut rng = XorShift64(0x9E37_79B9_7F4A_7C15);

        for _ in 0..20_000 {
            let len = (rng.next_u64() as usize) % 48;
            let input: Vec<u8> = (0..len).map(|_| rng.pick(ALPHABET)).collect();

            // Whole-chunk run.
            let mut f = DaFilter::new();
            let mut out_whole = Vec::new();
            let mut replies_whole: Vec<Vec<u8>> = Vec::new();
            f.process(&input, &mut out_whole, |r| replies_whole.push(r.to_vec()));

            // Byte-by-byte run of the same bytes.
            let (out_split, replies_split) = run_split(&input);

            // 1. Chunk-boundary invariance: splitting the stream anywhere must
            //    not change what is emitted or replied.
            assert_eq!(
                out_whole, out_split,
                "chunking changed output for {input:?}"
            );
            assert_eq!(
                replies_whole, replies_split,
                "chunking changed replies for {input:?}"
            );

            // 2. The filter never synthesizes bytes into `out`; everything it
            //    emits came from the input, in order, and never grows it.
            assert!(
                is_subsequence(&out_whole, &input),
                "out is not a subsequence of input for {input:?}"
            );
            assert!(
                out_whole.len() <= input.len(),
                "out longer than input for {input:?}"
            );

            // 3. Any reply is exactly one of the two canonical DA answers —
            //    never attacker-influenced bytes echoed back to the shell.
            for r in &replies_whole {
                assert!(
                    r.as_slice() == DA1_REPLY || r.as_slice() == DA2_REPLY,
                    "unexpected reply {r:?} for input {input:?}"
                );
            }
        }
    }

    #[test]
    fn esc_at_end_of_stream_is_held_not_emitted() {
        // A lone trailing ESC is incomplete: it must be buffered, not emitted,
        // so it can combine with the next chunk.
        let mut f = DaFilter::new();
        let (out, replies) = run(&mut f, b"abc\x1b");
        assert_eq!(out, b"abc");
        assert!(replies.is_empty());
    }

    #[test]
    fn csi_with_intermediates_and_non_c_final_passes_through() {
        // SGR (`\x1b[1;31m`) is a CSI that is not a DA query — must pass through.
        let mut f = DaFilter::new();
        let (out, replies) = run(&mut f, b"\x1b[1;31mred\x1b[0m");
        assert_eq!(out, b"\x1b[1;31mred\x1b[0m");
        assert!(replies.is_empty());
    }
}
