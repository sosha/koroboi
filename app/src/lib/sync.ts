import { ScreeningPayload } from '../types';
import { enqueueResponse, getAllQueuedResponses, removeQueuedResponse } from './db';

const ENDPOINT_KEY = 'koroboi_apps_script_url';
const SECRET_KEY = 'koroboi_secret_token';

export function getSyncConfig() {
  const endpointUrl = localStorage.getItem(ENDPOINT_KEY) || import.meta.env.VITE_APPS_SCRIPT_URL || '';
  const secretToken = localStorage.getItem(SECRET_KEY) || import.meta.env.VITE_SECRET_TOKEN || '';
  return { endpointUrl, secretToken };
}

export function saveSyncConfig(endpointUrl: string, secretToken: string) {
  if (endpointUrl) localStorage.setItem(ENDPOINT_KEY, endpointUrl.trim());
  if (secretToken) localStorage.setItem(SECRET_KEY, secretToken.trim());
}

export async function sendPayloadToAppsScript(payload: ScreeningPayload): Promise<boolean> {
  const { endpointUrl, secretToken } = getSyncConfig();

  if (!endpointUrl) {
    throw new Error('Apps Script Web App URL is not configured.');
  }

  const requestBody = {
    secretToken,
    payload
  };

  try {
    // Content-Type text/plain avoids CORS preflight requests in Apps Script
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(requestBody),
      redirect: 'follow'
    });

    if (!response.ok) {
      return false;
    }

    const textResult = await response.text();
    let resultJson: { status?: string; message?: string } = {};
    try {
      resultJson = JSON.parse(textResult);
    } catch {
      // If result is plain text or HTML redirect response
      resultJson = { status: 'success' };
    }

    return resultJson.status === 'success' || resultJson.status === 'duplicate';
  } catch (error) {
    // Offline or network failure
    return false;
  }
}

export async function syncQueuedResponses(): Promise<{ successCount: number; failCount: number }> {
  const queued = await getAllQueuedResponses();
  let successCount = 0;
  let failCount = 0;

  for (const payload of queued) {
    const success = await sendPayloadToAppsScript(payload);
    if (success) {
      await removeQueuedResponse(payload.sessionId);
      successCount++;
    } else {
      failCount++;
    }
  }

  return { successCount, failCount };
}

export async function submitAndSyncResponse(payload: ScreeningPayload): Promise<boolean> {
  // Always enqueue first to ensure offline-first durability
  await enqueueResponse(payload);
  const success = await sendPayloadToAppsScript(payload);
  if (success) {
    await removeQueuedResponse(payload.sessionId);
    return true;
  }
  return false;
}
