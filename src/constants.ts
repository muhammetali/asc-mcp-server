// Supported locales - Single Source of Truth
export const PROJECT_LOCALES = ['en-US', 'tr', 'de-DE', 'es-MX', 'fr-FR', 'ru', 'ar-SA'] as const;
export type ProjectLocale = (typeof PROJECT_LOCALES)[number];

// API timeout (30 seconds default, 120 seconds for uploads/reports)
export const DEFAULT_TIMEOUT_MS = 30_000;
export const UPLOAD_TIMEOUT_MS = 120_000;
export const REPORT_TIMEOUT_MS = 60_000;

// Pagination safety limit
export const MAX_PAGES = 20;

// App Store version states
export const APP_STORE_STATES = {
  PREPARE_FOR_SUBMISSION: 'PREPARE_FOR_SUBMISSION',
  WAITING_FOR_REVIEW: 'WAITING_FOR_REVIEW',
  IN_REVIEW: 'IN_REVIEW',
  READY_FOR_SALE: 'READY_FOR_SALE',
  REJECTED: 'REJECTED',
  DEVELOPER_REJECTED: 'DEVELOPER_REJECTED',
  DEVELOPER_REMOVED_FROM_SALE: 'DEVELOPER_REMOVED_FROM_SALE',
  PENDING_DEVELOPER_RELEASE: 'PENDING_DEVELOPER_RELEASE',
  PROCESSING_FOR_APP_STORE: 'PROCESSING_FOR_APP_STORE',
  REPLACED_WITH_NEW_VERSION: 'REPLACED_WITH_NEW_VERSION',
} as const;
export type AppStoreState = (typeof APP_STORE_STATES)[keyof typeof APP_STORE_STATES];

// ASC resource type identifiers
export const RESOURCE_TYPES = {
  APPS: 'apps',
  APP_STORE_VERSIONS: 'appStoreVersions',
  APP_STORE_VERSION_LOCALIZATIONS: 'appStoreVersionLocalizations',
  APP_STORE_REVIEW_DETAILS: 'appStoreReviewDetails',
  APP_INFO_LOCALIZATIONS: 'appInfoLocalizations',
  BUILDS: 'builds',
  BETA_GROUPS: 'betaGroups',
  REVIEW_SUBMISSIONS: 'reviewSubmissions',
  REVIEW_SUBMISSION_ITEMS: 'reviewSubmissionItems',
  APP_SCREENSHOTS: 'appScreenshots',
  APP_SCREENSHOT_SETS: 'appScreenshotSets',
  PRE_RELEASE_VERSIONS: 'preReleaseVersions',
  BUILD_BETA_DETAILS: 'buildBetaDetails',
} as const;

// Common field specifications for API queries
export const VERSION_FIELDS = {
  BASIC: 'versionString,appStoreState,platform,createdDate',
  WITH_RELEASE_TYPE: 'versionString,appStoreState,platform,releaseType,createdDate',
} as const;

export const REVIEW_DETAIL_FIELDS = {
  FULL: 'contactFirstName,contactLastName,contactEmail,contactPhone,demoAccountName,demoAccountPassword,demoAccountRequired,notes',
} as const;
