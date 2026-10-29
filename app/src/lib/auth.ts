const SALT_KEY = 'koroboi_pin_salt';
const HASH_KEY = 'koroboi_pin_hash';
const LOCK_UNTIL_KEY = 'koroboi_pin_lock_until';
const FAILED_ATTEMPTS_KEY = 'koroboi_pin_failed_attempts';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(Math.ceil(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

async function hashPin(pin: string, saltBuffer: ArrayBuffer): Promise<string> {
  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin);
  const combined = new Uint8Array(saltBuffer.byteLength + pinData.byteLength);
  combined.set(new Uint8Array(saltBuffer), 0);
  combined.set(pinData, saltBuffer.byteLength);

  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  return arrayBufferToHex(hashBuffer);
}

export function isPinSet(): boolean {
  return !!localStorage.getItem(HASH_KEY);
}

export async function setStaffPin(pin: string): Promise<void> {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error('PIN must be exactly 6 digits.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = arrayBufferToHex(salt.buffer);
  const hashHex = await hashPin(pin, salt.buffer);

  localStorage.setItem(SALT_KEY, saltHex);
  localStorage.setItem(HASH_KEY, hashHex);
  localStorage.removeItem(FAILED_ATTEMPTS_KEY);
  localStorage.removeItem(LOCK_UNTIL_KEY);
}

export function isPinLocked(): { locked: boolean; remainingSeconds: number } {
  const lockUntil = parseInt(localStorage.getItem(LOCK_UNTIL_KEY) || '0', 10);
  const now = Date.now();
  if (now < lockUntil) {
    return { locked: true, remainingSeconds: Math.ceil((lockUntil - now) / 1000) };
  }
  return { locked: false, remainingSeconds: 0 };
}

export async function verifyStaffPin(pin: string): Promise<{ success: boolean; message?: string }> {
  const lockStatus = isPinLocked();
  if (lockStatus.locked) {
    return {
      success: false,
      message: `Too many wrong attempts. Locked for ${lockStatus.remainingSeconds}s.`
    };
  }

  const saltHex = localStorage.getItem(SALT_KEY);
  const storedHashHex = localStorage.getItem(HASH_KEY);

  if (!saltHex || !storedHashHex) {
    return { success: false, message: 'No PIN has been configured yet.' };
  }

  const saltBuffer = hexToArrayBuffer(saltHex);
  const computedHashHex = await hashPin(pin, saltBuffer);

  if (computedHashHex === storedHashHex) {
    localStorage.removeItem(FAILED_ATTEMPTS_KEY);
    localStorage.removeItem(LOCK_UNTIL_KEY);
    return { success: true };
  } else {
    let failedAttempts = parseInt(localStorage.getItem(FAILED_ATTEMPTS_KEY) || '0', 10) + 1;
    localStorage.setItem(FAILED_ATTEMPTS_KEY, failedAttempts.toString());

    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockUntil = Date.now() + LOCKOUT_DURATION_MS;
      localStorage.setItem(LOCK_UNTIL_KEY, lockUntil.toString());
      return {
        success: false,
        message: `Too many wrong attempts. Staff screen locked for 5 minutes.`
      };
    }

    return {
      success: false,
      message: `Incorrect PIN. ${MAX_FAILED_ATTEMPTS - failedAttempts} attempt(s) remaining.`
    };
  }
}
