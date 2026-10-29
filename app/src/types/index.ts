export type Language = 'en' | 'sw';

export type TriageTier = 'URGENT' | 'PRIORITY' | 'WATCH' | 'NONE';

export interface Option {
  value: number;
  label: string;
}

export interface Question {
  id: string;
  number: number;
  text: string;
}

export interface InstrumentConfig {
  id: string;
  title: string;
  language: Language;
  instruction: string;
  options: Option[];
  questions: Question[];
}

export interface AnswersMap {
  [questionId: string]: number;
}

export interface ScreeningPayload {
  sessionId: string;
  sessionLabel: string;
  admissionNumber: string;
  language: Language;
  timestamp: string;
  phq9Answers: number[]; // 9 values
  gad7Answers: number[]; // 7 values
  incomplete?: boolean;
  demo?: boolean;
}

export interface ThresholdsConfig {
  label: string;
  phq9Item9UrgentThreshold: number; // > 0
  phq9UrgentTotal: number; // >= 20
  gad7UrgentTotal: number; // >= 15
  phq9PriorityTotal: number; // >= 9
  gad7PriorityTotal: number; // >= 10
  phq9WatchMin: number; // 5
  phq9WatchMax: number; // 8
  gad7WatchMin: number; // 5
  gad7WatchMax: number; // 9
}
