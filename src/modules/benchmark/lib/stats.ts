/** Summary statistics over latency samples. */
export interface SampleStats {
  mean: number;
  std: number;
  /** Coefficient of variation (std / mean) — unitless run-to-run noise. */
  cv: number;
  min: number;
  max: number;
}

export function sampleStats(samples: number[]): SampleStats {
  if (samples.length === 0) return { mean: 0, std: 0, cv: 0, min: 0, max: 0 };
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
  const std = Math.sqrt(variance);
  return {
    mean,
    std,
    cv: mean > 0 ? std / mean : 0,
    min: Math.min(...samples),
    max: Math.max(...samples),
  };
}

/** A run is "noisy" when run-to-run variation exceeds ~8%. */
export const NOISY_CV = 0.08;
