import { Prisma } from '../../../generated/prisma/client';

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string | string[];
  error: {
    statusCode: number;
    type: string;
    path: string;
    timestamp: string;
  };
}

function isDecimalLike(
  value: unknown,
): value is { toFixed: (decimals: number) => string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    Prisma.Decimal.isDecimal(value) &&
    typeof (value as { toFixed?: unknown }).toFixed === 'function'
  );
}

function isSerializedDecimal(
  value: unknown,
): value is { s: number; e: number; d: number[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { s?: unknown }).s === 'number' &&
    typeof (value as { e?: unknown }).e === 'number' &&
    Array.isArray((value as { d?: unknown }).d) &&
    (value as { d: unknown[] }).d.every((chunk) => typeof chunk === 'number')
  );
}

function serializedDecimalToString(value: {
  s: number;
  e: number;
  d: number[];
}) {
  const digits = value.d
    .map((chunk, index) =>
      index === 0 ? String(chunk) : String(chunk).padStart(7, '0'),
    )
    .join('');
  const decimalPosition = value.e + 1;

  let normalized: string;

  if (decimalPosition <= 0) {
    normalized = `0.${'0'.repeat(Math.abs(decimalPosition))}${digits}`;
  } else if (decimalPosition >= digits.length) {
    normalized = `${digits}${'0'.repeat(decimalPosition - digits.length)}`;
  } else {
    normalized = `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
  }

  return value.s < 0 ? `-${normalized}` : normalized;
}

function isMoneyKey(key?: string) {
  if (!key) {
    return false;
  }

  const normalizedKey = key.toLowerCase();

  if (normalizedKey.startsWith('cantidad') || normalizedKey === 'operaciones') {
    return false;
  }

  return (
    normalizedKey.includes('monto') ||
    normalizedKey.includes('saldo') ||
    normalizedKey.includes('debito') ||
    normalizedKey.includes('credito') ||
    normalizedKey.includes('tasa') ||
    normalizedKey.includes('utilidad') ||
    normalizedKey.endsWith('cop') ||
    normalizedKey.endsWith('bs') ||
    normalizedKey.endsWith('usd') ||
    normalizedKey.endsWith('usdt')
  );
}

function serializeMoneyValues(value: unknown, key?: string): unknown {
  if (isDecimalLike(value)) {
    return value.toFixed(2);
  }

  if (isSerializedDecimal(value) && isMoneyKey(key)) {
    return new Prisma.Decimal(serializedDecimalToString(value)).toFixed(2);
  }

  if (typeof value === 'number' && Number.isFinite(value) && isMoneyKey(key)) {
    return value.toFixed(2);
  }

  if (value instanceof Date || value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeMoneyValues(item));
  }

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      serializeMoneyValues(entryValue, entryKey),
    ]),
  );
}

export function successResponse<T>(
  data: T,
  message = 'Operación realizada correctamente.',
): ApiSuccessResponse<T> {
  return {
    success: true,
    message,
    data: serializeMoneyValues(data) as T,
  };
}
