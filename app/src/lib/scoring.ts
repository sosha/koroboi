import phq9En from '../instruments/phq9.en.json';
import phq9Sw from '../instruments/phq9.sw.json';
import gad7En from '../instruments/gad7.en.json';
import gad7Sw from '../instruments/gad7.sw.json';
import { InstrumentConfig, Language } from '../types';

export function getInstrument(type: 'phq9' | 'gad7', lang: Language): InstrumentConfig {
  const primary = type === 'phq9' ? (lang === 'sw' ? phq9Sw : phq9En) : (lang === 'sw' ? gad7Sw : gad7En);
  const fallback = type === 'phq9' ? phq9En : gad7En;

  if (lang === 'en') {
    return primary as InstrumentConfig;
  }

  // Fall back to English question by question if text starts with TODO
  const mergedOptions = primary.options.map((opt, idx) => {
    if (!opt.label || opt.label.startsWith('TODO')) {
      return fallback.options[idx] || opt;
    }
    return opt;
  });

  const mergedQuestions = primary.questions.map((q, idx) => {
    if (!q.text || q.text.startsWith('TODO')) {
      return fallback.questions[idx] || q;
    }
    return q;
  });

  const mergedInstruction = (!primary.instruction || primary.instruction.startsWith('TODO'))
    ? fallback.instruction
    : primary.instruction;

  return {
    ...primary,
    instruction: mergedInstruction,
    options: mergedOptions,
    questions: mergedQuestions
  } as InstrumentConfig;
}

export function calculatePhq9Total(answers: number[]): number {
  return answers.reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0);
}

export function calculateGad7Total(answers: number[]): number {
  return answers.reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0);
}

export function getPhq9SeverityBand(score: number): string {
  if (score >= 20) return 'Severe';
  if (score >= 15) return 'Moderately severe';
  if (score >= 10) return 'Moderate';
  if (score >= 5) return 'Mild';
  return 'Minimal';
}

export function getGad7SeverityBand(score: number): string {
  if (score >= 15) return 'Severe';
  if (score >= 10) return 'Moderate';
  if (score >= 5) return 'Mild';
  return 'Minimal';
}
