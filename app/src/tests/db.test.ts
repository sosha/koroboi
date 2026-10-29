import { describe, test, expect, beforeEach } from 'vitest';
import {
  enqueueResponse,
  getAllQueuedResponses,
  removeQueuedResponse,
  getQueueCount,
  clearAllLocalData,
  saveDraftProgress,
  getDraftProgress,
  clearDraftProgress
} from '../lib/db';
import { ScreeningPayload } from '../types';

describe('IndexedDB Queue & Draft Operations', () => {
  beforeEach(async () => {
    await clearAllLocalData();
  });

  test('enqueues responses and retrieves queue count', async () => {
    const payload: ScreeningPayload = {
      sessionId: 'sess_1',
      sessionLabel: 'Form 1 - Term 1',
      admissionNumber: '2025-0001',
      language: 'en',
      timestamp: new Date().toISOString(),
      phq9Answers: [1, 0, 0, 0, 0, 0, 0, 0, 0],
      gad7Answers: [0, 0, 0, 0, 0, 0, 0]
    };

    await enqueueResponse(payload);
    expect(await getQueueCount()).toBe(1);

    const queued = await getAllQueuedResponses();
    expect(queued).toHaveLength(1);
    expect(queued[0].sessionId).toBe('sess_1');
  });

  test('removes response from queue after successful sync', async () => {
    const payload: ScreeningPayload = {
      sessionId: 'sess_2',
      sessionLabel: 'Form 1',
      admissionNumber: '2025-0002',
      language: 'sw',
      timestamp: new Date().toISOString(),
      phq9Answers: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      gad7Answers: [0, 0, 0, 0, 0, 0, 0]
    };

    await enqueueResponse(payload);
    expect(await getQueueCount()).toBe(1);

    await removeQueuedResponse('sess_2');
    expect(await getQueueCount()).toBe(0);
  });

  test('saves and clears draft progress during active questionnaire', async () => {
    const draft = {
      sessionId: 'draft_1',
      admissionNumber: '2025-0003',
      language: 'en' as const,
      phq9Answers: [1, 2, 3],
      gad7Answers: [],
      timestamp: new Date().toISOString()
    };

    await saveDraftProgress(draft);
    const saved = await getDraftProgress();
    expect(saved?.admissionNumber).toBe('2025-0003');
    expect(saved?.phq9Answers).toEqual([1, 2, 3]);

    await clearDraftProgress();
    expect(await getDraftProgress()).toBeUndefined();
  });

  test('flags demo records correctly with demo: true', async () => {
    const demoPayload: ScreeningPayload = {
      sessionId: 'demo_123',
      sessionLabel: 'Form 2',
      admissionNumber: '2025-9999',
      language: 'en',
      timestamp: new Date().toISOString(),
      phq9Answers: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      gad7Answers: [0, 0, 0, 0, 0, 0, 0],
      demo: true
    };

    await enqueueResponse(demoPayload);
    const queued = await getAllQueuedResponses();
    expect(queued[0].demo).toBe(true);
  });

  test('handles abandoned session with incomplete flag', async () => {
    const abandonedPayload: ScreeningPayload = {
      sessionId: 'abandoned_1',
      sessionLabel: 'Form 3',
      admissionNumber: '2025-0100',
      language: 'en',
      timestamp: new Date().toISOString(),
      phq9Answers: [2, 2, 2, 2, 2, 2, 2, 2, 2], // item 9 = 2
      gad7Answers: [],
      incomplete: true
    };

    await enqueueResponse(abandonedPayload);
    const queued = await getAllQueuedResponses();
    expect(queued[0].incomplete).toBe(true);
    expect(queued[0].phq9Answers[8]).toBeGreaterThan(0);
  });
});
