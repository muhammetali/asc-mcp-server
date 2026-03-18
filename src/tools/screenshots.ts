import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import { ascGet, ascPost, ascPatch, ascDelete, ascUploadChunk, type ASCResponse } from '../client.js';
import { validateId } from '../validation.js';

export async function listScreenshotSets(versionLocalizationId: string): Promise<string> {
  validateId(versionLocalizationId, 'versionLocalizationId');

  const result = await ascGet<ASCResponse>(
    `/v1/appStoreVersionLocalizations/${versionLocalizationId}/appScreenshotSets`,
    {
      'fields[appScreenshotSets]': 'screenshotDisplayType',
      'include': 'appScreenshots',
      'fields[appScreenshots]': 'fileName,fileSize,assetDeliveryState,uploadOperations',
    }
  );

  if (!result.data || result.data.length === 0) {
    return `## Screenshot Sets\n\nNo screenshot sets found for localization \`${versionLocalizationId}\`.`;
  }

  let md = `## Screenshot Sets\n\n`;

  const screenshots = (result.included || []).filter((i: any) => i.type === 'appScreenshots');
  const ssMap = new Map<string, any[]>();
  for (const ss of screenshots) {
    // Find which set this screenshot belongs to
    for (const set of result.data) {
      const setScreenshots = set.relationships?.appScreenshots?.data || [];
      if (setScreenshots.some((s: any) => s.id === ss.id)) {
        if (!ssMap.has(set.id)) ssMap.set(set.id, []);
        ssMap.get(set.id)!.push(ss);
      }
    }
  }

  for (const set of result.data) {
    const displayType = set.attributes.screenshotDisplayType;
    const setScreenshots = ssMap.get(set.id) || [];
    md += `### ${displayType}\n`;
    md += `**Set ID:** \`${set.id}\`\n\n`;

    if (setScreenshots.length === 0) {
      md += `No screenshots uploaded.\n\n`;
    } else {
      md += `| # | File Name | Size | State |\n`;
      md += `|---|-----------|------|-------|\n`;
      for (let i = 0; i < setScreenshots.length; i++) {
        const ss = setScreenshots[i];
        const sa = ss.attributes;
        const sizeKB = sa.fileSize ? `${(sa.fileSize / 1024).toFixed(0)} KB` : '-';
        const state = sa.assetDeliveryState?.state || '-';
        md += `| ${i + 1} | ${sa.fileName} | ${sizeKB} | ${state} |\n`;
      }
      md += `\n`;
    }
  }

  return md;
}

export async function uploadScreenshot(
  screenshotSetId: string,
  filePath: string,
  fileName: string
): Promise<string> {
  validateId(screenshotSetId, 'screenshotSetId');

  // Path traversal protection: resolve to absolute and verify existence
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }
  if (!resolvedPath.match(/\.(png|jpg|jpeg)$/i)) {
    throw new Error(`Invalid file type. Only PNG and JPEG screenshots are supported: ${resolvedPath}`);
  }

  // Read file
  const fileData = readFileSync(resolvedPath);
  const fileSize = fileData.length;
  const checksum = createHash('md5').update(fileData).digest('hex');

  let md = `## Screenshot Upload: ${fileName}\n\n`;

  // Step 1: Reserve
  md += `1. Reserving upload slot...\n`;
  const reserveResult = await ascPost<ASCResponse>('/v1/appScreenshots', {
    data: {
      type: 'appScreenshots',
      attributes: {
        fileName,
        fileSize,
      },
      relationships: {
        appScreenshotSet: {
          data: { type: 'appScreenshotSets', id: screenshotSetId },
        },
      },
    },
  });

  const screenshotId = reserveResult.data.id;
  const uploadOps = reserveResult.data.attributes.uploadOperations;
  md += `   Reserved. Screenshot ID: \`${screenshotId}\`\n`;

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
  await ascPatch(`/v1/appScreenshots/${screenshotId}`, {
    data: {
      type: 'appScreenshots',
      id: screenshotId,
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
  md += `| **Screenshot ID** | ${screenshotId} |\n`;

  return md;
}

export async function deleteScreenshot(screenshotId: string): Promise<string> {
  validateId(screenshotId, 'screenshotId');

  await ascDelete(`/v1/appScreenshots/${screenshotId}`);
  return `**Deleted** screenshot \`${screenshotId}\``;
}

export async function deleteAllScreenshotsInSet(screenshotSetId: string): Promise<string> {
  validateId(screenshotSetId, 'screenshotSetId');

  const result = await ascGet<ASCResponse>(
    `/v1/appScreenshotSets/${screenshotSetId}/appScreenshots`,
    { 'fields[appScreenshots]': 'fileName' }
  );

  const screenshots = result.data || [];
  if (screenshots.length === 0) {
    return `No screenshots to delete in set \`${screenshotSetId}\`.`;
  }

  let md = `## Deleting Screenshots\n\n`;
  for (const ss of screenshots) {
    await ascDelete(`/v1/appScreenshots/${ss.id}`);
    md += `- Deleted: ${ss.attributes.fileName}\n`;
  }

  md += `\n**Total:** ${screenshots.length} screenshot(s) deleted.`;
  return md;
}
