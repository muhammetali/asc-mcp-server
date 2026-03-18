import { PROJECT_LOCALES } from './constants.js';

/**
 * Validates that an ID parameter is a non-empty string.
 * Throws if invalid.
 */
export function validateId(value: string, paramName: string): void {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${paramName}: must be a non-empty string.`);
  }
}

/**
 * Validates a URL has basic URL format (protocol + host).
 * Throws if invalid.
 */
export function validateUrl(value: string, paramName: string): void {
  try {
    const parsed = new URL(value);
    if (!parsed.protocol.startsWith('http')) {
      throw new Error('not http(s)');
    }
  } catch {
    throw new Error(`Invalid ${paramName}: "${value}" is not a valid URL. Must start with http:// or https://.`);
  }
}

/**
 * Validates a locale value against PROJECT_LOCALES.
 * Throws if invalid.
 */
export function validateLocale(locale: string): void {
  if (!PROJECT_LOCALES.includes(locale as any)) {
    throw new Error(
      `Invalid locale: "${locale}". Supported locales: ${PROJECT_LOCALES.join(', ')}.`
    );
  }
}

/**
 * Escapes pipe characters and newlines in strings for safe markdown table cell content.
 */
export function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
