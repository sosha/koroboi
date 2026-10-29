import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ScreeningPayload } from '../types';

interface KoroboiDB extends DBSchema {
  queue: {
    key: string; // sessionId
    value: ScreeningPayload;
  };
  draft: {
    key: string; // "current_draft"
    value: {
      sessionId: string;
      admissionNumber: string;
      language: 'en' | 'sw';
      phq9Answers: number[];
      gad7Answers: number[];
      timestamp: string;
    };
  };
}

const DB_NAME = 'koroboi-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<KoroboiDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<KoroboiDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('queue')) {
          db.createObjectStore('queue', { keyPath: 'sessionId' });
        }
        if (!db.objectStoreNames.contains('draft')) {
          db.createObjectStore('draft');
        }
      },
    });
  }
  return dbPromise;
}

export async function enqueueResponse(payload: ScreeningPayload): Promise<void> {
  const db = await getDB();
  await db.put('queue', payload);
}

export async function getAllQueuedResponses(): Promise<ScreeningPayload[]> {
  const db = await getDB();
  return db.getAll('queue');
}

export async function removeQueuedResponse(sessionId: string): Promise<void> {
  const db = await getDB();
  await db.delete('queue', sessionId);
}

export async function getQueueCount(): Promise<number> {
  const db = await getDB();
  return db.count('queue');
}

export async function clearAllLocalData(): Promise<void> {
  const db = await getDB();
  await db.clear('queue');
  await db.clear('draft');
}

export async function saveDraftProgress(draft: {
  sessionId: string;
  admissionNumber: string;
  language: 'en' | 'sw';
  phq9Answers: number[];
  gad7Answers: number[];
  timestamp: string;
}): Promise<void> {
  const db = await getDB();
  await db.put('draft', draft, 'current_draft');
}

export async function getDraftProgress() {
  const db = await getDB();
  return db.get('draft', 'current_draft');
}

export async function clearDraftProgress(): Promise<void> {
  const db = await getDB();
  await db.delete('draft', 'current_draft');
}
