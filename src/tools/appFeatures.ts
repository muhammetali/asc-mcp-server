import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import { ascGet, ascPost, ascPatch, ascDelete, ascUploadChunk, type ASCResponse } from '../client.js';
import { validateId } from '../validation.js';

export async function listSandboxTesters(): Promise<string> {
  const result = await ascGet<ASCResponse>('/v2/sandboxTesters', {
    'fields[sandboxTesters]': 'firstName,lastName,email,territory,acAccountName',
  });

  if (!result.data || result.data.length === 0) {
    return `## Sandbox Testers\n\nNo sandbox testers found.`;
  }

  let md = `## Sandbox Testers\n\n`;
  md += `| # | First Name | Last Name | Email | Territory | Account Name |\n`;
  md += `|---|------------|-----------|-------|-----------|-------------|\n`;

  for (let i = 0; i < result.data.length; i++) {
    const t = result.data[i].attributes;
    md += `| ${i + 1} | ${t.firstName || '-'} | ${t.lastName || '-'} | ${t.email || '-'} | ${t.territory || '-'} | ${t.acAccountName || '-'} |\n`;
  }

  md += `\n**Total:** ${result.data.length} tester(s)`;
  return md;
}

export async function clearSandboxTesterHistory(testerId: string): Promise<string> {
  validateId(testerId, 'testerId');

  // Apple's real resource is v2 + SINGULAR ("Request", not "Requests") —
  // both the path and the `type` string. Verified against Apple's official
  // OpenAPI spec (SandboxTestersClearPurchaseHistoryRequestV2CreateRequest)
  // after the old v1-plural version 404'd/400'd live. The relationship is
  // also plural (`sandboxTesters`, an array) even though this function only
  // ever clears one — Apple's create request supports batching, we just
  // don't expose that from this single-tester tool.
  await ascPost('/v2/sandboxTestersClearPurchaseHistoryRequest', {
    data: {
      type: 'sandboxTestersClearPurchaseHistoryRequest',
      relationships: {
        sandboxTesters: {
          data: [{ type: 'sandboxTesters', id: testerId }],
        },
      },
    },
  });

  return `**Success:** Purchase history cleared for sandbox tester \`${testerId}\`.`;
}

export async function listAppEvents(appId: string): Promise<string> {
  validateId(appId, 'appId');

  const result = await ascGet<ASCResponse>(`/v1/apps/${appId}/appEvents`, {
    'fields[appEvents]': 'referenceName,badge,eventState,deepLink,purchaseRequirement,priority,purpose',
    'include': 'appEventLocalizations',
    'fields[appEventLocalizations]': 'locale,name,shortDescription,longDescription',
  });

  if (!result.data || result.data.length === 0) {
    return `## App Events\n\nNo app events found for app \`${appId}\`.`;
  }

  const localizations = (result.included || []).filter((i: any) => i.type === 'appEventLocalizations');
  const locMap = new Map<string, any[]>();
  for (const loc of localizations) {
    for (const event of result.data) {
      const eventLocs = event.relationships?.appEventLocalizations?.data || [];
      if (eventLocs.some((l: any) => l.id === loc.id)) {
        if (!locMap.has(event.id)) locMap.set(event.id, []);
        locMap.get(event.id)!.push(loc);
      }
    }
  }

  let md = `## App Events\n\n`;

  for (const event of result.data) {
    const ea = event.attributes;
    md += `### ${ea.referenceName}\n\n`;
    md += `| Field | Value |\n`;
    md += `|-------|-------|\n`;
    md += `| **Event ID** | ${event.id} |\n`;
    md += `| **Badge** | ${ea.badge || '-'} |\n`;
    md += `| **State** | ${ea.eventState || '-'} |\n`;
    md += `| **Deep Link** | ${ea.deepLink || '-'} |\n`;
    md += `| **Purchase Requirement** | ${ea.purchaseRequirement || '-'} |\n`;
    md += `| **Priority** | ${ea.priority || '-'} |\n`;
    md += `| **Purpose** | ${ea.purpose || '-'} |\n`;

    const eventLocs = locMap.get(event.id) || [];
    if (eventLocs.length > 0) {
      md += `\n**Localizations:**\n\n`;
      md += `| Locale | Name | Short Description | Long Description |\n`;
      md += `|--------|------|-------------------|------------------|\n`;
      for (const loc of eventLocs) {
        const la = loc.attributes;
        md += `| ${la.locale} | ${la.name || '-'} | ${la.shortDescription || '-'} | ${la.longDescription ? la.longDescription.substring(0, 50) + '...' : '-'} |\n`;
      }
    }

    md += `\n`;
  }

  md += `**Total:** ${result.data.length} event(s)`;
  return md;
}

export async function createAppEvent(
  appId: string,
  referenceName: string,
  deepLink: string,
  purpose: string,
  badge: string,
  priority: string,
  purchaseRequirement: string,
  territorySchedules: Array<{ territories: string[]; publishStart: string; eventStart: string; eventEnd: string }>
): Promise<string> {
  validateId(appId, 'appId');

  const validPurposes = ['APPROPRIATE_FOR_ALL_USERS', 'LIVE_EVENT', 'PREMIERE', 'CHALLENGE', 'COMPETITION', 'NEW_SEASON', 'MAJOR_UPDATE', 'SPECIAL_EVENT'];
  if (!validPurposes.includes(purpose)) {
    throw new Error(`Invalid purpose: "${purpose}". Must be one of: ${validPurposes.join(', ')}`);
  }

  const validBadges = ['LIVE_EVENT', 'PREMIERE', 'CHALLENGE', 'COMPETITION', 'NEW_SEASON', 'MAJOR_UPDATE', 'SPECIAL_EVENT'];
  if (!validBadges.includes(badge)) {
    throw new Error(`Invalid badge: "${badge}". Must be one of: ${validBadges.join(', ')}`);
  }

  const validPriorities = ['HIGH', 'NORMAL'];
  if (!validPriorities.includes(priority)) {
    throw new Error(`Invalid priority: "${priority}". Must be one of: ${validPriorities.join(', ')}`);
  }

  const validPurchaseReqs = ['NO_COST_ASSOCIATED', 'IN_APP_PURCHASE', 'SUBSCRIPTION', 'IN_APP_PURCHASE_AND_SUBSCRIPTION', 'IN_APP_PURCHASE_OR_SUBSCRIPTION'];
  if (!validPurchaseReqs.includes(purchaseRequirement)) {
    throw new Error(`Invalid purchaseRequirement: "${purchaseRequirement}". Must be one of: ${validPurchaseReqs.join(', ')}`);
  }

  const result = await ascPost<ASCResponse>('/v1/appEvents', {
    data: {
      type: 'appEvents',
      attributes: {
        referenceName,
        deepLink,
        purpose,
        badge,
        priority,
        purchaseRequirement,
        territorySchedules,
      },
      relationships: {
        app: {
          data: { type: 'apps', id: appId },
        },
      },
    },
  });

  const event = result.data;
  const ea = event.attributes;

  let md = `## App Event Created\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Event ID** | ${event.id} |\n`;
  md += `| **Reference Name** | ${ea.referenceName} |\n`;
  md += `| **Badge** | ${ea.badge} |\n`;
  md += `| **Purpose** | ${ea.purpose} |\n`;
  md += `| **Priority** | ${ea.priority} |\n`;
  md += `| **Purchase Requirement** | ${ea.purchaseRequirement} |\n`;
  md += `| **Deep Link** | ${ea.deepLink} |\n`;

  if (territorySchedules.length > 0) {
    md += `\n**Territory Schedules:** ${territorySchedules.length} schedule(s) configured\n`;
  }

  md += `\n**Status:** App event created successfully.`;
  return md;
}

export async function listCustomProductPages(appId: string): Promise<string> {
  validateId(appId, 'appId');

  const result = await ascGet<ASCResponse>(`/v1/apps/${appId}/appCustomProductPages`, {
    'fields[appCustomProductPages]': 'name,url,visible',
  });

  if (!result.data || result.data.length === 0) {
    return `## Custom Product Pages\n\nNo custom product pages found for app \`${appId}\`.`;
  }

  let md = `## Custom Product Pages\n\n`;
  md += `| # | Name | URL | Visible | ID |\n`;
  md += `|---|------|-----|---------|----|\n`;

  for (let i = 0; i < result.data.length; i++) {
    const page = result.data[i];
    const pa = page.attributes;
    md += `| ${i + 1} | ${pa.name || '-'} | ${pa.url || '-'} | ${pa.visible ? 'Yes' : 'No'} | ${page.id} |\n`;
  }

  md += `\n**Total:** ${result.data.length} custom product page(s)`;
  return md;
}

export async function createScreenshotSet(
  versionLocalizationId: string,
  displayType: string
): Promise<string> {
  validateId(versionLocalizationId, 'versionLocalizationId');

  const validDisplayTypes = [
    'APP_IPHONE_67', 'APP_IPHONE_61', 'APP_IPHONE_65', 'APP_IPHONE_58',
    'APP_IPHONE_55', 'APP_IPHONE_47', 'APP_IPAD_PRO_3GEN_129',
    'APP_IPAD_PRO_3GEN_11', 'APP_IPAD_PRO_129', 'APP_IPAD_105',
  ];
  if (!validDisplayTypes.includes(displayType)) {
    throw new Error(`Invalid displayType: "${displayType}". Must be one of: ${validDisplayTypes.join(', ')}`);
  }

  const result = await ascPost<ASCResponse>('/v1/appScreenshotSets', {
    data: {
      type: 'appScreenshotSets',
      attributes: {
        screenshotDisplayType: displayType,
      },
      relationships: {
        appStoreVersionLocalization: {
          data: { type: 'appStoreVersionLocalizations', id: versionLocalizationId },
        },
      },
    },
  });

  const set = result.data;

  let md = `## Screenshot Set Created\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Set ID** | ${set.id} |\n`;
  md += `| **Display Type** | ${set.attributes.screenshotDisplayType} |\n`;
  md += `| **Localization ID** | ${versionLocalizationId} |\n`;
  md += `\n**Status:** Screenshot set created successfully. Use \`asc_upload_screenshot\` to add screenshots.`;

  return md;
}

export async function reorderScreenshots(
  screenshotSetId: string,
  screenshotIds: string[]
): Promise<string> {
  validateId(screenshotSetId, 'screenshotSetId');

  if (!screenshotIds || screenshotIds.length === 0) {
    throw new Error('screenshotIds must be a non-empty array.');
  }

  for (let i = 0; i < screenshotIds.length; i++) {
    validateId(screenshotIds[i], `screenshotIds[${i}]`);
  }

  await ascPatch(`/v1/appScreenshotSets/${screenshotSetId}/relationships/appScreenshots`, {
    data: screenshotIds.map(id => ({
      type: 'appScreenshots',
      id,
    })),
  });

  let md = `## Screenshots Reordered\n\n`;
  md += `**Set ID:** \`${screenshotSetId}\`\n\n`;
  md += `**New order:**\n`;
  for (let i = 0; i < screenshotIds.length; i++) {
    md += `${i + 1}. \`${screenshotIds[i]}\`\n`;
  }
  md += `\n**Status:** Screenshots reordered successfully.`;

  return md;
}

export async function uploadAppPreview(
  previewSetId: string,
  filePath: string,
  fileName: string,
  mimeType?: string
): Promise<string> {
  validateId(previewSetId, 'previewSetId');

  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }
  if (!resolvedPath.match(/\.(mp4|mov|m4v)$/i)) {
    throw new Error(`Invalid file type. Only MP4, MOV, and M4V previews are supported: ${resolvedPath}`);
  }

  const fileData = readFileSync(resolvedPath);
  const fileSize = fileData.length;
  const checksum = createHash('md5').update(fileData).digest('hex');
  const resolvedMimeType = mimeType || (resolvedPath.match(/\.mov$/i) ? 'video/quicktime' : 'video/mp4');

  let md = `## App Preview Upload: ${fileName}\n\n`;

  // Step 1: Reserve
  md += `1. Reserving upload slot...\n`;
  const reserveResult = await ascPost<ASCResponse>('/v1/appPreviews', {
    data: {
      type: 'appPreviews',
      attributes: {
        fileName,
        fileSize,
        mimeType: resolvedMimeType,
      },
      relationships: {
        appPreviewSet: {
          data: { type: 'appPreviewSets', id: previewSetId },
        },
      },
    },
  });

  const previewId = reserveResult.data.id;
  const uploadOps = reserveResult.data.attributes.uploadOperations;
  md += `   Reserved. Preview ID: \`${previewId}\`\n`;

  // Step 2: Upload chunks
  md += `2. Uploading ${uploadOps.length} chunk(s) (${(fileSize / 1024 / 1024).toFixed(1)} MB)...\n`;
  for (let i = 0; i < uploadOps.length; i++) {
    const op = uploadOps[i];
    const chunk = fileData.subarray(op.offset, op.offset + op.length);
    const reqHeaders: Record<string, string> = {};
    for (const h of op.requestHeaders) {
      reqHeaders[h.name] = h.value;
    }
    await ascUploadChunk(op.url, chunk, reqHeaders);
    md += `   Chunk ${i + 1}/${uploadOps.length} uploaded.\n`;
  }

  // Step 3: Commit
  md += `3. Committing upload...\n`;
  await ascPatch(`/v1/appPreviews/${previewId}`, {
    data: {
      type: 'appPreviews',
      id: previewId,
      attributes: {
        uploaded: true,
        sourceFileChecksum: checksum,
      },
    },
  });

  md += `\n**Status:** Upload complete!\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **File** | ${fileName} |\n`;
  md += `| **Size** | ${(fileSize / 1024 / 1024).toFixed(1)} MB |\n`;
  md += `| **MIME Type** | ${resolvedMimeType} |\n`;
  md += `| **Checksum** | ${checksum} |\n`;
  md += `| **Preview ID** | ${previewId} |\n`;

  return md;
}

export async function deleteAppPreview(previewId: string): Promise<string> {
  validateId(previewId, 'previewId');

  await ascDelete(`/v1/appPreviews/${previewId}`);
  return `**Deleted** app preview \`${previewId}\``;
}

export async function createPreviewSet(
  versionLocalizationId: string,
  previewType: string
): Promise<string> {
  validateId(versionLocalizationId, 'versionLocalizationId');

  const result = await ascPost<ASCResponse>('/v1/appPreviewSets', {
    data: {
      type: 'appPreviewSets',
      attributes: {
        previewType,
      },
      relationships: {
        appStoreVersionLocalization: {
          data: { type: 'appStoreVersionLocalizations', id: versionLocalizationId },
        },
      },
    },
  });

  const set = result.data;

  let md = `## Preview Set Created\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Set ID** | ${set.id} |\n`;
  md += `| **Preview Type** | ${set.attributes.previewType} |\n`;
  md += `| **Localization ID** | ${versionLocalizationId} |\n`;
  md += `\n**Status:** Preview set created successfully. Use \`uploadAppPreview\` to add previews.`;

  return md;
}

export async function listPreviewSets(versionLocalizationId: string): Promise<string> {
  validateId(versionLocalizationId, 'versionLocalizationId');

  const result = await ascGet<ASCResponse>(
    `/v1/appStoreVersionLocalizations/${versionLocalizationId}/appPreviewSets`,
    {
      'include': 'appPreviews',
      'fields[appPreviewSets]': 'previewType',
      'fields[appPreviews]': 'fileName,fileSize,mimeType,assetDeliveryState,previewFrameTimeCode',
    }
  );

  if (!result.data || result.data.length === 0) {
    return `## Preview Sets\n\nNo preview sets found for localization \`${versionLocalizationId}\`.`;
  }

  const previews = (result.included || []).filter((i: any) => i.type === 'appPreviews');
  const previewMap = new Map<string, any[]>();
  for (const preview of previews) {
    for (const set of result.data) {
      const setPreviews = set.relationships?.appPreviews?.data || [];
      if (setPreviews.some((p: any) => p.id === preview.id)) {
        if (!previewMap.has(set.id)) previewMap.set(set.id, []);
        previewMap.get(set.id)!.push(preview);
      }
    }
  }

  let md = `## Preview Sets\n\n`;

  for (const set of result.data) {
    const previewType = set.attributes.previewType;
    const setPreviews = previewMap.get(set.id) || [];
    md += `### ${previewType}\n`;
    md += `**Set ID:** \`${set.id}\`\n\n`;

    if (setPreviews.length === 0) {
      md += `No previews uploaded.\n\n`;
    } else {
      md += `| # | File Name | Size | MIME Type | State |\n`;
      md += `|---|-----------|------|-----------|-------|\n`;
      for (let i = 0; i < setPreviews.length; i++) {
        const p = setPreviews[i];
        const pa = p.attributes;
        const sizeMB = pa.fileSize ? `${(pa.fileSize / 1024 / 1024).toFixed(1)} MB` : '-';
        const state = pa.assetDeliveryState?.state || '-';
        md += `| ${i + 1} | ${pa.fileName} | ${sizeMB} | ${pa.mimeType || '-'} | ${state} |\n`;
      }
      md += `\n`;
    }
  }

  return md;
}
