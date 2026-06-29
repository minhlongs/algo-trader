;; Wasm Text Format kernel — spread-mean-reversion pure math
;; Host responsibility: fetch prices, execute orders, audit logging.
;; Sandbox responsibility: pure compute only — no WASI, no network.
;;
;; Memory layout (shared with host via linear memory export):
;;   [0..4]   : f64 yesPrice   (8 bytes, but we use 4-byte offset blocks)
;;   [0..8]   : f64 yesPrice
;;   [8..16]  : f64 noPrice
;;   [16..24] : f64 prevEma     (NaN = first call, encoded as 0.0)
;;   [24..32] : f64 alpha
;;   [32..40] : f64 threshold
;;   [40..48] : f64 result_spread
;;   [48..56] : f64 result_deviation
;;   [56..64] : f64 result_ema
;;   [64..68] : i32 result_signal  (0=no, 1=yes)
;;   [68..72] : i32 result_side    (0=yes, 1=no)
(module
  ;; Export 1 page (64KB) — well within 64MB host cap
  (memory (export "memory") 1)

  ;; calc_spread: yesPrice + noPrice
  (func $calc_spread (param $yes f64) (param $no f64) (result f64)
    local.get $yes
    local.get $no
    f64.add
  )

  ;; calc_deviation: spread - 1.0
  (func $calc_deviation (param $spread f64) (result f64)
    local.get $spread
    f64.const 1.0
    f64.sub
  )

  ;; update_ema: alpha*value + (1-alpha)*prev
  ;; When prev == 0.0 AND this is the first call (indicated by caller passing 0.0),
  ;; the host must initialise prevEma to the first value on the first tick.
  (func $update_ema (param $prev f64) (param $value f64) (param $alpha f64) (result f64)
    ;; alpha * value
    local.get $alpha
    local.get $value
    f64.mul
    ;; (1 - alpha) * prev
    f64.const 1.0
    local.get $alpha
    f64.sub
    local.get $prev
    f64.mul
    ;; sum
    f64.add
  )

  ;; is_signal: abs(deviation) > threshold  →  1 else 0
  (func $is_signal (param $dev f64) (param $thresh f64) (result i32)
    local.get $dev
    f64.abs
    local.get $thresh
    f64.gt
  )

  ;; cheap_side: yesPrice <= noPrice → 0 (yes), else 1 (no)
  (func $cheap_side (param $yes f64) (param $no f64) (result i32)
    local.get $yes
    local.get $no
    f64.le
    ;; f64.le returns 1 (yes-side) when yes<=no, 0 otherwise
    ;; we want 0=yes, 1=no so invert: if yes<=no result=0, else result=1
    ;; f64.le gives i32: 1 when yes<=no.  We want 0=yes side.
    ;; So result = 1 - (yes <= no)
    i32.const 1
    i32.xor
  )

  ;; compute: reads inputs from memory, writes results to memory
  ;; Offsets (all f64 = 8 bytes each, i32 = 4 bytes):
  ;;   0  : f64 yesPrice
  ;;   8  : f64 noPrice
  ;;   16 : f64 prevEma     (0.0 on first call → treated as "use value")
  ;;   24 : f64 alpha
  ;;   32 : f64 threshold
  ;;   40 : f64 [out] spread
  ;;   48 : f64 [out] deviation
  ;;   56 : f64 [out] newEma
  ;;   64 : i32 [out] signal (1=yes, 0=no)
  ;;   68 : i32 [out] side   (0=yes, 1=no)
  (func $compute (export "compute")
    (local $yes f64)
    (local $no f64)
    (local $prev f64)
    (local $alpha f64)
    (local $thresh f64)
    (local $spread f64)
    (local $dev f64)
    (local $ema f64)

    ;; Load inputs from linear memory
    f64.load offset=0  ;; yesPrice at byte 0
    local.set $yes
    f64.load offset=8  ;; noPrice at byte 8
    local.set $no
    f64.load offset=16 ;; prevEma at byte 16
    local.set $prev
    f64.load offset=24 ;; alpha at byte 24
    local.set $alpha
    f64.load offset=32 ;; threshold at byte 32
    local.set $thresh

    ;; Compute spread
    local.get $yes
    local.get $no
    call $calc_spread
    local.set $spread

    ;; Compute deviation
    local.get $spread
    call $calc_deviation
    local.set $dev

    ;; Compute EMA (when prev==0.0 first-call, host passes yesPrice+noPrice as seed)
    local.get $prev
    local.get $spread
    local.get $alpha
    call $update_ema
    local.set $ema

    ;; Compute signal
    local.get $dev
    local.get $thresh
    call $is_signal
    ;; -> i32 on stack

    ;; Compute side
    local.get $yes
    local.get $no
    call $cheap_side
    ;; -> i32 on stack

    ;; Write outputs to memory
    ;; Write signal (i32) at 64 — pop order: need side first then signal
    ;; Stack: [signal, side]  — we must reverse
    ;; Use locals to hold them
    (local $sig i32)
    (local $sid i32)
    local.set $sid  ;; side
    local.set $sig  ;; signal

    ;; Write f64 outputs
    i32.const 40
    local.get $spread
    f64.store

    i32.const 48
    local.get $dev
    f64.store

    i32.const 56
    local.get $ema
    f64.store

    ;; Write i32 outputs
    i32.const 64
    local.get $sig
    i32.store

    i32.const 68
    local.get $sid
    i32.store
  )
)
