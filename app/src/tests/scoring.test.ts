import { describe, test, expect } from 'vitest';
import { calculatePhq9Total, calculateGad7Total, getPhq9SeverityBand, getGad7SeverityBand } from '../lib/scoring';
import { evaluateTriageTier, DEFAULT_THRESHOLDS } from '../lib/triage';

describe('Scoring & Severity Band Functions', () => {
  test('calculatePhq9Total correctly sums 9 items', () => {
    const answers = [0, 1, 2, 3, 0, 1, 2, 3, 1]; // Total = 13
    expect(calculatePhq9Total(answers)).toBe(13);
  });

  test('calculateGad7Total correctly sums 7 items', () => {
    const answers = [3, 3, 3, 3, 3, 3, 3]; // Total = 21
    expect(calculateGad7Total(answers)).toBe(21);
  });

  test('getPhq9SeverityBand maps scores to standard clinical bands', () => {
    expect(getPhq9SeverityBand(2)).toBe('Minimal');
    expect(getPhq9SeverityBand(7)).toBe('Mild');
    expect(getPhq9SeverityBand(12)).toBe('Moderate');
    expect(getPhq9SeverityBand(18)).toBe('Moderately severe');
    expect(getPhq9SeverityBand(24)).toBe('Severe');
  });

  test('getGad7SeverityBand maps scores to standard clinical bands', () => {
    expect(getGad7SeverityBand(3)).toBe('Minimal');
    expect(getGad7SeverityBand(8)).toBe('Mild');
    expect(getGad7SeverityBand(12)).toBe('Moderate');
    expect(getGad7SeverityBand(19)).toBe('Severe');
  });
});

describe('Triage Tier Evaluator Logic', () => {
  test('returns URGENT when PHQ-9 item 9 is above 0', () => {
    const phq9 = [0, 0, 0, 0, 0, 0, 0, 0, 1]; // Item 9 = 1
    const gad7 = [0, 0, 0, 0, 0, 0, 0];
    expect(evaluateTriageTier(phq9, gad7, DEFAULT_THRESHOLDS)).toBe('URGENT');
  });

  test('returns URGENT when PHQ-9 total >= 20', () => {
    const phq9 = [3, 3, 3, 3, 3, 3, 2, 0, 0]; // Total = 20
    const gad7 = [0, 0, 0, 0, 0, 0, 0];
    expect(evaluateTriageTier(phq9, gad7, DEFAULT_THRESHOLDS)).toBe('URGENT');
  });

  test('returns URGENT when GAD-7 total >= 15', () => {
    const phq9 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const gad7 = [3, 3, 3, 2, 2, 2, 0]; // Total = 15
    expect(evaluateTriageTier(phq9, gad7, DEFAULT_THRESHOLDS)).toBe('URGENT');
  });

  test('returns PRIORITY when PHQ-9 >= 9 or GAD-7 >= 10', () => {
    const phq9 = [1, 1, 1, 1, 1, 1, 1, 2, 0]; // Total = 9
    const gad7 = [0, 0, 0, 0, 0, 0, 0];
    expect(evaluateTriageTier(phq9, gad7, DEFAULT_THRESHOLDS)).toBe('PRIORITY');
  });

  test('returns WATCH when PHQ-9 is 5-8 or GAD-7 is 5-9', () => {
    const phq9 = [1, 1, 1, 1, 1, 0, 0, 0, 0]; // Total = 5
    const gad7 = [0, 0, 0, 0, 0, 0, 0];
    expect(evaluateTriageTier(phq9, gad7, DEFAULT_THRESHOLDS)).toBe('WATCH');
  });

  test('returns NONE for scores below watch thresholds', () => {
    const phq9 = [0, 1, 0, 1, 0, 0, 0, 0, 0]; // Total = 2
    const gad7 = [0, 0, 0, 1, 0, 0, 0]; // Total = 1
    expect(evaluateTriageTier(phq9, gad7, DEFAULT_THRESHOLDS)).toBe('NONE');
  });
});
