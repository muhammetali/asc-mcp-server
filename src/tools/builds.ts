import { ascGet, ascPost, ascPatch, type ASCResponse } from '../client.js';

export async function listBuilds(appId: string, limit: number = 10): Promise<string> {
  const result = await ascGet<ASCResponse>(`/v1/builds`, {
    'filter[app]': appId,
    'fields[builds]': 'version,uploadedDate,expirationDate,expired,minOsVersion,processingState,buildAudienceType,usesNonExemptEncryption,iconAssetToken',
    'include': 'preReleaseVersion,buildBetaDetail',
    'fields[preReleaseVersions]': 'version,platform',
    'fields[buildBetaDetails]': 'autoNotifyEnabled,internalBuildState,externalBuildState',
    'sort': '-uploadedDate',
    'limit': String(limit),
  });

  if (!result.data || result.data.length === 0) {
    return `## Builds\n\nNo builds found for app \`${appId}\`.`;
  }

  // Map preReleaseVersions by ID for lookup
  const preReleaseMap = new Map<string, any>();
  const betaDetailMap = new Map<string, any>();
  for (const inc of (result.included || [])) {
    if (inc.type === 'preReleaseVersions') preReleaseMap.set(inc.id, inc);
    if (inc.type === 'buildBetaDetails') betaDetailMap.set(inc.id, inc);
  }

  let md = `## Builds (Latest ${result.data.length})\n\n`;
  md += `| Build | App Version | Platform | Processing | Internal | External | Uploaded | Build ID |\n`;
  md += `|-------|-------------|----------|-----------|----------|----------|----------|----------|\n`;

  for (const build of result.data) {
    const a = build.attributes;
    const uploaded = a.uploadedDate ? new Date(a.uploadedDate).toLocaleDateString() : '-';

    // Get pre-release version info
    const prvId = build.relationships?.preReleaseVersion?.data?.id;
    const prv = prvId ? preReleaseMap.get(prvId) : null;
    const appVersion = prv?.attributes?.version || '-';
    const platform = prv?.attributes?.platform || '-';

    // Get beta detail
    const bdId = build.relationships?.buildBetaDetail?.data?.id;
    const bd = bdId ? betaDetailMap.get(bdId) : null;
    const internalState = bd?.attributes?.internalBuildState || '-';
    const externalState = bd?.attributes?.externalBuildState || '-';

    const processingIcon = getProcessingIcon(a.processingState);

    md += `| ${a.version} | ${appVersion} | ${platform} | ${processingIcon} ${a.processingState} | ${internalState} | ${externalState} | ${uploaded} | ${build.id} |\n`;
  }

  // Summary
  const processing = result.data.filter((b: any) => b.attributes.processingState === 'PROCESSING');
  const valid = result.data.filter((b: any) => b.attributes.processingState === 'VALID');
  const invalid = result.data.filter((b: any) => b.attributes.processingState === 'INVALID');

  md += `\n**Summary:** ${valid.length} valid, ${processing.length} processing, ${invalid.length} invalid\n`;

  if (processing.length > 0) {
    md += `\n> **Processing:** Build(s) ${processing.map((b: any) => b.attributes.version).join(', ')} still being processed by Apple.\n`;
  }

  return md;
}

export async function getBuildDetails(buildId: string): Promise<string> {
  const result = await ascGet<ASCResponse>(`/v1/builds/${buildId}`, {
    'fields[builds]': 'version,uploadedDate,expirationDate,expired,minOsVersion,processingState,buildAudienceType,usesNonExemptEncryption,computedMinMacOsVersion',
    'include': 'preReleaseVersion,buildBetaDetail,betaBuildLocalizations,icons,appEncryptionDeclaration',
    'fields[preReleaseVersions]': 'version,platform',
    'fields[buildBetaDetails]': 'autoNotifyEnabled,internalBuildState,externalBuildState',
    'fields[betaBuildLocalizations]': 'locale,whatsNew',
  });

  const build = result.data;
  const a = build.attributes;

  let md = `## Build Details: ${a.version}\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Build Number** | ${a.version} |\n`;
  md += `| **Processing State** | ${getProcessingIcon(a.processingState)} ${a.processingState} |\n`;
  md += `| **Uploaded** | ${a.uploadedDate ? new Date(a.uploadedDate).toLocaleString() : '-'} |\n`;
  md += `| **Expiration** | ${a.expirationDate ? new Date(a.expirationDate).toLocaleDateString() : '-'} |\n`;
  md += `| **Expired** | ${a.expired ? 'Yes' : 'No'} |\n`;
  md += `| **Min OS Version** | ${a.minOsVersion || '-'} |\n`;
  md += `| **Encryption** | ${a.usesNonExemptEncryption === null ? 'Not Set' : a.usesNonExemptEncryption ? 'Yes' : 'No'} |\n`;
  md += `| **Build ID** | ${build.id} |\n`;

  // Beta build localizations (TestFlight What's New)
  const betaLocs = (result.included || []).filter((i: any) => i.type === 'betaBuildLocalizations');
  if (betaLocs.length > 0) {
    md += `\n### TestFlight What's New\n\n`;
    md += `| Locale | Text |\n`;
    md += `|--------|------|\n`;
    for (const loc of betaLocs) {
      md += `| ${loc.attributes.locale} | ${loc.attributes.whatsNew || '-'} |\n`;
    }
  }

  return md;
}

export async function listBetaGroups(appId: string): Promise<string> {
  const result = await ascGet<ASCResponse>(`/v1/apps/${appId}/betaGroups`, {
    'fields[betaGroups]': 'name,isInternalGroup,publicLinkEnabled,publicLinkLimit,publicLinkLimitEnabled,createdDate,feedbackEnabled,hasAccessToAllBuilds',
  });

  if (!result.data || result.data.length === 0) {
    return `## Beta Groups\n\nNo beta groups found.`;
  }

  let md = `## TestFlight Beta Groups\n\n`;
  md += `| Group Name | Type | Public Link | Feedback | All Builds | Group ID |\n`;
  md += `|------------|------|-------------|----------|------------|----------|\n`;

  for (const group of result.data) {
    const a = group.attributes;
    const type = a.isInternalGroup ? 'Internal' : 'External';
    const publicLink = a.publicLinkEnabled ? 'Enabled' : 'Disabled';
    md += `| ${a.name} | ${type} | ${publicLink} | ${a.feedbackEnabled ? 'On' : 'Off'} | ${a.hasAccessToAllBuilds ? 'Yes' : 'No'} | ${group.id} |\n`;
  }

  return md;
}

export async function addBuildToBetaGroup(betaGroupId: string, buildId: string): Promise<string> {
  await ascPost(`/v1/betaGroups/${betaGroupId}/relationships/builds`, {
    data: [{ type: 'builds', id: buildId }],
  });

  return `## Build Added to Beta Group\n\n**Build** \`${buildId}\` added to **beta group** \`${betaGroupId}\`.\n\nTesters in this group will be notified.`;
}

export async function setBetaBuildLocalization(
  buildId: string,
  locale: string,
  whatsNew: string
): Promise<string> {
  // Check existing localizations
  const result = await ascGet<ASCResponse>(`/v1/builds/${buildId}/betaBuildLocalizations`, {
    'fields[betaBuildLocalizations]': 'locale,whatsNew',
  });

  const existing = result.data?.find((l: any) => l.attributes.locale === locale);

  if (existing) {
    await ascPatch(`/v1/betaBuildLocalizations/${existing.id}`, {
      data: {
        type: 'betaBuildLocalizations',
        id: existing.id,
        attributes: { whatsNew },
      },
    });
  } else {
    await ascPost('/v1/betaBuildLocalizations', {
      data: {
        type: 'betaBuildLocalizations',
        attributes: { locale, whatsNew },
        relationships: {
          build: {
            data: { type: 'builds', id: buildId },
          },
        },
      },
    });
  }

  return `## TestFlight What's New Updated\n\n**Build:** \`${buildId}\`\n**Locale:** ${locale}\n**Text:** ${whatsNew}`;
}

function getProcessingIcon(state: string): string {
  switch (state) {
    case 'VALID': return '[OK]';
    case 'PROCESSING': return '[...]';
    case 'INVALID': return '[FAIL]';
    case 'FAILED': return '[FAIL]';
    default: return `[${state}]`;
  }
}
