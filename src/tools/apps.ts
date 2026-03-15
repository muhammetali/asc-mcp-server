import { ascGet, ascPost, ascPatch, type ASCResponse } from '../client.js';
import { PROJECT_LOCALES } from '../constants.js';

export async function listApps(): Promise<string> {
  const result = await ascGet<ASCResponse>('/v1/apps', {
    'fields[apps]': 'name,bundleId,sku,primaryLocale,contentRightsDeclaration,isOrEverWasMadeForKids',
    'limit': '200',
  });

  if (!result.data || result.data.length === 0) {
    return '## Apps\n\nNo apps found in this App Store Connect account.';
  }

  let md = '## App Store Connect - Apps\n\n';
  md += '| App Name | Bundle ID | SKU | Primary Locale | App ID |\n';
  md += '|----------|-----------|-----|----------------|--------|\n';

  for (const app of result.data) {
    const a = app.attributes;
    md += `| ${a.name} | ${a.bundleId} | ${a.sku || '-'} | ${a.primaryLocale} | ${app.id} |\n`;
  }

  md += `\n**Total:** ${result.data.length} app(s)`;
  return md;
}

export async function getAppInfo(appId: string): Promise<string> {
  // Fetch app info with included app info localizations
  const [appResult, infoResult] = await Promise.all([
    ascGet<ASCResponse>(`/v1/apps/${appId}`, {
      'fields[apps]': 'name,bundleId,sku,primaryLocale,contentRightsDeclaration,isOrEverWasMadeForKids',
      'include': 'appStoreVersions',
      'fields[appStoreVersions]': 'versionString,appStoreState,platform,releaseType,createdDate',
    }),
    ascGet<ASCResponse>(`/v1/apps/${appId}/appInfos`, {
      'include': 'appInfoLocalizations',
      'fields[appInfos]': 'appStoreState,appStoreAgeRating,brazilAgeRating,brazilAgeRatingV2,kidsAgeBand',
      'fields[appInfoLocalizations]': 'locale,name,subtitle,privacyPolicyUrl,privacyChoicesUrl,privacyPolicyText',
    }),
  ]);

  const app = appResult.data;
  const a = app.attributes;

  let md = `## App Info: ${a.name}\n\n`;
  md += '### General\n\n';
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **App ID** | ${app.id} |\n`;
  md += `| **Bundle ID** | ${a.bundleId} |\n`;
  md += `| **SKU** | ${a.sku || '-'} |\n`;
  md += `| **Primary Locale** | ${a.primaryLocale} |\n`;
  md += `| **Content Rights** | ${a.contentRightsDeclaration || '-'} |\n`;
  md += `| **Made for Kids** | ${a.isOrEverWasMadeForKids ? 'Yes' : 'No'} |\n`;

  // App Info (age rating, etc.)
  if (infoResult.data && infoResult.data.length > 0) {
    const info = infoResult.data[0];
    const ia = info.attributes;
    md += `\n### Age Rating & Classification\n\n`;
    md += `| Field | Value |\n`;
    md += `|-------|-------|\n`;
    md += `| **App Store State** | ${ia.appStoreState || '-'} |\n`;
    md += `| **Age Rating** | ${ia.appStoreAgeRating || '-'} |\n`;
  }

  // Localizations (privacy policy etc.)
  const localizations = infoResult.included?.filter((i: any) => i.type === 'appInfoLocalizations') || [];
  if (localizations.length > 0) {
    md += `\n### Localizations (Privacy Policy & Metadata)\n\n`;
    md += `| Locale | Name | Subtitle | Privacy Policy URL | Privacy Choices URL |\n`;
    md += `|--------|------|----------|--------------------|---------------------|\n`;
    for (const loc of localizations) {
      const la = loc.attributes;
      md += `| ${la.locale} | ${la.name || '-'} | ${la.subtitle || '-'} | ${la.privacyPolicyUrl || '**MISSING**'} | ${la.privacyChoicesUrl || '-'} |\n`;
    }

    // Check for missing locales
    const existingLocales = localizations.map((l: any) => l.attributes.locale);
    const missingLocales = PROJECT_LOCALES.filter(l => !existingLocales.includes(l));
    if (missingLocales.length > 0) {
      md += `\n> **Warning:** Missing localizations for: ${missingLocales.join(', ')}\n`;
    }

    // Check for missing privacy policy
    const missingPrivacy = localizations.filter((l: any) => !l.attributes.privacyPolicyUrl);
    if (missingPrivacy.length > 0) {
      md += `\n> **CRITICAL:** Privacy Policy URL missing for: ${missingPrivacy.map((l: any) => l.attributes.locale).join(', ')}\n`;
      md += `> This WILL cause App Store rejection!\n`;
    }
  }

  // Recent versions
  const versions = appResult.included?.filter((i: any) => i.type === 'appStoreVersions') || [];
  if (versions.length > 0) {
    md += `\n### Recent Versions\n\n`;
    md += `| Version | Platform | State | Created |\n`;
    md += `|---------|----------|-------|---------|\n`;
    for (const v of versions.slice(0, 10)) {
      const va = v.attributes;
      const created = va.createdDate ? new Date(va.createdDate).toLocaleDateString() : '-';
      md += `| ${va.versionString} | ${va.platform} | ${va.appStoreState} | ${created} |\n`;
    }
  }

  return md;
}

export async function updateAppInfoLocalization(
  appId: string,
  locale: string,
  updates: {
    privacyPolicyUrl?: string;
    privacyChoicesUrl?: string;
    privacyPolicyText?: string;
    name?: string;
    subtitle?: string;
  }
): Promise<string> {
  // First find the app info and its localizations
  const infoResult = await ascGet<ASCResponse>(`/v1/apps/${appId}/appInfos`, {
    'include': 'appInfoLocalizations',
    'fields[appInfoLocalizations]': 'locale,name,subtitle,privacyPolicyUrl,privacyChoicesUrl,privacyPolicyText',
  });

  if (!infoResult.data || infoResult.data.length === 0) {
    return '**Error:** No app info found for this app.';
  }

  const appInfoId = infoResult.data[0].id;
  const localizations = infoResult.included?.filter((i: any) => i.type === 'appInfoLocalizations') || [];
  const targetLoc = localizations.find((l: any) => l.attributes.locale === locale);

  if (!targetLoc) {
    // Create new localization
    const createBody = {
      data: {
        type: 'appInfoLocalizations',
        attributes: {
          locale,
          ...updates,
        },
        relationships: {
          appInfo: {
            data: { type: 'appInfos', id: appInfoId },
          },
        },
      },
    };

    await ascPost<ASCResponse>(`/v1/appInfoLocalizations`, createBody);
    return `**Created** localization for locale \`${locale}\` with updated fields: ${Object.keys(updates).join(', ')}`;
  }

  // Update existing localization
  const patchBody = {
    data: {
      type: 'appInfoLocalizations',
      id: targetLoc.id,
      attributes: updates,
    },
  };

  await ascPatch(`/v1/appInfoLocalizations/${targetLoc.id}`, patchBody);

  let md = `## Updated App Info Localization: ${locale}\n\n`;
  md += `| Field | New Value |\n`;
  md += `|-------|----------|\n`;
  for (const [key, value] of Object.entries(updates)) {
    if (value) {
      md += `| ${key} | ${value} |\n`;
    }
  }
  md += `\n**Status:** Updated successfully`;

  return md;
}
