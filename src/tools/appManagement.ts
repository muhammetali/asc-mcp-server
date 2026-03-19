import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import { ascGet, ascPost, ascPatch, ascUploadChunk, type ASCResponse } from '../client.js';
import { RESOURCE_TYPES } from '../constants.js';
import { validateId } from '../validation.js';

export async function getAgeRating(appId: string): Promise<string> {
  validateId(appId, 'appId');

  // Age ratings live at the app level, not version level.
  // Fetch via appInfos relationship which includes ageRatingDeclaration.
  const result = await ascGet<ASCResponse>(`/v1/apps/${appId}/appInfos`, {
    'include': 'ageRatingDeclaration',
  });

  const ageRating = (result.included || []).find((i: any) => i.type === 'ageRatingDeclarations');

  if (!ageRating) {
    return `## Age Rating Declaration\n\nNo age rating declaration found for app \`${appId}\`. This usually means the app info hasn't been fully set up yet.`;
  }

  const d = ageRating;
  const a = d.attributes;

  const bool = (v: any) => v !== undefined && v !== null ? String(v) : '-';
  const str = (v: any) => v || '-';

  let md = `## Age Rating Declaration\n\n`;
  md += `**Declaration ID:** \`${d.id}\`\n\n`;
  md += `### Content Descriptors\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Alcohol, Tobacco, or Drug Use** | ${str(a.alcoholTobaccoOrDrugUseOrReferences)} |\n`;
  md += `| **Contests** | ${str(a.contests)} |\n`;
  md += `| **Gambling (Real Money)** | ${bool(a.gambling)} |\n`;
  md += `| **Gambling (Simulated)** | ${str(a.gamblingSimulated)} |\n`;
  md += `| **Guns or Other Weapons** | ${str(a.gunsOrOtherWeapons)} |\n`;
  md += `| **Horror or Fear Themes** | ${str(a.horrorOrFearThemes)} |\n`;
  md += `| **Mature or Suggestive Themes** | ${str(a.matureOrSuggestiveThemes)} |\n`;
  md += `| **Medical or Treatment Information** | ${str(a.medicalOrTreatmentInformation)} |\n`;
  md += `| **Profanity or Crude Humor** | ${str(a.profanityOrCrudeHumor)} |\n`;
  md += `| **Sexual Content (Graphic & Nudity)** | ${str(a.sexualContentGraphicAndNudity)} |\n`;
  md += `| **Sexual Content or Nudity** | ${str(a.sexualContentOrNudity)} |\n`;
  md += `| **Violence (Cartoon or Fantasy)** | ${str(a.violenceCartoonOrFantasy)} |\n`;
  md += `| **Violence (Realistic)** | ${str(a.violenceRealistic)} |\n`;
  md += `| **Violence (Realistic, Prolonged)** | ${str(a.violenceRealisticProlongedGraphicOrSadistic)} |\n`;
  md += `\n### App Features\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Loot Box** | ${bool(a.lootBox)} |\n`;
  md += `| **Messaging and Chat** | ${bool(a.messagingAndChat)} |\n`;
  md += `| **User Generated Content** | ${bool(a.userGeneratedContent)} |\n`;
  md += `| **Unrestricted Web Access** | ${bool(a.unrestrictedWebAccess)} |\n`;
  md += `| **Advertising** | ${bool(a.advertising)} |\n`;
  md += `| **Parental Controls** | ${bool(a.parentalControls)} |\n`;
  md += `| **Health or Wellness Topics** | ${bool(a.healthOrWellnessTopics)} |\n`;
  md += `| **Age Assurance** | ${bool(a.ageAssurance)} |\n`;
  md += `\n### Overrides\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Kids Age Band** | ${str(a.kidsAgeBand)} |\n`;
  md += `| **Age Rating Override** | ${str(a.ageRatingOverride)} |\n`;
  md += `| **Korea Age Rating Override** | ${str(a.koreaAgeRatingOverride)} |\n`;

  return md;
}

export async function updateAgeRating(
  ageRatingDeclarationId: string,
  updates: {
    // Content descriptors (enum: NONE | INFREQUENT_OR_MILD | FREQUENT_OR_INTENSE)
    alcoholTobaccoOrDrugUseOrReferences?: string;
    contests?: string;
    gamblingSimulated?: string;
    gunsOrOtherWeapons?: string;
    horrorOrFearThemes?: string;
    matureOrSuggestiveThemes?: string;
    medicalOrTreatmentInformation?: string;
    profanityOrCrudeHumor?: string;
    sexualContentGraphicAndNudity?: string;
    sexualContentOrNudity?: string;
    violenceCartoonOrFantasy?: string;
    violenceRealistic?: string;
    violenceRealisticProlongedGraphicOrSadistic?: string;
    // Boolean flags
    gambling?: boolean;
    lootBox?: boolean;
    messagingAndChat?: boolean;
    userGeneratedContent?: boolean;
    unrestrictedWebAccess?: boolean;
    advertising?: boolean;
    parentalControls?: boolean;
    healthOrWellnessTopics?: boolean;
    ageAssurance?: boolean;
    // Override strings
    kidsAgeBand?: string;
    ageRatingOverride?: string;
    koreaAgeRatingOverride?: string;
  }
): Promise<string> {
  validateId(ageRatingDeclarationId, 'ageRatingDeclarationId');

  const result = await ascPatch<ASCResponse>(`/v1/ageRatingDeclarations/${ageRatingDeclarationId}`, {
    data: {
      type: 'ageRatingDeclarations',
      id: ageRatingDeclarationId,
      attributes: updates,
    },
  });

  const a = result.data.attributes;

  let md = `## Age Rating Updated\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      md += `| ${key} | ${String(value)} |\n`;
    }
  }
  md += `\n**Status:** Updated successfully`;

  return md;
}

export async function manageAppAvailability(
  appId: string,
  action: 'get' | 'remove_from_sale' | 'restore',
  territoryCodes?: string[]
): Promise<string> {
  validateId(appId, 'appId');

  if (action === 'get') {
    const result = await ascGet<ASCResponse>(`/v1/apps/${appId}/availableTerritories`, {
      'limit': '200',
    });

    if (!result.data || result.data.length === 0) {
      return `## App Availability\n\nNo available territories found for app \`${appId}\`.`;
    }

    const territories = result.data;
    let md = `## App Availability (${territories.length} territories)\n\n`;
    md += `| Territory Code |\n`;
    md += `|----------------|\n`;
    for (const t of territories) {
      md += `| ${t.id} |\n`;
    }

    return md;
  }

  if (action === 'remove_from_sale') {
    // First get current territories
    const currentResult = await ascGet<ASCResponse>(`/v1/apps/${appId}/availableTerritories`, {
      'limit': '200',
    });

    const currentTerritories = currentResult.data || [];
    const codesToRemove = territoryCodes || [];

    if (codesToRemove.length === 0) {
      throw new Error('territoryCodes is required for remove_from_sale action. Provide the territory codes to remove.');
    }

    // Build territory relationships excluding the given codes
    const remainingTerritories = currentTerritories
      .filter((t: any) => !codesToRemove.includes(t.id))
      .map((t: any) => ({ type: 'territories', id: t.id }));

    await ascPost<ASCResponse>('/v2/appAvailabilities', {
      data: {
        type: 'appAvailabilities',
        attributes: {
          availableInNewTerritories: false,
        },
        relationships: {
          app: {
            data: { type: 'apps', id: appId },
          },
          availableTerritories: {
            data: remainingTerritories,
          },
        },
      },
    });

    let md = `## App Availability Updated (Remove from Sale)\n\n`;
    md += `| Field | Value |\n`;
    md += `|-------|-------|\n`;
    md += `| **Removed Territories** | ${codesToRemove.join(', ')} |\n`;
    md += `| **Remaining Territories** | ${remainingTerritories.length} |\n`;
    md += `\n**Status:** Territories removed successfully.`;

    return md;
  }

  if (action === 'restore') {
    // Get all territories and include them all
    const currentResult = await ascGet<ASCResponse>(`/v1/apps/${appId}/availableTerritories`, {
      'limit': '200',
    });

    const currentTerritories = currentResult.data || [];
    const allTerritories = currentTerritories.map((t: any) => ({ type: 'territories', id: t.id }));

    // If specific territory codes provided, add those too
    if (territoryCodes && territoryCodes.length > 0) {
      const existingIds = new Set(allTerritories.map((t: any) => t.id));
      for (const code of territoryCodes) {
        if (!existingIds.has(code)) {
          allTerritories.push({ type: 'territories', id: code });
        }
      }
    }

    await ascPost<ASCResponse>('/v2/appAvailabilities', {
      data: {
        type: 'appAvailabilities',
        attributes: {
          availableInNewTerritories: true,
        },
        relationships: {
          app: {
            data: { type: 'apps', id: appId },
          },
          availableTerritories: {
            data: allTerritories,
          },
        },
      },
    });

    let md = `## App Availability Restored\n\n`;
    md += `| Field | Value |\n`;
    md += `|-------|-------|\n`;
    md += `| **Total Territories** | ${allTerritories.length} |\n`;
    md += `| **Available in New Territories** | Yes |\n`;
    md += `\n**Status:** App availability restored successfully.`;

    return md;
  }

  throw new Error(`Invalid action: "${action}". Must be "get", "remove_from_sale", or "restore".`);
}

export async function uploadReviewAttachment(
  versionId: string,
  filePath: string,
  fileName: string
): Promise<string> {
  validateId(versionId, 'versionId');

  // Path traversal protection: resolve to absolute and verify existence
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }
  if (!resolvedPath.match(/\.(png|jpg|jpeg|pdf|mp4|mov|m4v)$/i)) {
    throw new Error(`Invalid file type. Supported: PNG, JPEG, PDF, MP4, MOV, M4V. Got: ${resolvedPath}`);
  }

  // Get the appStoreReviewDetail for this version
  const versionResult = await ascGet<ASCResponse>(`/v1/appStoreVersions/${versionId}`, {
    'include': 'appStoreReviewDetail',
    'fields[appStoreReviewDetails]': 'notes',
  });

  const reviewDetail = (versionResult.included || []).find(
    (i: any) => i.type === RESOURCE_TYPES.APP_STORE_REVIEW_DETAILS
  );

  if (!reviewDetail) {
    throw new Error(
      `No review detail found for version \`${versionId}\`. Create one first using \`asc_update_review_detail\`.`
    );
  }

  // Read file
  const fileData = readFileSync(resolvedPath);
  const fileSize = fileData.length;
  const checksum = createHash('md5').update(fileData).digest('hex');

  let md = `## Review Attachment Upload: ${fileName}\n\n`;

  // Step 1: Reserve
  md += `1. Reserving upload slot...\n`;
  const reserveResult = await ascPost<ASCResponse>('/v1/appStoreReviewAttachments', {
    data: {
      type: 'appStoreReviewAttachments',
      attributes: {
        fileName,
        fileSize,
      },
      relationships: {
        appStoreReviewDetail: {
          data: { type: 'appStoreReviewDetails', id: reviewDetail.id },
        },
      },
    },
  });

  const attachmentId = reserveResult.data.id;
  const uploadOps = reserveResult.data.attributes.uploadOperations;
  md += `   Reserved. Attachment ID: \`${attachmentId}\`\n`;

  // Step 2: Upload chunks
  md += `2. Uploading ${uploadOps.length} chunk(s) (${(fileSize / 1024).toFixed(0)} KB)...\n`;
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
  await ascPatch(`/v1/appStoreReviewAttachments/${attachmentId}`, {
    data: {
      type: 'appStoreReviewAttachments',
      id: attachmentId,
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
  md += `| **Size** | ${(fileSize / 1024).toFixed(0)} KB |\n`;
  md += `| **Checksum** | ${checksum} |\n`;
  md += `| **Attachment ID** | ${attachmentId} |\n`;
  md += `| **Review Detail ID** | ${reviewDetail.id} |\n`;

  return md;
}

export async function listCertificates(certificateType?: string): Promise<string> {
  const params: Record<string, string> = {
    'fields[certificates]': 'displayName,certificateType,expirationDate,serialNumber',
    'limit': '200',
  };

  if (certificateType) {
    params['filter[certificateType]'] = certificateType;
  }

  const result = await ascGet<ASCResponse>('/v1/certificates', params);

  if (!result.data || result.data.length === 0) {
    return `## Certificates\n\nNo certificates found.${certificateType ? ` (filter: ${certificateType})` : ''}`;
  }

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  let md = `## Certificates (${result.data.length})\n\n`;
  md += `| Name | Type | Serial Number | Expiration | Status |\n`;
  md += `|------|------|---------------|------------|--------|\n`;

  let expiringCount = 0;

  for (const cert of result.data) {
    const a = cert.attributes;
    const expDate = a.expirationDate ? new Date(a.expirationDate) : null;
    const expStr = expDate ? expDate.toLocaleDateString() : '-';

    let status = 'Active';
    if (expDate) {
      if (expDate < now) {
        status = '[EXPIRED]';
      } else if (expDate < thirtyDaysFromNow) {
        status = '[EXPIRING SOON]';
        expiringCount++;
      }
    }

    md += `| ${a.displayName || '-'} | ${a.certificateType} | ${a.serialNumber || '-'} | ${expStr} | ${status} |\n`;
  }

  if (expiringCount > 0) {
    md += `\n> **WARNING:** ${expiringCount} certificate(s) expiring within 30 days. Renew them to avoid disruption.\n`;
  }

  return md;
}

export async function registerDevice(
  name: string,
  udid: string,
  platform: string
): Promise<string> {
  const result = await ascPost<ASCResponse>('/v1/devices', {
    data: {
      type: 'devices',
      attributes: {
        name,
        udid,
        platform,
      },
    },
  });

  const d = result.data;
  const a = d.attributes;

  let md = `## Device Registered\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Name** | ${a.name} |\n`;
  md += `| **UDID** | ${a.udid} |\n`;
  md += `| **Platform** | ${a.platform} |\n`;
  md += `| **Status** | ${a.status || 'ENABLED'} |\n`;
  md += `| **Device Class** | ${a.deviceClass || '-'} |\n`;
  md += `| **Device ID** | ${d.id} |\n`;

  return md;
}

export async function listDevices(platform?: string): Promise<string> {
  const params: Record<string, string> = {
    'fields[devices]': 'name,udid,platform,status,deviceClass,addedDate',
    'limit': '200',
  };

  if (platform) {
    params['filter[platform]'] = platform;
  }

  const result = await ascGet<ASCResponse>('/v1/devices', params);

  if (!result.data || result.data.length === 0) {
    return `## Registered Devices\n\nNo devices found.${platform ? ` (filter: ${platform})` : ''}`;
  }

  let md = `## Registered Devices (${result.data.length})\n\n`;
  md += `| Name | UDID | Platform | Class | Status | Added | Device ID |\n`;
  md += `|------|------|----------|-------|--------|-------|-----------|\n`;

  for (const device of result.data) {
    const a = device.attributes;
    const added = a.addedDate ? new Date(a.addedDate).toLocaleDateString() : '-';
    md += `| ${a.name} | ${a.udid} | ${a.platform} | ${a.deviceClass || '-'} | ${a.status} | ${added} | \`${device.id}\` |\n`;
  }

  // Summary by platform
  const byPlatform: Record<string, number> = {};
  for (const device of result.data) {
    const p = device.attributes.platform;
    byPlatform[p] = (byPlatform[p] || 0) + 1;
  }

  md += `\n**Summary:** `;
  md += Object.entries(byPlatform).map(([p, c]) => `${c} ${p}`).join(', ');

  return md;
}
