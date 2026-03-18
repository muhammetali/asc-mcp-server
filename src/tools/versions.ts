import { ascGet, ascPost, ascPatch, ascDelete, type ASCResponse } from '../client.js';
import { PROJECT_LOCALES, APP_STORE_STATES, RESOURCE_TYPES } from '../constants.js';
import { validateId, validateLocale, validateUrl } from '../validation.js';

export async function listVersions(appId: string, platform?: string): Promise<string> {
  validateId(appId, 'appId');

  const params: Record<string, string> = {
    'fields[appStoreVersions]': 'versionString,appStoreState,platform,releaseType,createdDate',
    'limit': '20',
  };

  if (platform) {
    params['filter[platform]'] = platform;
  }

  const result = await ascGet<ASCResponse>(`/v1/apps/${appId}/appStoreVersions`, params);

  if (!result.data || result.data.length === 0) {
    return `## App Store Versions\n\nNo versions found.${platform ? ` (filter: ${platform})` : ''}`;
  }

  let md = `## App Store Versions\n\n`;
  md += `| Version | Platform | State | Release Type | Created | Version ID |\n`;
  md += `|---------|----------|-------|-------------|----------|------------|\n`;

  for (const v of result.data) {
    const a = v.attributes;
    const created = a.createdDate ? new Date(a.createdDate).toLocaleDateString() : '-';
    const stateEmoji = getStateIndicator(a.appStoreState);
    md += `| ${a.versionString} | ${a.platform} | ${stateEmoji} ${a.appStoreState} | ${a.releaseType || 'MANUAL'} | ${created} | \`${v.id}\` |\n`;
  }

  // Summary
  const states = result.data.map((v: any) => v.attributes.appStoreState);
  const rejected = states.filter((s: string) => s === APP_STORE_STATES.REJECTED || s === APP_STORE_STATES.DEVELOPER_REJECTED);
  const inReview = states.filter((s: string) => s === APP_STORE_STATES.IN_REVIEW || s === APP_STORE_STATES.WAITING_FOR_REVIEW);

  if (rejected.length > 0) {
    md += `\n> **ATTENTION:** ${rejected.length} rejected version(s) found. Use \`asc_get_review_submission\` to see rejection details.\n`;
  }
  if (inReview.length > 0) {
    md += `\n> **In Review:** ${inReview.length} version(s) currently in review process.\n`;
  }

  return md;
}

export async function createVersion(
  appId: string,
  versionString: string,
  platform: string = 'IOS',
  releaseType: string = 'MANUAL'
): Promise<string> {
  validateId(appId, 'appId');

  const body = {
    data: {
      type: 'appStoreVersions',
      attributes: {
        versionString,
        platform,
        releaseType,
      },
      relationships: {
        app: {
          data: { type: 'apps', id: appId },
        },
      },
    },
  };

  const result = await ascPost<ASCResponse>('/v1/appStoreVersions', body);
  const v = result.data;

  let md = `## Version Created\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Version** | ${v.attributes.versionString} |\n`;
  md += `| **Platform** | ${v.attributes.platform} |\n`;
  md += `| **State** | ${v.attributes.appStoreState} |\n`;
  md += `| **Release Type** | ${v.attributes.releaseType} |\n`;
  md += `| **Version ID** | ${v.id} |\n`;
  md += `\n**Next steps:**\n`;
  md += `1. Use \`asc_update_whats_new\` to set release notes for all locales\n`;
  md += `2. Use \`asc_list_builds\` to find the build to attach\n`;
  md += `3. Use \`asc_assign_build\` to attach a build\n`;
  md += `4. Use \`asc_submit_for_review\` when ready\n`;

  return md;
}

export async function updateWhatsNew(
  versionId: string,
  whatsNew: Record<string, string>
): Promise<string> {
  validateId(versionId, 'versionId');

  // Get existing localizations for this version
  const result = await ascGet<ASCResponse>(`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`, {
    'fields[appStoreVersionLocalizations]': 'locale,whatsNew,description,keywords,promotionalText',
  });

  const existing: any[] = result.data || [];
  const existingMap = new Map<string, any>(existing.map((l: any) => [l.attributes.locale, l]));

  let md = `## What's New Updated\n\n`;
  md += `| Locale | Status | Text (preview) |\n`;
  md += `|--------|--------|----------------|\n`;

  for (const [locale, text] of Object.entries(whatsNew)) {
    const existingLoc = existingMap.get(locale);
    const preview = text.length > 60 ? text.slice(0, 60) + '...' : text;

    if (existingLoc) {
      // Update existing
      await ascPatch(`/v1/appStoreVersionLocalizations/${existingLoc.id}`, {
        data: {
          type: 'appStoreVersionLocalizations',
          id: existingLoc.id,
          attributes: { whatsNew: text },
        },
      });
      md += `| ${locale} | Updated | ${preview} |\n`;
    } else {
      // Create new localization
      await ascPost('/v1/appStoreVersionLocalizations', {
        data: {
          type: 'appStoreVersionLocalizations',
          attributes: { locale, whatsNew: text },
          relationships: {
            appStoreVersion: {
              data: { type: 'appStoreVersions', id: versionId },
            },
          },
        },
      });
      md += `| ${locale} | Created | ${preview} |\n`;
    }
  }

  // Check for missing locales
  const updatedLocales = Object.keys(whatsNew);
  const missingLocales = PROJECT_LOCALES.filter(l => !updatedLocales.includes(l));
  if (missingLocales.length > 0) {
    md += `\n> **Warning:** What's New not set for: ${missingLocales.join(', ')}\n`;
  }

  return md;
}

export async function updateVersionLocalization(
  versionId: string,
  locale: string,
  updates: {
    whatsNew?: string;
    description?: string;
    keywords?: string;
    promotionalText?: string;
    marketingUrl?: string;
    supportUrl?: string;
  }
): Promise<string> {
  validateId(versionId, 'versionId');
  validateLocale(locale);
  if (updates.marketingUrl) validateUrl(updates.marketingUrl, 'marketingUrl');
  if (updates.supportUrl) validateUrl(updates.supportUrl, 'supportUrl');

  // Get existing localizations for this version
  const result = await ascGet<ASCResponse>(`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`, {
    'fields[appStoreVersionLocalizations]': 'locale,whatsNew,description,keywords,promotionalText,marketingUrl,supportUrl',
  });

  const existing = result.data || [];
  const targetLoc = existing.find((l: any) => l.attributes.locale === locale);

  if (targetLoc) {
    await ascPatch(`/v1/appStoreVersionLocalizations/${targetLoc.id}`, {
      data: {
        type: 'appStoreVersionLocalizations',
        id: targetLoc.id,
        attributes: updates,
      },
    });
  } else {
    await ascPost('/v1/appStoreVersionLocalizations', {
      data: {
        type: 'appStoreVersionLocalizations',
        attributes: { locale, ...updates },
        relationships: {
          appStoreVersion: {
            data: { type: 'appStoreVersions', id: versionId },
          },
        },
      },
    });
  }

  let md = `## Version Localization Updated: ${locale}\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  for (const [key, value] of Object.entries(updates)) {
    if (value) {
      const preview = value.length > 80 ? value.slice(0, 80) + '...' : value;
      md += `| ${key} | ${preview} |\n`;
    }
  }
  md += `\n**Status:** ${targetLoc ? 'Updated' : 'Created'} successfully`;

  return md;
}

export async function getVersionLocalizations(versionId: string): Promise<string> {
  validateId(versionId, 'versionId');

  const result = await ascGet<ASCResponse>(`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`, {
    'fields[appStoreVersionLocalizations]': 'locale,whatsNew,description,keywords,promotionalText,marketingUrl,supportUrl',
  });

  const locs = result.data || [];

  if (locs.length === 0) {
    return `## Version Localizations\n\nNo localizations found for version \`${versionId}\`.`;
  }

  let md = `## Version Localizations (${locs.length} locales)\n\n`;

  for (const loc of locs) {
    const a = loc.attributes;
    md += `### ${a.locale}\n\n`;
    md += `| Field | Value |\n`;
    md += `|-------|-------|\n`;
    md += `| **What's New** | ${a.whatsNew ? (a.whatsNew.length > 100 ? a.whatsNew.slice(0, 100) + '...' : a.whatsNew) : '**EMPTY**'} |\n`;
    md += `| **Description** | ${a.description ? `${a.description.length} chars` : '**EMPTY**'} |\n`;
    md += `| **Keywords** | ${a.keywords || '**EMPTY**'} |\n`;
    md += `| **Promotional Text** | ${a.promotionalText || '-'} |\n`;
    md += `| **Marketing URL** | ${a.marketingUrl || '-'} |\n`;
    md += `| **Support URL** | ${a.supportUrl || '-'} |\n`;
    md += `\n`;
  }

  // Missing locales check
  const existingLocales = locs.map((l: any) => l.attributes.locale);
  const missingLocales = PROJECT_LOCALES.filter(l => !existingLocales.includes(l));
  if (missingLocales.length > 0) {
    md += `> **Warning:** Missing localizations: ${missingLocales.join(', ')}\n`;
  }

  // Empty fields warning
  const emptyWhatsNew = locs.filter((l: any) => !l.attributes.whatsNew);
  if (emptyWhatsNew.length > 0) {
    md += `> **Warning:** Empty What's New for: ${emptyWhatsNew.map((l: any) => l.attributes.locale).join(', ')}\n`;
  }

  return md;
}

export async function assignBuildToVersion(versionId: string, buildId: string): Promise<string> {
  validateId(versionId, 'versionId');
  validateId(buildId, 'buildId');

  await ascPatch(`/v1/appStoreVersions/${versionId}/relationships/build`, {
    data: {
      type: 'builds',
      id: buildId,
    },
  });

  return `## Build Assigned\n\n**Build** \`${buildId}\` assigned to **version** \`${versionId}\`.\n\nNext: Use \`asc_submit_for_review\` when ready.`;
}

export async function deleteVersion(versionId: string): Promise<string> {
  validateId(versionId, 'versionId');

  // Verify the version state first
  const versionResult = await ascGet<ASCResponse>(`/v1/appStoreVersions/${versionId}`, {
    'fields[appStoreVersions]': 'versionString,appStoreState,platform',
  });

  const va = versionResult.data.attributes;
  const deletableStates = [APP_STORE_STATES.PREPARE_FOR_SUBMISSION, APP_STORE_STATES.DEVELOPER_REJECTED, APP_STORE_STATES.REJECTED];

  if (!deletableStates.includes(va.appStoreState)) {
    throw new Error(`Version v${va.versionString} is in state \`${va.appStoreState}\`. Can only delete versions in PREPARE_FOR_SUBMISSION, DEVELOPER_REJECTED, or REJECTED state.`);
  }

  await ascDelete(`/v1/appStoreVersions/${versionId}`);

  let md = `## Version Deleted\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Version** | ${va.versionString} |\n`;
  md += `| **Platform** | ${va.platform} |\n`;
  md += `| **Previous State** | ${va.appStoreState} |\n`;
  md += `\n**Status:** Version deleted successfully.`;

  return md;
}

function getStateIndicator(state: string): string {
  switch (state) {
    case APP_STORE_STATES.READY_FOR_SALE: return '[LIVE]';
    case APP_STORE_STATES.PREPARE_FOR_SUBMISSION: return '[DRAFT]';
    case APP_STORE_STATES.WAITING_FOR_REVIEW: return '[WAITING]';
    case APP_STORE_STATES.IN_REVIEW: return '[REVIEW]';
    case APP_STORE_STATES.REJECTED: return '[REJECTED]';
    case APP_STORE_STATES.DEVELOPER_REJECTED: return '[DEV-REJECTED]';
    case APP_STORE_STATES.PENDING_DEVELOPER_RELEASE: return '[PENDING]';
    case APP_STORE_STATES.PROCESSING_FOR_APP_STORE: return '[PROCESSING]';
    case APP_STORE_STATES.DEVELOPER_REMOVED_FROM_SALE: return '[REMOVED]';
    case APP_STORE_STATES.REPLACED_WITH_NEW_VERSION: return '[REPLACED]';
    default: return `[${state}]`;
  }
}
