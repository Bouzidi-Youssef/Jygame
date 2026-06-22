(module
  ;; Shared linear memory — imported from JS
  (import "env" "memory" (memory 1))

  ;; ──────────────────────────────────────────────────────────────
  ;; deathSweepKernel: SIMD decrement + death detection only
  ;;
  ;; Input:  life ptr, active list ptr, active count, dt
  ;; Output: death flags written to death ptr (1=dead, 0=alive)
  ;; Returns: number of deaths
  ;;
  ;; This is the original kernel — JS must do a second pass for compaction.
  ;; ──────────────────────────────────────────────────────────────
  (func (export "deathSweepKernel")
    (param $life_ptr   i32)
    (param $active_ptr i32)
    (param $death_ptr  i32)
    (param $count      i32)
    (param $dt         f32)
    (result i32)

    (local $i        i32)
    (local $deaths   i32)
    (local $dt4      v128)
    (local $zero4    v128)
    (local $slots    v128)
    (local $lives    v128)
    (local $alive    v128)
    (local $s0       i32)
    (local $s1       i32)
    (local $s2       i32)
    (local $s3       i32)
    (local $lane_val i32)
    (local $fv       f32)

    (local.set $dt4   (f32x4.splat (local.get $dt)))
    (local.set $zero4 (f32x4.splat (f32.const 0)))
    (local.set $i     (i32.const 0))
    (local.set $deaths (i32.const 0))

    (block $end
      (loop $start
        (br_if $end
          (i32.lt_u (i32.sub (local.get $count) (local.get $i)) (i32.const 4)))

        (local.set $slots
          (v128.load (i32.add (local.get $active_ptr)
                              (i32.shl (local.get $i) (i32.const 2)))))

        (local.set $s0 (i32x4.extract_lane 0 (local.get $slots)))
        (local.set $fv (f32.load (i32.add (local.get $life_ptr) (i32.shl (local.get $s0) (i32.const 2)))))
        (local.set $lives (f32x4.replace_lane 0 (local.get $lives) (local.get $fv)))

        (local.set $s1 (i32x4.extract_lane 1 (local.get $slots)))
        (local.set $fv (f32.load (i32.add (local.get $life_ptr) (i32.shl (local.get $s1) (i32.const 2)))))
        (local.set $lives (f32x4.replace_lane 1 (local.get $lives) (local.get $fv)))

        (local.set $s2 (i32x4.extract_lane 2 (local.get $slots)))
        (local.set $fv (f32.load (i32.add (local.get $life_ptr) (i32.shl (local.get $s2) (i32.const 2)))))
        (local.set $lives (f32x4.replace_lane 2 (local.get $lives) (local.get $fv)))

        (local.set $s3 (i32x4.extract_lane 3 (local.get $slots)))
        (local.set $fv (f32.load (i32.add (local.get $life_ptr) (i32.shl (local.get $s3) (i32.const 2)))))
        (local.set $lives (f32x4.replace_lane 3 (local.get $lives) (local.get $fv)))

        (local.set $lives (f32x4.sub (local.get $lives) (local.get $dt4)))

        (f32.store (i32.add (local.get $life_ptr) (i32.shl (local.get $s0) (i32.const 2)))
                   (f32x4.extract_lane 0 (local.get $lives)))
        (f32.store (i32.add (local.get $life_ptr) (i32.shl (local.get $s1) (i32.const 2)))
                   (f32x4.extract_lane 1 (local.get $lives)))
        (f32.store (i32.add (local.get $life_ptr) (i32.shl (local.get $s2) (i32.const 2)))
                   (f32x4.extract_lane 2 (local.get $lives)))
        (f32.store (i32.add (local.get $life_ptr) (i32.shl (local.get $s3) (i32.const 2)))
                   (f32x4.extract_lane 3 (local.get $lives)))

        (local.set $alive (f32x4.gt (local.get $lives) (local.get $zero4)))

        ;; Lane 0
        (local.set $lane_val (i32x4.extract_lane 0 (local.get $alive)))
        (if (i32.eqz (local.get $lane_val))
          (then
            (i32.store8 (i32.add (local.get $death_ptr) (local.get $i)) (i32.const 1))
            (local.set $deaths (i32.add (local.get $deaths) (i32.const 1))))
          (else
            (i32.store8 (i32.add (local.get $death_ptr) (local.get $i)) (i32.const 0))))

        ;; Lane 1
        (local.set $lane_val (i32x4.extract_lane 1 (local.get $alive)))
        (if (i32.eqz (local.get $lane_val))
          (then
            (i32.store8 (i32.add (local.get $death_ptr) (i32.add (local.get $i) (i32.const 1))) (i32.const 1))
            (local.set $deaths (i32.add (local.get $deaths) (i32.const 1))))
          (else
            (i32.store8 (i32.add (local.get $death_ptr) (i32.add (local.get $i) (i32.const 1))) (i32.const 0))))

        ;; Lane 2
        (local.set $lane_val (i32x4.extract_lane 2 (local.get $alive)))
        (if (i32.eqz (local.get $lane_val))
          (then
            (i32.store8 (i32.add (local.get $death_ptr) (i32.add (local.get $i) (i32.const 2))) (i32.const 1))
            (local.set $deaths (i32.add (local.get $deaths) (i32.const 1))))
          (else
            (i32.store8 (i32.add (local.get $death_ptr) (i32.add (local.get $i) (i32.const 2))) (i32.const 0))))

        ;; Lane 3
        (local.set $lane_val (i32x4.extract_lane 3 (local.get $alive)))
        (if (i32.eqz (local.get $lane_val))
          (then
            (i32.store8 (i32.add (local.get $death_ptr) (i32.add (local.get $i) (i32.const 3))) (i32.const 1))
            (local.set $deaths (i32.add (local.get $deaths) (i32.const 1))))
          (else
            (i32.store8 (i32.add (local.get $death_ptr) (i32.add (local.get $i) (i32.const 3))) (i32.const 0))))

        (local.set $i (i32.add (local.get $i) (i32.const 4)))
        (br $start)
      )
    )

    ;; Scalar remainder
    (block $rem_end
      (loop $rem_start
        (br_if $rem_end (i32.ge_u (local.get $i) (local.get $count)))

        (local.set $s0 (i32.load (i32.add (local.get $active_ptr) (i32.shl (local.get $i) (i32.const 2)))))
        (local.set $fv (f32.load (i32.add (local.get $life_ptr) (i32.shl (local.get $s0) (i32.const 2)))))
        (local.set $fv (f32.sub (local.get $fv) (local.get $dt)))
        (f32.store (i32.add (local.get $life_ptr) (i32.shl (local.get $s0) (i32.const 2))) (local.get $fv))

        (if (f32.le (local.get $fv) (f32.const 0))
          (then
            (i32.store8 (i32.add (local.get $death_ptr) (local.get $i)) (i32.const 1))
            (local.set $deaths (i32.add (local.get $deaths) (i32.const 1))))
          (else
            (i32.store8 (i32.add (local.get $death_ptr) (local.get $i)) (i32.const 0))))

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $rem_start)
      )
    )

    (local.get $deaths)
  )

  ;; ──────────────────────────────────────────────────────────────
  ;; deathSweepFull: SIMD decrement + test + compaction in one pass
  ;;
  ;; Does everything:
  ;;   1. Decrement life[slot] -= dt for each active slot
  ;;   2. Detect deaths (life <= 0)
  ;;   3. Compact activeList in-place (survivors at front)
  ;;   4. Write died slot indices to deathOutput buffer
  ;;
  ;; Returns: new active count (survivor count)
  ;;
  ;; JS after call:
  ;;   newCount = result;
  ;;   diedCount = oldCount - newCount;
  ;;   deathOutput[0..diedCount) holds died slot indices
  ;;   → call _onDeath(deathOutput[i]) for each, outside hot path
  ;; ──────────────────────────────────────────────────────────────
  (func (export "deathSweepFull")
    (param $lifePtr      i32)   ;; byte offset to Float32Array life[capacity]
    (param $activePtr    i32)   ;; byte offset to Int32Array activeList[]
    (param $activeCount  i32)   ;; number of valid entries in activeList
    (param $dt           f32)   ;; delta time
    (param $deathOutPtr  i32)   ;; byte offset to Int32Array deathOutput[]
    (result i32)                 ;; new active count (survivors)

    (local $i           i32)    ;; read cursor over activeList
    (local $writeIdx    i32)    ;; write cursor for compaction
    (local $diedCount   i32)    ;; count of died particles
    (local $dt4         v128)   ;; dt splatted across 4 lanes
    (local $zero4       v128)   ;; zero vector for comparison
    (local $slots       v128)   ;; 4 slot indices from activeList
    (local $lives       v128)   ;; 4 life values gathered
    (local $aliveMask   v128)   ;; comparison result (f32x4.gt)
    (local $s0          i32)    ;; slot index lane 0
    (local $s1          i32)    ;; slot index lane 1
    (local $s2          i32)    ;; slot index lane 2
    (local $s3          i32)    ;; slot index lane 3
    (local $laneVal     i32)    ;; extracted comparison lane
    (local $fv          f32)    ;; float temp

    ;; Early exit for empty active list
    (if (i32.eqz (local.get $activeCount))
      (then (return (i32.const 0))))

    (local.set $dt4   (f32x4.splat (local.get $dt)))
    (local.set $zero4 (f32x4.splat (f32.const 0)))
    (local.set $i        (i32.const 0))
    (local.set $writeIdx (i32.const 0))
    (local.set $diedCount (i32.const 0))

    ;; ── SIMD loop — 4 particles per iteration ──
    (block $end
      (loop $start
        (br_if $end
          (i32.lt_u (i32.sub (local.get $activeCount) (local.get $i)) (i32.const 4)))

        ;; Load 4 slot indices (4 x i32) from activeList at position i
        (local.set $slots
          (v128.load (i32.add (local.get $activePtr)
                              (i32.shl (local.get $i) (i32.const 2)))))

        ;; ── Gather 4 life values from scattered slot indices ──
        (local.set $s0 (i32x4.extract_lane 0 (local.get $slots)))
        (local.set $fv (f32.load (i32.add (local.get $lifePtr)
                                          (i32.shl (local.get $s0) (i32.const 2)))))
        (local.set $lives (f32x4.replace_lane 0 (local.get $lives) (local.get $fv)))

        (local.set $s1 (i32x4.extract_lane 1 (local.get $slots)))
        (local.set $fv (f32.load (i32.add (local.get $lifePtr)
                                          (i32.shl (local.get $s1) (i32.const 2)))))
        (local.set $lives (f32x4.replace_lane 1 (local.get $lives) (local.get $fv)))

        (local.set $s2 (i32x4.extract_lane 2 (local.get $slots)))
        (local.set $fv (f32.load (i32.add (local.get $lifePtr)
                                          (i32.shl (local.get $s2) (i32.const 2)))))
        (local.set $lives (f32x4.replace_lane 2 (local.get $lives) (local.get $fv)))

        (local.set $s3 (i32x4.extract_lane 3 (local.get $slots)))
        (local.set $fv (f32.load (i32.add (local.get $lifePtr)
                                          (i32.shl (local.get $s3) (i32.const 2)))))
        (local.set $lives (f32x4.replace_lane 3 (local.get $lives) (local.get $fv)))

        ;; ── SIMD: subtract dt from all 4 lives ──
        (local.set $lives (f32x4.sub (local.get $lives) (local.get $dt4)))

        ;; ── Scatter updated life values back ──
        (f32.store (i32.add (local.get $lifePtr) (i32.shl (local.get $s0) (i32.const 2)))
                   (f32x4.extract_lane 0 (local.get $lives)))
        (f32.store (i32.add (local.get $lifePtr) (i32.shl (local.get $s1) (i32.const 2)))
                   (f32x4.extract_lane 1 (local.get $lives)))
        (f32.store (i32.add (local.get $lifePtr) (i32.shl (local.get $s2) (i32.const 2)))
                   (f32x4.extract_lane 2 (local.get $lives)))
        (f32.store (i32.add (local.get $lifePtr) (i32.shl (local.get $s3) (i32.const 2)))
                   (f32x4.extract_lane 3 (local.get $lives)))

        ;; ── SIMD: compare lives > 0 → alive mask ──
        ;; Each lane: 0xFFFFFFFF if alive, 0x00000000 if dead
        (local.set $aliveMask (f32x4.gt (local.get $lives) (local.get $zero4)))

        ;; ── Per-lane compaction and death output ──
        ;; Lane 0
        (local.set $laneVal (i32x4.extract_lane 0 (local.get $aliveMask)))
        (if (i32.eqz (local.get $laneVal))
          (then
            ;; Dead: write slot index to deathOutput
            (i32.store (i32.add (local.get $deathOutPtr)
                                (i32.shl (local.get $diedCount) (i32.const 2)))
                       (local.get $s0))
            (local.set $diedCount (i32.add (local.get $diedCount) (i32.const 1))))
          (else
            ;; Alive: compact to front of activeList
            (i32.store (i32.add (local.get $activePtr)
                                (i32.shl (local.get $writeIdx) (i32.const 2)))
                       (local.get $s0))
            (local.set $writeIdx (i32.add (local.get $writeIdx) (i32.const 1)))))

        ;; Lane 1
        (local.set $laneVal (i32x4.extract_lane 1 (local.get $aliveMask)))
        (if (i32.eqz (local.get $laneVal))
          (then
            (i32.store (i32.add (local.get $deathOutPtr)
                                (i32.shl (local.get $diedCount) (i32.const 2)))
                       (local.get $s1))
            (local.set $diedCount (i32.add (local.get $diedCount) (i32.const 1))))
          (else
            (i32.store (i32.add (local.get $activePtr)
                                (i32.shl (local.get $writeIdx) (i32.const 2)))
                       (local.get $s1))
            (local.set $writeIdx (i32.add (local.get $writeIdx) (i32.const 1)))))

        ;; Lane 2
        (local.set $laneVal (i32x4.extract_lane 2 (local.get $aliveMask)))
        (if (i32.eqz (local.get $laneVal))
          (then
            (i32.store (i32.add (local.get $deathOutPtr)
                                (i32.shl (local.get $diedCount) (i32.const 2)))
                       (local.get $s2))
            (local.set $diedCount (i32.add (local.get $diedCount) (i32.const 1))))
          (else
            (i32.store (i32.add (local.get $activePtr)
                                (i32.shl (local.get $writeIdx) (i32.const 2)))
                       (local.get $s2))
            (local.set $writeIdx (i32.add (local.get $writeIdx) (i32.const 1)))))

        ;; Lane 3
        (local.set $laneVal (i32x4.extract_lane 3 (local.get $aliveMask)))
        (if (i32.eqz (local.get $laneVal))
          (then
            (i32.store (i32.add (local.get $deathOutPtr)
                                (i32.shl (local.get $diedCount) (i32.const 2)))
                       (local.get $s3))
            (local.set $diedCount (i32.add (local.get $diedCount) (i32.const 1))))
          (else
            (i32.store (i32.add (local.get $activePtr)
                                (i32.shl (local.get $writeIdx) (i32.const 2)))
                       (local.get $s3))
            (local.set $writeIdx (i32.add (local.get $writeIdx) (i32.const 1)))))

        (local.set $i (i32.add (local.get $i) (i32.const 4)))
        (br $start)
      )
    )

    ;; ── Scalar remainder (0-3 particles) ──
    (block $rem_end
      (loop $rem_start
        (br_if $rem_end (i32.ge_u (local.get $i) (local.get $activeCount)))

        ;; Load slot index
        (local.set $s0 (i32.load (i32.add (local.get $activePtr)
                                          (i32.shl (local.get $i) (i32.const 2)))))

        ;; Load life, decrement, store
        (local.set $fv (f32.load (i32.add (local.get $lifePtr)
                                          (i32.shl (local.get $s0) (i32.const 2)))))
        (local.set $fv (f32.sub (local.get $fv) (local.get $dt)))
        (f32.store (i32.add (local.get $lifePtr) (i32.shl (local.get $s0) (i32.const 2)))
                   (local.get $fv))

        ;; Check death
        (if (f32.le (local.get $fv) (f32.const 0))
          (then
            ;; Dead: write to deathOutput
            (i32.store (i32.add (local.get $deathOutPtr)
                                (i32.shl (local.get $diedCount) (i32.const 2)))
                       (local.get $s0))
            (local.set $diedCount (i32.add (local.get $diedCount) (i32.const 1))))
          (else
            ;; Alive: compact to front
            (i32.store (i32.add (local.get $activePtr)
                                (i32.shl (local.get $writeIdx) (i32.const 2)))
                       (local.get $s0))
            (local.set $writeIdx (i32.add (local.get $writeIdx) (i32.const 1)))))

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $rem_start)
      )
    )

    ;; Return new active count (number of survivors)
    (local.get $writeIdx)
  )
)
