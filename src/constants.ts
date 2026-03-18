// Supported locales - Single Source of Truth
export const PROJECT_LOCALES = ['en-US', 'tr', 'de-DE', 'es-MX', 'fr-FR', 'ru', 'ar-SA'] as const;
export type ProjectLocale = (typeof PROJECT_LOCALES)[number];

// API timeout (30 seconds default, 120 seconds for uploads/reports)
export const DEFAULT_TIMEOUT_MS = 30_000;
export const UPLOAD_TIMEOUT_MS = 120_000;
export const REPORT_TIMEOUT_MS = 60_000;

// Pagination safety limit
export const MAX_PAGES = 20;
