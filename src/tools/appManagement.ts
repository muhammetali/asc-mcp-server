import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import { ascGet, ascGetAll, ascPost, ascPatch, ascDelete, ascUploadChunk, type ASCResponse } from '../client.js';
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

// App territory availability — v2 API, a completely different shape from
// the v1 code this replaced. Verified against Apple's official OpenAPI
// spec 2026-08-12 (developer.apple.com/sample-code/app-store-connect/
// app-store-connect-openapi-specification.zip) after the old v1 code
// (`GET /v1/apps/{id}/availableTerritories`, a flat territory-ID list
// relationship on `apps`) turned out not to exist anywhere in the current
// API — every call would have failed. There is no flat "available
// territories" list on an app anymore:
//   1. `GET /v1/apps/{id}/appAvailabilityV2` — the app has ONE
//      appAvailability resource; fetch its ID first.
//   2. `GET /v2/appAvailabilities/{id}/territoryAvailabilities` — paginated
//      list of per-territory records, each with its own `available`
//      boolean (not "in the list = available", an explicit flag now).
//   3. Writes (`POST /v2/appAvailabilities`) are a JSON:API *compound
//      document*: you don't reference existing `territories` directly —
//      you create new `territoryAvailabilities` records inline via
//      `included`, referenced by client-chosen local IDs from
//      `data.relationships.territoryAvailabilities.data`. This submits the
//      FULL desired state (every territory's `available` flag), same
//      "replace the whole set" semantics the old code had — just a
//      different wire format for it.
// Exported so appAvailability.ts's getAppPricing() can reuse the same
// (correct, v2) territory lookup instead of duplicating it — it had its own
// copy of the identical `/v1/apps/{id}/availableTerritories` bug, silently
// swallowed by a try/catch ("Could not fetch territory data" every time).
export async function getAppAvailabilityId(appId: string): Promise<string> {
  const result = await ascGet<ASCResponse>(`/v1/apps/${appId}/appAvailabilityV2`, {});
  if (!result.data) {
    throw new Error(`No app availability resource found for app ${appId}. The app may not be fully set up yet.`);
  }
  return result.data.id;
}

export interface TerritoryAvailabilityState {
  territoryCode: string;
  available: boolean;
}

export async function listTerritoryAvailabilities(availabilityId: string): Promise<TerritoryAvailabilityState[]> {
  // `include=territory` is required for Apple to populate the
  // `relationships.territory.data.id` linkage at all — confirmed live
  // 2026-08-12: requesting `fields[territoryAvailabilities]=available,
  // territory` alone returned `available` correctly but every
  // `relationships.territory` was entirely absent (not even a stub
  // resource-identifier), unlike stricter JSON:API implementations where
  // relationship linkage is independent of `include`.
  const items = await ascGetAll<any>(`/v2/appAvailabilities/${availabilityId}/territoryAvailabilities`, {
    'fields[territoryAvailabilities]': 'available,territory',
    'include': 'territory',
    'limit': '200',
  });
  return items.map((t: any) => ({
    territoryCode: t.relationships?.territory?.data?.id,
    // `available` is nullable in Apple's schema; treat null/undefined as
    // available (matches "no explicit restriction" being the common case).
    available: t.attributes?.available !== false,
  }));
}

async function submitTerritoryAvailabilities(
  appId: string,
  entries: TerritoryAvailabilityState[],
  availableInNewTerritories: boolean,
): Promise<void> {
  const included = entries.map((e, i) => ({
    type: 'territoryAvailabilities',
    id: `local-${i}`,
    attributes: { available: e.available },
    relationships: {
      territory: { data: { type: 'territories', id: e.territoryCode } },
    },
  }));

  await ascPost<ASCResponse>('/v2/appAvailabilities', {
    data: {
      type: 'appAvailabilities',
      attributes: { availableInNewTerritories },
      relationships: {
        app: { data: { type: 'apps', id: appId } },
        territoryAvailabilities: {
          data: included.map((inc) => ({ type: 'territoryAvailabilities', id: inc.id })),
        },
      },
    },
    included,
  });
}

export async function manageAppAvailability(
  appId: string,
  action: 'get' | 'remove_from_sale' | 'restore',
  territoryCodes?: string[]
): Promise<string> {
  validateId(appId, 'appId');

  const availabilityId = await getAppAvailabilityId(appId);

  if (action === 'get') {
    const territories = await listTerritoryAvailabilities(availabilityId);

    if (territories.length === 0) {
      return `## App Availability\n\nNo territory availability data found for app \`${appId}\`.`;
    }

    let md = `## App Availability (${territories.length} territories)\n\n`;
    md += `| Territory Code | Available |\n`;
    md += `|----------------|-----------|\n`;
    for (const t of territories) {
      md += `| ${t.territoryCode} | ${t.available ? 'Yes' : 'No'} |\n`;
    }

    return md;
  }

  if (action === 'remove_from_sale') {
    const codesToRemove = territoryCodes || [];
    if (codesToRemove.length === 0) {
      throw new Error('territoryCodes is required for remove_from_sale action. Provide the territory codes to remove.');
    }

    const current = await listTerritoryAvailabilities(availabilityId);
    const removeSet = new Set(codesToRemove);
    // Full-state replace: keep every territory's current flag, flip only
    // the ones targeted for removal — never silently touch territories the
    // caller didn't mention.
    const updated = current.map((t) => ({
      territoryCode: t.territoryCode,
      available: removeSet.has(t.territoryCode) ? false : t.available,
    }));

    await submitTerritoryAvailabilities(appId, updated, false);

    const stillAvailable = updated.filter((t) => t.available).length;
    let md = `## App Availability Updated (Remove from Sale)\n\n`;
    md += `| Field | Value |\n`;
    md += `|-------|-------|\n`;
    md += `| **Removed Territories** | ${codesToRemove.join(', ')} |\n`;
    md += `| **Still Available** | ${stillAvailable} of ${updated.length} |\n`;
    md += `\n**Status:** Territories removed successfully.`;

    return md;
  }

  if (action === 'restore') {
    const current = await listTerritoryAvailabilities(availabilityId);
    // No codes given => restore everything; codes given => restore only
    // those, leaving every other territory's current flag untouched.
    const restoreSet = territoryCodes && territoryCodes.length > 0 ? new Set(territoryCodes) : null;
    const updated = current.map((t) => ({
      territoryCode: t.territoryCode,
      available: restoreSet ? (restoreSet.has(t.territoryCode) ? true : t.available) : true,
    }));

    await submitTerritoryAvailabilities(appId, updated, true);

    const nowAvailable = updated.filter((t) => t.available).length;
    let md = `## App Availability Restored\n\n`;
    md += `| Field | Value |\n`;
    md += `|-------|-------|\n`;
    md += `| **Total Territories** | ${updated.length} |\n`;
    md += `| **Now Available** | ${nowAvailable} |\n`;
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

/**
 * Revoke (delete) a single certificate by its ASC certificate ID.
 *
 * Use case: when a Mac's keychain ACL gets corrupted and the local
 * private key for an Apple Development cert becomes unusable
 * (errSecInternalComponent on every codesign), Apple's portal still
 * holds the cert. Xcode refuses to create a new one until the broken
 * one is revoked. This tool unblocks the situation without GUI access.
 *
 * IMPORTANT: revoking a Distribution certificate that is in active use
 * by App Store / TestFlight builds will break new uploads until a new
 * one is created and embedded in the next archive. Be cautious.
 */
export async function revokeCertificate(certificateId: string): Promise<string> {
  if (!certificateId || typeof certificateId !== 'string') {
    throw new Error('certificateId is required and must be a string');
  }
  await ascDelete(`/v1/certificates/${certificateId}`);
  return `## Certificate Revoked\n\n` +
    `| Field | Value |\n` +
    `|-------|-------|\n` +
    `| **Certificate ID** | \`${certificateId}\` |\n` +
    `| **Status** | Revoked |\n\n` +
    `> The certificate has been removed from App Store Connect. Any local ` +
    `private key remains in your keychain and should be deleted manually if ` +
    `you no longer need it. Xcode will create a new certificate on the next ` +
    `signed build (with \`-allowProvisioningUpdates\`).\n`;
}

/**
 * Revoke ALL certificates of a given type (or all DEVELOPMENT certs by default).
 *
 * Convenience wrapper for the common "my dev cert is broken, blow them
 * all away and let Xcode rebuild" workflow. Aggregates per-cert failures
 * into a single result so a partial failure doesn't lose information.
 *
 * SAFETY: pass an explicit certificateType to avoid accidentally revoking
 * Distribution certs. The default ('DEVELOPMENT') matches both
 * IOS_DEVELOPMENT and DEVELOPMENT type strings returned by the ASC API.
 */
export async function revokeCertificatesByType(
  certificateType: string = 'DEVELOPMENT',
): Promise<string> {
  // Distribution types are blocked at the helper level — callers can still
  // call revokeCertificate() one at a time if they really need to revoke a
  // distribution cert, but the bulk helper refuses by design.
  const blocked = new Set([
    'IOS_DISTRIBUTION', 'DISTRIBUTION', 'MAC_APP_DISTRIBUTION',
    'MAC_INSTALLER_DISTRIBUTION', 'DEVELOPER_ID_APPLICATION', 'DEVELOPER_ID_KEXT',
  ]);
  if (blocked.has(certificateType.toUpperCase())) {
    throw new Error(
      `Refusing bulk revoke for type "${certificateType}". ` +
      `Distribution certs may be in active use; revoke individually with ` +
      `revokeCertificate() if you really mean it.`,
    );
  }

  const params: Record<string, string> = {
    'fields[certificates]': 'displayName,certificateType,serialNumber',
    'limit': '200',
  };
  // ASC accepts the type filter as-is; both DEVELOPMENT and IOS_DEVELOPMENT
  // are valid type strings depending on how the cert was created.
  if (certificateType) {
    params['filter[certificateType]'] = certificateType;
  }

  const list = await ascGet<ASCResponse>('/v1/certificates', params);
  const certs = list.data || [];

  if (certs.length === 0) {
    return `## Bulk Revoke\n\nNo certificates of type \`${certificateType}\` found. Nothing to do.\n`;
  }

  let md = `## Bulk Revoke (${certificateType})\n\n`;
  md += `Found **${certs.length}** certificate(s) to revoke.\n\n`;
  md += `| Status | Name | Serial | ID |\n`;
  md += `|--------|------|--------|----|\n`;

  let revoked = 0;
  let failed = 0;
  for (const cert of certs) {
    const a = cert.attributes || {};
    const name = a.displayName || '-';
    const serial = a.serialNumber || '-';
    const id = cert.id;
    try {
      await ascDelete(`/v1/certificates/${id}`);
      revoked++;
      md += `| OK | ${name} | \`${serial}\` | \`${id}\` |\n`;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      md += `| FAILED | ${name} | \`${serial}\` | \`${id}\` (${msg}) |\n`;
    }
  }

  md += `\n**Summary:** ${revoked} revoked, ${failed} failed.\n`;
  if (revoked > 0) {
    md += `\n> Run \`xcodebuild ... -allowProvisioningUpdates -authenticationKey*\` ` +
      `next — Xcode will create fresh certificates via the ASC API.\n`;
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
