import { ThresholdsConfig, TriageTier } from '../types';
import { calculatePhq9Total, calculateGad7Total } from './scoring';

export const DEFAULT_THRESHOLDS: ThresholdsConfig = {
  label: "pending sign-off by a clinical advisor",
  phq9Item9UrgentThreshold: 0, // > 0
  phq9UrgentTotal: 20, // >= 20
  gad7UrgentTotal: 15, // >= 15
  phq9PriorityTotal: 9, // >= 9
  gad7PriorityTotal: 10, // >= 10
  phq9WatchMin: 5,
  phq9WatchMax: 8,
  gad7WatchMin: 5,
  gad7WatchMax: 9
};

export function evaluateTriageTier(
  phq9Answers: number[],
  gad7Answers: number[],
  thresholds: ThresholdsConfig = DEFAULT_THRESHOLDS
): TriageTier {
  const item9Score = phq9Answers[8] ?? 0;
  const phq9Total = calculatePhq9Total(phq9Answers);
  const gad7Total = calculateGad7Total(gad7Answers);

  // URGENT: PHQ-9 item 9 > 0, or PHQ-9 >= 20, or GAD-7 >= 15
  if (
    item9Score > thresholds.phq9Item9UrgentThreshold ||
    phq9Total >= thresholds.phq9UrgentTotal ||
    gad7Total >= thresholds.gad7UrgentTotal
  ) {
    return 'URGENT';
  }

  // PRIORITY: PHQ-9 >= 9 or GAD-7 >= 10
  if (
    phq9Total >= thresholds.phq9PriorityTotal ||
    gad7Total >= thresholds.gad7PriorityTotal
  ) {
    return 'PRIORITY';
  }

  // WATCH: PHQ-9 5-8 or GAD-7 5-9
  if (
    (phq9Total >= thresholds.phq9WatchMin && phq9Total <= thresholds.phq9WatchMax) ||
    (gad7Total >= thresholds.gad7WatchMin && gad7Total <= thresholds.gad7WatchMax)
  ) {
    return 'WATCH';
  }

  return 'NONE';
}
