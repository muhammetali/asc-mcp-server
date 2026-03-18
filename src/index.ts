#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PROJECT_LOCALES } from './constants.js';

// Load .env from the package directory
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

// Zod schema for locale validation (reused across tools)
const localeSchema = z.enum(PROJECT_LOCALES).describe('Locale code (en-US, tr, de-DE, es-MX, fr-FR, ru, ar-SA)');

// Tool implementations
import { listApps, getAppInfo, updateAppInfoLocalization } from './tools/apps.js';
import {
  listVersions, createVersion, updateWhatsNew,
  updateVersionLocalization, getVersionLocalizations,
  assignBuildToVersion, deleteVersion, updateVersionString,
  resolveVersionId, managePhasedRelease, releaseVersion,
} from './tools/versions.js';
import {
  listBuilds, getBuildDetails, listBetaGroups,
  addBuildToBetaGroup, setBetaBuildLocalization,
  setEncryption,
} from './tools/builds.js';
import {
  getReviewSubmission, updateReviewDetail,
  submitForReview, withdrawFromReview, getRejectionReasons,
} from './tools/review.js';
import { getSalesReport, getFinancialReport } from './tools/reports.js';
import {
  listScreenshotSets, uploadScreenshot,
  deleteScreenshot, deleteAllScreenshotsInSet,
} from './tools/screenshots.js';
import {
  listCustomerReviews, respondToCustomerReview,
} from './tools/customers.js';
import {
  listBetaTesters, addBetaTester, removeBetaTester,
  createBetaGroup, deleteBetaGroup,
} from './tools/betaTesters.js';
import {
  listInAppPurchases, listSubscriptionGroups, getAppPricing,
} from './tools/appAvailability.js';
import {
  getBuildDiagnostics, getPerfPowerMetrics,
  requestAnalyticsReport, getAnalyticsReport,
} from './tools/diagnostics.js';
import {
  getAgeRating, updateAgeRating, manageAppAvailability,
  uploadReviewAttachment, listCertificates, registerDevice, listDevices,
} from './tools/appManagement.js';
import {
  submitForBetaReview, getBetaReviewStatus,
} from './tools/betaReview.js';
import {
  listSandboxTesters, clearSandboxTesterHistory,
  listAppEvents, createAppEvent, listCustomProductPages,
  createScreenshotSet, reorderScreenshots,
  uploadAppPreview, deleteAppPreview, createPreviewSet, listPreviewSets,
} from './tools/appFeatures.js';

import { ASCClientError } from './client.js';

const server = new McpServer({
  name: 'asc-mcp-server',
  version: '1.0.0',
  description: 'App Store Connect MCP Server - Manage apps, versions, builds, TestFlight, screenshots, and review submissions.',
});

// Helper: wrap tool handlers with error handling
function handleError(error: unknown): string {
  if (error instanceof ASCClientError) {
    return `**ASC API Error (${error.status})**\n\n${error.message}\n\n${getErrorHelp(error)}`;
  }
  if (error instanceof Error) {
    return `**Error:** ${error.message}`;
  }
  return `**Error:** ${String(error)}`;
}

function getErrorHelp(error: ASCClientError): string {
  const code = error.errors[0]?.code;
  switch (code) {
    case 'FORBIDDEN':
      return '> Check your API key permissions in App Store Connect > Users and Access > Keys.';
    case 'NOT_FOUND':
      return '> The requested resource was not found. Verify the ID is correct.';
    case 'CONFLICT':
      return '> Resource conflict. The version/build may already exist or be in an incompatible state.';
    case 'RATE_LIMIT':
      return '> Rate limited by Apple. Wait 30 seconds and try again.';
    case 'ENTITY_UNPROCESSABLE':
      return '> Invalid data. Check that all required fields are filled correctly.';
    case 'UNAUTHORIZED':
      return '> Authentication failed. Check your API key, issuer ID, and that the P8 file is valid.';
    case 'PARAMETER_ERROR':
      return '> Invalid parameter. Check parameter names and values.';
    case 'ENTITY_ERROR':
      return '> Entity validation failed. One or more required fields may be missing or invalid.';
    case 'STATE_ERROR':
      return '> The resource is not in the correct state for this operation.';
    case 'NOT_ALLOWED':
      return '> This operation is not allowed. Your account may not have the required permissions or role.';
    default:
      return error.status === 401
        ? '> Authentication failed. Your JWT token may be expired. Restart the server to regenerate.'
        : '';
  }
}

// =============================================================================
// APPS
// =============================================================================

server.tool(
  'asc_list_apps',
  'List all apps in your App Store Connect account with bundle IDs and basic info',
  {},
  async () => {
    try {
      const result = await listApps();
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_get_app_info',
  'Get detailed app info including privacy policy URLs, age rating, localizations, and recent versions. Warns about missing privacy policies that cause rejections.',
  { appId: z.string().describe('App ID (from asc_list_apps)') },
  async ({ appId }) => {
    try {
      const result = await getAppInfo(appId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_update_app_info_localization',
  'Update app-level localization (privacy policy URL, name, subtitle). Use this to fix missing privacy policies that cause App Store rejections.',
  {
    appId: z.string().describe('App ID'),
    locale: localeSchema,
    privacyPolicyUrl: z.string().optional().describe('Privacy policy URL'),
    privacyChoicesUrl: z.string().optional().describe('Privacy choices URL (CCPA)'),
    privacyPolicyText: z.string().optional().describe('Privacy policy text'),
    name: z.string().optional().describe('App name for this locale'),
    subtitle: z.string().optional().describe('App subtitle for this locale'),
  },
  async ({ appId, locale, ...updates }) => {
    try {
      const result = await updateAppInfoLocalization(appId, locale, updates);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// VERSIONS
// =============================================================================

server.tool(
  'asc_list_versions',
  'List all App Store versions with their states (LIVE, DRAFT, IN_REVIEW, REJECTED, etc). Highlights rejected versions.',
  {
    appId: z.string().describe('App ID'),
    platform: z.enum(['IOS', 'MAC_OS', 'TV_OS', 'VISION_OS']).optional().describe('Filter by platform'),
  },
  async ({ appId, platform }) => {
    try {
      const result = await listVersions(appId, platform);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_create_version',
  'Create a new App Store version. After creating, set What\'s New, attach a build, and submit for review.',
  {
    appId: z.string().describe('App ID'),
    versionString: z.string().describe('Version string (e.g., 2.1.0)'),
    platform: z.enum(['IOS', 'MAC_OS', 'TV_OS', 'VISION_OS']).default('IOS').describe('Platform'),
    releaseType: z.enum(['MANUAL', 'AFTER_APPROVAL', 'SCHEDULED']).default('MANUAL').describe('Release type'),
  },
  async ({ appId, versionString, platform, releaseType }) => {
    try {
      const result = await createVersion(appId, versionString, platform, releaseType);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_update_whats_new',
  'Update What\'s New (release notes) for multiple locales at once. Pass a JSON object of locale -> text.',
  {
    versionId: z.string().describe('Version ID (from asc_list_versions)'),
    whatsNew: z.record(z.string(), z.string()).describe('Object of locale -> What\'s New text. E.g., {"en-US": "Bug fixes", "tr": "Hata duzeltmeleri"}'),
  },
  async ({ versionId, whatsNew }) => {
    try {
      const result = await updateWhatsNew(versionId, whatsNew);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_update_version_localization',
  'Update a single locale\'s version metadata (What\'s New, description, keywords, promotional text, URLs)',
  {
    versionId: z.string().describe('Version ID'),
    locale: localeSchema,
    whatsNew: z.string().optional().describe('What\'s New text'),
    description: z.string().optional().describe('App description'),
    keywords: z.string().optional().describe('Keywords (comma-separated, max 100 chars)'),
    promotionalText: z.string().optional().describe('Promotional text'),
    marketingUrl: z.string().optional().describe('Marketing URL'),
    supportUrl: z.string().optional().describe('Support URL'),
  },
  async ({ versionId, locale, ...updates }) => {
    try {
      const result = await updateVersionLocalization(versionId, locale, updates);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_get_version_localizations',
  'View all localizations for a version (What\'s New, descriptions, keywords). Warns about missing/empty fields.',
  { versionId: z.string().describe('Version ID') },
  async ({ versionId }) => {
    try {
      const result = await getVersionLocalizations(versionId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_assign_build',
  'Assign a build to an App Store version. The build must be in VALID processing state.',
  {
    versionId: z.string().describe('Version ID'),
    buildId: z.string().describe('Build ID (from asc_list_builds)'),
  },
  async ({ versionId, buildId }) => {
    try {
      const result = await assignBuildToVersion(versionId, buildId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_update_version_string',
  'Change the version string of a draft/rejected version (e.g., 1.5.0 → 1.6.0). Only works for editable versions.',
  {
    versionId: z.string().describe('Version ID (from asc_list_versions)'),
    newVersionString: z.string().describe('New version string (e.g., 2.0.0)'),
  },
  async ({ versionId, newVersionString }) => {
    try {
      const result = await updateVersionString(versionId, newVersionString);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_resolve_version',
  'Find a version ID by version string (e.g., "1.6.0"). Useful when you have the version number but need the ID for other tools.',
  {
    appId: z.string().describe('App ID'),
    versionString: z.string().describe('Version string to find (e.g., 1.6.0)'),
    platform: z.enum(['IOS', 'MAC_OS', 'TV_OS', 'VISION_OS']).default('IOS').describe('Platform'),
  },
  async ({ appId, versionString, platform }) => {
    try {
      const v = await resolveVersionId(appId, versionString, platform);
      let md = `## Version Found\n\n`;
      md += `| Field | Value |\n`;
      md += `|-------|-------|\n`;
      md += `| **Version** | ${v.attributes.versionString} |\n`;
      md += `| **Platform** | ${v.attributes.platform} |\n`;
      md += `| **State** | ${v.attributes.appStoreState} |\n`;
      md += `| **Version ID** | \`${v.id}\` |\n`;
      return { content: [{ type: 'text', text: md }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_phased_release',
  'Manage phased (gradual) release for a version. Actions: create (enable 7-day rollout), pause, resume, complete (release to everyone).',
  {
    versionId: z.string().describe('Version ID'),
    action: z.enum(['create', 'pause', 'resume', 'complete']).describe('Phased release action'),
  },
  async ({ versionId, action }) => {
    try {
      const result = await managePhasedRelease(versionId, action);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_release_version',
  'Manually release a version that is approved and waiting for developer release (PENDING_DEVELOPER_RELEASE → READY_FOR_SALE).',
  { versionId: z.string().describe('Version ID') },
  async ({ versionId }) => {
    try {
      const result = await releaseVersion(versionId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// BUILDS & TESTFLIGHT
// =============================================================================

server.tool(
  'asc_list_builds',
  'List recent builds with processing state, TestFlight internal/external status. Shows which builds are ready for release.',
  {
    appId: z.string().describe('App ID'),
    limit: z.number().min(1).max(50).default(10).describe('Number of builds to fetch'),
  },
  async ({ appId, limit }) => {
    try {
      const result = await listBuilds(appId, limit);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_get_build_details',
  'Get detailed info for a specific build including TestFlight What\'s New and encryption status.',
  { buildId: z.string().describe('Build ID') },
  async ({ buildId }) => {
    try {
      const result = await getBuildDetails(buildId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_list_beta_groups',
  'List TestFlight beta groups (internal/external) with their settings.',
  { appId: z.string().describe('App ID') },
  async ({ appId }) => {
    try {
      const result = await listBetaGroups(appId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_add_build_to_beta_group',
  'Add a build to a TestFlight beta group for testing. Testers in the group will be notified.',
  {
    betaGroupId: z.string().describe('Beta group ID (from asc_list_beta_groups)'),
    buildId: z.string().describe('Build ID'),
  },
  async ({ betaGroupId, buildId }) => {
    try {
      const result = await addBuildToBetaGroup(betaGroupId, buildId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_set_testflight_whats_new',
  'Set What\'s New text for a TestFlight build (shown to testers)',
  {
    buildId: z.string().describe('Build ID'),
    locale: localeSchema.default('en-US'),
    whatsNew: z.string().describe('What\'s New text for testers'),
  },
  async ({ buildId, locale, whatsNew }) => {
    try {
      const result = await setBetaBuildLocalization(buildId, locale, whatsNew);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_set_encryption',
  'Set the export compliance (usesNonExemptEncryption) flag on a build. Required before submitting for review. Most apps should set this to false.',
  {
    buildId: z.string().describe('Build ID (from asc_list_builds)'),
    usesNonExemptEncryption: z.boolean().default(false).describe('Whether the app uses non-exempt encryption. Set to false for most apps (standard HTTPS only).'),
  },
  async ({ buildId, usesNonExemptEncryption }) => {
    try {
      const result = await setEncryption(buildId, usesNonExemptEncryption);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_delete_version',
  'Delete a draft or rejected App Store version. Only works for versions in PREPARE_FOR_SUBMISSION, DEVELOPER_REJECTED, or REJECTED state.',
  { versionId: z.string().describe('Version ID (from asc_list_versions)') },
  async ({ versionId }) => {
    try {
      const result = await deleteVersion(versionId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// REVIEW & SUBMISSION
// =============================================================================

server.tool(
  'asc_get_review_submission',
  'Get review submission status and details for a version. Shows demo account, reviewer notes, and rejection info.',
  { versionId: z.string().describe('Version ID') },
  async ({ versionId }) => {
    try {
      const result = await getReviewSubmission(versionId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_update_review_detail',
  'Update review details (demo account, contact info, notes to reviewer). Critical for avoiding rejections.',
  {
    versionId: z.string().describe('Version ID'),
    contactFirstName: z.string().optional().describe('Contact first name'),
    contactLastName: z.string().optional().describe('Contact last name'),
    contactEmail: z.string().optional().describe('Contact email'),
    contactPhone: z.string().optional().describe('Contact phone'),
    demoAccountName: z.string().optional().describe('Demo account username'),
    demoAccountPassword: z.string().optional().describe('Demo account password'),
    demoAccountRequired: z.boolean().optional().describe('Whether demo account is required'),
    notes: z.string().optional().describe('Notes to app reviewer (explain features, provide context)'),
  },
  async ({ versionId, ...updates }) => {
    try {
      const result = await updateReviewDetail(versionId, updates);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_submit_for_review',
  'Submit a version for App Review. Accepts either versionId directly OR appId+versionString to auto-resolve. Runs pre-flight checks before submitting.',
  {
    versionId: z.string().optional().describe('Version ID (provide this OR appId+versionString)'),
    appId: z.string().optional().describe('App ID (use with versionString instead of versionId)'),
    versionString: z.string().optional().describe('Version string like "1.6.0" (use with appId instead of versionId)'),
    platform: z.enum(['IOS', 'MAC_OS', 'TV_OS', 'VISION_OS']).default('IOS').optional().describe('Platform (when using versionString)'),
  },
  async ({ versionId, appId, versionString, platform }) => {
    try {
      const result = await submitForReview(versionId, appId, versionString, platform);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_withdraw_from_review',
  'Withdraw a version from App Review. Use when you need to cancel a pending review to make changes or create a new version.',
  { versionId: z.string().describe('Version ID (from asc_list_versions)') },
  async ({ versionId }) => {
    try {
      const result = await withdrawFromReview(versionId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_get_rejection_reasons',
  'List recent rejected versions with rejection context and common rejection reasons.',
  { appId: z.string().describe('App ID') },
  async ({ appId }) => {
    try {
      const result = await getRejectionReasons(appId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// REPORTS
// =============================================================================

server.tool(
  'asc_sales_report',
  'Download and parse App Store sales report. Shows units, revenue by product.',
  {
    vendorNumber: z.string().describe('Vendor number (find in App Store Connect > Payments and Financial Reports)'),
    frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).default('DAILY').describe('Report frequency'),
    reportDate: z.string().describe('Report date (YYYY-MM-DD for daily, YYYY-MM for monthly)'),
    reportSubType: z.enum(['SUMMARY', 'DETAILED', 'OPT_IN']).default('SUMMARY').describe('Report sub type'),
  },
  async ({ vendorNumber, frequency, reportDate, reportSubType }) => {
    try {
      const result = await getSalesReport(vendorNumber, frequency, reportDate, reportSubType);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_financial_report',
  'Download financial report for a region.',
  {
    vendorNumber: z.string().describe('Vendor number'),
    regionCode: z.string().describe('Region code (e.g., US, EU, JP)'),
    reportDate: z.string().describe('Report date (YYYY-MM)'),
  },
  async ({ vendorNumber, regionCode, reportDate }) => {
    try {
      const result = await getFinancialReport(vendorNumber, regionCode, reportDate);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// SCREENSHOTS
// =============================================================================

server.tool(
  'asc_list_screenshot_sets',
  'List screenshot sets and their screenshots for a version localization.',
  { versionLocalizationId: z.string().describe('Version localization ID (from asc_get_version_localizations)') },
  async ({ versionLocalizationId }) => {
    try {
      const result = await listScreenshotSets(versionLocalizationId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_upload_screenshot',
  'Upload a screenshot to a screenshot set. Handles the 3-step process: reserve, upload chunks, commit.',
  {
    screenshotSetId: z.string().describe('Screenshot set ID'),
    filePath: z.string().describe('Absolute path to the screenshot file on disk'),
    fileName: z.string().describe('File name for App Store (e.g., 01_home.png)'),
  },
  async ({ screenshotSetId, filePath, fileName }) => {
    try {
      const result = await uploadScreenshot(screenshotSetId, filePath, fileName);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_delete_screenshot',
  'Delete a single screenshot by ID.',
  { screenshotId: z.string().describe('Screenshot ID') },
  async ({ screenshotId }) => {
    try {
      const result = await deleteScreenshot(screenshotId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_delete_all_screenshots',
  'Delete ALL screenshots in a screenshot set. Use before re-uploading new screenshots.',
  { screenshotSetId: z.string().describe('Screenshot set ID') },
  async ({ screenshotSetId }) => {
    try {
      const result = await deleteAllScreenshotsInSet(screenshotSetId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// CUSTOMER REVIEWS
// =============================================================================

server.tool(
  'asc_list_customer_reviews',
  'List App Store customer reviews with ratings, text, and your responses. Useful for monitoring user feedback.',
  {
    appId: z.string().describe('App ID'),
    sort: z.enum(['-createdDate', 'createdDate', '-rating', 'rating']).default('-createdDate').describe('Sort order'),
    limit: z.number().min(1).max(200).default(20).describe('Number of reviews to fetch'),
  },
  async ({ appId, sort, limit }) => {
    try {
      const result = await listCustomerReviews(appId, sort, limit);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_respond_to_review',
  'Respond to a customer review on the App Store. Creates or updates your developer response.',
  {
    reviewId: z.string().describe('Review ID (from asc_list_customer_reviews)'),
    responseBody: z.string().describe('Your response text (visible on App Store)'),
  },
  async ({ reviewId, responseBody }) => {
    try {
      const result = await respondToCustomerReview(reviewId, responseBody);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// BETA TESTERS
// =============================================================================

server.tool(
  'asc_list_beta_testers',
  'List TestFlight beta testers. Filter by app, beta group, or email.',
  {
    appId: z.string().optional().describe('Filter by App ID'),
    betaGroupId: z.string().optional().describe('Filter by Beta Group ID'),
    email: z.string().optional().describe('Filter by email address'),
    limit: z.number().min(1).max(200).default(50).describe('Number of testers to fetch'),
  },
  async ({ appId, betaGroupId, email, limit }) => {
    try {
      const result = await listBetaTesters(appId, betaGroupId, email, limit);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_add_beta_tester',
  'Add a beta tester to a TestFlight group. Sends an invitation email automatically.',
  {
    betaGroupId: z.string().describe('Beta Group ID (from asc_list_beta_groups)'),
    email: z.string().email().describe('Tester email address'),
    firstName: z.string().optional().describe('Tester first name'),
    lastName: z.string().optional().describe('Tester last name'),
  },
  async ({ betaGroupId, email, firstName, lastName }) => {
    try {
      const result = await addBetaTester(betaGroupId, email, firstName, lastName);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_remove_beta_tester',
  'Remove a beta tester from a TestFlight group.',
  {
    betaGroupId: z.string().describe('Beta Group ID'),
    testerId: z.string().describe('Tester ID (from asc_list_beta_testers)'),
  },
  async ({ betaGroupId, testerId }) => {
    try {
      const result = await removeBetaTester(betaGroupId, testerId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_create_beta_group',
  'Create a new TestFlight beta group (internal or external).',
  {
    appId: z.string().describe('App ID'),
    name: z.string().describe('Group name'),
    isInternal: z.boolean().default(false).describe('Whether this is an internal group'),
    publicLinkEnabled: z.boolean().default(false).describe('Enable public TestFlight link'),
  },
  async ({ appId, name, isInternal, publicLinkEnabled }) => {
    try {
      const result = await createBetaGroup(appId, name, isInternal, publicLinkEnabled);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_delete_beta_group',
  'Delete a TestFlight beta group.',
  { betaGroupId: z.string().describe('Beta Group ID') },
  async ({ betaGroupId }) => {
    try {
      const result = await deleteBetaGroup(betaGroupId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// IN-APP PURCHASES & SUBSCRIPTIONS
// =============================================================================

server.tool(
  'asc_list_in_app_purchases',
  'List all in-app purchases for an app with their product IDs, types, and states.',
  { appId: z.string().describe('App ID') },
  async ({ appId }) => {
    try {
      const result = await listInAppPurchases(appId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_list_subscriptions',
  'List subscription groups and their subscriptions for an app.',
  { appId: z.string().describe('App ID') },
  async ({ appId }) => {
    try {
      const result = await listSubscriptionGroups(appId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_get_app_pricing',
  'Get app pricing schedule and available territories (countries where the app is available).',
  { appId: z.string().describe('App ID') },
  async ({ appId }) => {
    try {
      const result = await getAppPricing(appId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// DIAGNOSTICS & ANALYTICS
// =============================================================================

server.tool(
  'asc_get_build_diagnostics',
  'Get crash diagnostic signatures and logs for a build. Use to investigate crash issues after release.',
  { buildId: z.string().describe('Build ID') },
  async ({ buildId }) => {
    try {
      const result = await getBuildDiagnostics(buildId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_get_perf_metrics',
  'Get performance and power metrics for an app (battery, launch time, memory, hangs, disk, animation, termination).',
  {
    appId: z.string().describe('App ID'),
    metricType: z.enum(['DISK', 'HANG', 'BATTERY', 'LAUNCH', 'MEMORY', 'ANIMATION', 'TERMINATION']).optional().describe('Filter by metric type'),
    platform: z.string().optional().describe('Filter by platform (e.g., IOS)'),
  },
  async ({ appId, metricType, platform }) => {
    try {
      const result = await getPerfPowerMetrics(appId, metricType, platform);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_request_analytics_report',
  'Request generation of an analytics report. Use asc_get_analytics_report to download once ready.',
  {
    appId: z.string().describe('App ID'),
    category: z.enum(['APP_USAGE', 'APP_STORE_ENGAGEMENT', 'COMMERCE', 'FRAMEWORK_USAGE', 'PERFORMANCE']).describe('Report category'),
  },
  async ({ appId, category }) => {
    try {
      const result = await requestAnalyticsReport(appId, category);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_get_analytics_report',
  'Check status and download a previously requested analytics report.',
  { requestId: z.string().describe('Report request ID (from asc_request_analytics_report)') },
  async ({ requestId }) => {
    try {
      const result = await getAnalyticsReport(requestId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// AGE RATING & APP AVAILABILITY
// =============================================================================

server.tool(
  'asc_get_age_rating',
  'Get the age rating declaration for a version. Shows all content rating fields.',
  { versionId: z.string().describe('Version ID') },
  async ({ versionId }) => {
    try {
      const result = await getAgeRating(versionId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_update_age_rating',
  'Update age rating declaration. Enum fields use NONE, INFREQUENT_OR_MILD, or FREQUENT_OR_INTENSE. Boolean fields for gambling, unrestrictedWebAccess, seventeenPlus.',
  {
    ageRatingDeclarationId: z.string().describe('Age Rating Declaration ID (from asc_get_age_rating)'),
    alcoholTobaccoOrDrugUseOrReferences: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    contests: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    gamblingSimulated: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    horrorOrFearThemes: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    matureOrSuggestiveThemes: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    medicalOrTreatmentInformation: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    profanityOrCrudeHumor: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    sexualContentGraphicAndNudity: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    sexualContentOrNudity: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    violenceCartoonOrFantasy: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    violenceRealistic: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    violenceRealisticProlonged: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    gambling: z.boolean().optional(),
    unrestrictedWebAccess: z.boolean().optional(),
    seventeenPlus: z.boolean().optional(),
  },
  async ({ ageRatingDeclarationId, ...updates }) => {
    try {
      const result = await updateAgeRating(ageRatingDeclarationId, updates);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_manage_availability',
  'Manage app territory availability. Actions: get (list territories), remove_from_sale (remove specific territories), restore (re-enable territories).',
  {
    appId: z.string().describe('App ID'),
    action: z.enum(['get', 'remove_from_sale', 'restore']).describe('Action to perform'),
    territoryCodes: z.array(z.string()).optional().describe('Territory codes (e.g., ["US", "TR", "DE"]) — required for remove_from_sale, optional for restore'),
  },
  async ({ appId, action, territoryCodes }) => {
    try {
      const result = await manageAppAvailability(appId, action, territoryCodes);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_upload_review_attachment',
  'Upload an attachment (screenshot/video) for App Review. Useful when responding to rejections with evidence.',
  {
    versionId: z.string().describe('Version ID'),
    filePath: z.string().describe('Absolute path to the file on disk'),
    fileName: z.string().describe('File name (e.g., demo_walkthrough.png)'),
  },
  async ({ versionId, filePath, fileName }) => {
    try {
      const result = await uploadReviewAttachment(versionId, filePath, fileName);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// CERTIFICATES & DEVICES
// =============================================================================

server.tool(
  'asc_list_certificates',
  'List signing certificates with expiration dates. Warns about certificates expiring within 30 days.',
  {
    certificateType: z.enum([
      'IOS_DEVELOPMENT', 'IOS_DISTRIBUTION', 'MAC_APP_DISTRIBUTION',
      'MAC_INSTALLER_DISTRIBUTION', 'MAC_APP_DEVELOPMENT', 'DEVELOPER_ID_KEXT',
      'DEVELOPER_ID_APPLICATION', 'DEVELOPMENT', 'DISTRIBUTION',
    ]).optional().describe('Filter by certificate type'),
  },
  async ({ certificateType }) => {
    try {
      const result = await listCertificates(certificateType);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_register_device',
  'Register a new test device for development/ad-hoc provisioning.',
  {
    name: z.string().describe('Device name (e.g., "Mali iPhone 15")'),
    udid: z.string().describe('Device UDID'),
    platform: z.enum(['IOS', 'MAC_OS']).default('IOS').describe('Platform'),
  },
  async ({ name, udid, platform }) => {
    try {
      const result = await registerDevice(name, udid, platform);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_list_devices',
  'List all registered test devices.',
  {
    platform: z.enum(['IOS', 'MAC_OS']).optional().describe('Filter by platform'),
  },
  async ({ platform }) => {
    try {
      const result = await listDevices(platform);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// BETA REVIEW
// =============================================================================

server.tool(
  'asc_submit_for_beta_review',
  'Submit a build for external TestFlight beta review. Required before external testers can access the build.',
  { buildId: z.string().describe('Build ID') },
  async ({ buildId }) => {
    try {
      const result = await submitForBetaReview(buildId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_get_beta_review_status',
  'Check the beta review status for a build (external TestFlight review).',
  { buildId: z.string().describe('Build ID') },
  async ({ buildId }) => {
    try {
      const result = await getBetaReviewStatus(buildId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// SANDBOX TESTERS
// =============================================================================

server.tool(
  'asc_list_sandbox_testers',
  'List sandbox testers for in-app purchase testing.',
  {},
  async () => {
    try {
      const result = await listSandboxTesters();
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_clear_sandbox_history',
  'Clear purchase history for a sandbox tester. Useful for re-testing IAP flows.',
  { testerId: z.string().describe('Sandbox tester ID (from asc_list_sandbox_testers)') },
  async ({ testerId }) => {
    try {
      const result = await clearSandboxTesterHistory(testerId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// IN-APP EVENTS
// =============================================================================

server.tool(
  'asc_list_app_events',
  'List in-app events for an app (promotions, live events, challenges, etc.) with localizations.',
  { appId: z.string().describe('App ID') },
  async ({ appId }) => {
    try {
      const result = await listAppEvents(appId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_create_app_event',
  'Create a new in-app event (promotion, live event, challenge, etc.) for the App Store.',
  {
    appId: z.string().describe('App ID'),
    referenceName: z.string().describe('Internal reference name'),
    deepLink: z.string().describe('Deep link URL that opens to this event in the app'),
    purpose: z.enum(['APPROPRIATE_FOR_ALL_USERS', 'LIVE_EVENT', 'PREMIERE', 'CHALLENGE', 'COMPETITION', 'NEW_SEASON', 'MAJOR_UPDATE', 'SPECIAL_EVENT']).describe('Event purpose'),
    badge: z.enum(['LIVE_EVENT', 'PREMIERE', 'CHALLENGE', 'COMPETITION', 'NEW_SEASON', 'MAJOR_UPDATE', 'SPECIAL_EVENT']).describe('Event badge shown on App Store'),
    priority: z.enum(['HIGH', 'NORMAL']).default('NORMAL').describe('Event priority'),
    purchaseRequirement: z.enum(['NO_COST_ASSOCIATED', 'IN_APP_PURCHASE', 'SUBSCRIPTION', 'IN_APP_PURCHASE_AND_SUBSCRIPTION', 'IN_APP_PURCHASE_OR_SUBSCRIPTION']).describe('Purchase requirement'),
    territorySchedules: z.array(z.object({
      territories: z.array(z.string()),
      publishStart: z.string(),
      eventStart: z.string(),
      eventEnd: z.string(),
    })).describe('Territory schedules with dates'),
  },
  async ({ appId, referenceName, deepLink, purpose, badge, priority, purchaseRequirement, territorySchedules }) => {
    try {
      const result = await createAppEvent(appId, referenceName, deepLink, purpose, badge, priority, purchaseRequirement, territorySchedules);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// CUSTOM PRODUCT PAGES
// =============================================================================

server.tool(
  'asc_list_custom_product_pages',
  'List custom product pages for an app (alternate App Store listings for different audiences).',
  { appId: z.string().describe('App ID') },
  async ({ appId }) => {
    try {
      const result = await listCustomProductPages(appId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// SCREENSHOT SETS & APP PREVIEWS
// =============================================================================

server.tool(
  'asc_create_screenshot_set',
  'Create a new screenshot set for a specific device type (e.g., iPhone 6.7", iPad Pro 12.9").',
  {
    versionLocalizationId: z.string().describe('Version Localization ID'),
    displayType: z.enum([
      'APP_IPHONE_67', 'APP_IPHONE_61', 'APP_IPHONE_65', 'APP_IPHONE_58',
      'APP_IPHONE_55', 'APP_IPHONE_47', 'APP_IPAD_PRO_3GEN_129',
      'APP_IPAD_PRO_3GEN_11', 'APP_IPAD_PRO_129', 'APP_IPAD_105',
    ]).describe('Screenshot display type (device size)'),
  },
  async ({ versionLocalizationId, displayType }) => {
    try {
      const result = await createScreenshotSet(versionLocalizationId, displayType);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_reorder_screenshots',
  'Reorder screenshots within a screenshot set. Provide screenshot IDs in desired order.',
  {
    screenshotSetId: z.string().describe('Screenshot Set ID'),
    screenshotIds: z.array(z.string()).describe('Ordered array of screenshot IDs'),
  },
  async ({ screenshotSetId, screenshotIds }) => {
    try {
      const result = await reorderScreenshots(screenshotSetId, screenshotIds);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_list_preview_sets',
  'List app preview (video) sets for a version localization.',
  { versionLocalizationId: z.string().describe('Version Localization ID') },
  async ({ versionLocalizationId }) => {
    try {
      const result = await listPreviewSets(versionLocalizationId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_create_preview_set',
  'Create a new app preview (video) set for a device type.',
  {
    versionLocalizationId: z.string().describe('Version Localization ID'),
    previewType: z.string().describe('Preview type (same device types as screenshot sets, e.g., APP_IPHONE_67)'),
  },
  async ({ versionLocalizationId, previewType }) => {
    try {
      const result = await createPreviewSet(versionLocalizationId, previewType);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_upload_app_preview',
  'Upload an app preview video (MP4/MOV/M4V). Handles 3-step upload process.',
  {
    previewSetId: z.string().describe('Preview Set ID'),
    filePath: z.string().describe('Absolute path to the video file'),
    fileName: z.string().describe('File name (e.g., preview_home.mp4)'),
    mimeType: z.string().optional().describe('MIME type (auto-detected from extension if not provided)'),
  },
  async ({ previewSetId, filePath, fileName, mimeType }) => {
    try {
      const result = await uploadAppPreview(previewSetId, filePath, fileName, mimeType);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'asc_delete_app_preview',
  'Delete an app preview video.',
  { previewId: z.string().describe('Preview ID') },
  async ({ previewId }) => {
    try {
      const result = await deleteAppPreview(previewId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// START SERVER
// =============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ASC MCP Server running on stdio');

  // Graceful shutdown
  const shutdown = async () => {
    console.error('ASC MCP Server shutting down...');
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
