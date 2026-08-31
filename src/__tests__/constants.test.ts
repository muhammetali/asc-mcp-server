import { describe, it, expect } from 'vitest';
import { PROJECT_LOCALES, DEFAULT_TIMEOUT_MS, UPLOAD_TIMEOUT_MS, REPORT_TIMEOUT_MS, MAX_PAGES } from '../constants.js';

describe('constants', () => {
  it('should have exactly 7 project locales', () => {
    expect(PROJECT_LOCALES).toHaveLength(7);
  });

  it('should include all MyApp locales', () => {
    expect(PROJECT_LOCALES).toContain('en-US');
    expect(PROJECT_LOCALES).toContain('tr');
    expect(PROJECT_LOCALES).toContain('de-DE');
    expect(PROJECT_LOCALES).toContain('es-MX');
    expect(PROJECT_LOCALES).toContain('fr-FR');
    expect(PROJECT_LOCALES).toContain('ru');
    expect(PROJECT_LOCALES).toContain('ar-SA');
  });

  it('should have sensible timeout values', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
    expect(UPLOAD_TIMEOUT_MS).toBe(120_000);
    expect(REPORT_TIMEOUT_MS).toBe(60_000);
    expect(UPLOAD_TIMEOUT_MS).toBeGreaterThan(DEFAULT_TIMEOUT_MS);
    expect(REPORT_TIMEOUT_MS).toBeGreaterThan(DEFAULT_TIMEOUT_MS);
  });

  it('should have reasonable MAX_PAGES', () => {
    expect(MAX_PAGES).toBe(20);
    expect(MAX_PAGES).toBeGreaterThan(0);
  });
});
