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
  assignBuildToVersion, deleteVersion,
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
    default:
      return '';
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
  'Submit a version for App Review. Runs pre-flight checks (build attached, descriptions filled, etc.) before submitting.',
  { versionId: z.string().describe('Version ID') },
  async ({ versionId }) => {
    try {
      const result = await submitForReview(versionId);
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
