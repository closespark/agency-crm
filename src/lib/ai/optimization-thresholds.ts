// Minimum sample thresholds for self-optimization functions.
// Below threshold: log the signal, accumulate the data, don't act.
// Above threshold: act and log why.
//
// Adjust these as the pipeline grows. With 100+ closed deals,
// some of these can be tightened for faster optimization cycles.

export const OPTIMIZATION_THRESHOLDS = {
  // ICP reweight: minimum closed deals before rewriting the ICP
  ICP_REWEIGHT_MIN_DEALS: 10,

  // Score reweight: minimum closed deals before recalibrating scoring weights
  SCORE_REWEIGHT_MIN_DEALS: 15,

  // StageGate threshold drift: minimum advancement decisions per gate before adjusting
  STAGE_GATE_DRIFT_MIN_DECISIONS: 20,

  // Churn fingerprint: minimum churned clients before building anti-ICP
  CHURN_FINGERPRINT_MIN_CHURNS: 5,

  // Expansion fingerprint: minimum expansion events before building expansion ICP
  EXPANSION_FINGERPRINT_MIN_EXPANSIONS: 5,

  // Sequence rewrite: minimum sends per step + minimum days of data
  SEQUENCE_REWRITE_MIN_SENDS: 50,
  SEQUENCE_REWRITE_MIN_DAYS: 7,

  // Send time optimization: minimum replies before optimizing
  SEND_TIME_MIN_REPLIES: 20,

  // BANT extractor calibration: minimum closed deals before learning patterns
  BANT_CALIBRATION_MIN_DEALS: 10,
} as const;
