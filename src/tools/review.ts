import { ascGet, ascPost, ascPatch, ascDelete, type ASCResponse } from '../client.js';
import { APP_STORE_STATES, RESOURCE_TYPES, VERSION_FIELDS, REVIEW_DETAIL_FIELDS } from '../constants.js';
import { validateId } from '../validation.js';

export async function getReviewSubmission(versionId: string): Promise<string> {
  validateId(versionId, 'versionId');

  // Get the version details first
  const versionResult = await ascGet<ASCResponse>(`/v1/appStoreVersions/${versionId}`, {
    'fields[appStoreVersions]': VERSION_FIELDS.BASIC,
    'include': 'appStoreReviewDetail',
    'fields[appStoreReviewDetails]': REVIEW_DETAIL_FIELDS.FULL,
  });

  const v = versionResult.data;
  const va = v.attributes;

  let md = `## Review Status: v${va.versionString}\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Version** | ${va.versionString} |\n`;
  md += `| **Platform** | ${va.platform} |\n`;
  md += `| **State** | ${va.appStoreState} |\n`;

  // Review detail (demo account, notes, contact)
  const reviewDetail = (versionResult.included || []).find((i: any) => i.type === RESOURCE_TYPES.APP_STORE_REVIEW_DETAILS);
  if (reviewDetail) {
    const rd = reviewDetail.attributes;
    md += `\n### Review Detail\n\n`;
    md += `| Field | Value |\n`;
    md += `|-------|-------|\n`;
    md += `| **Contact** | ${rd.contactFirstName || ''} ${rd.contactLastName || ''} |\n`;
    md += `| **Email** | ${rd.contactEmail || '-'} |\n`;
    md += `| **Phone** | ${rd.contactPhone || '-'} |\n`;
    md += `| **Demo Account Required** | ${rd.demoAccountRequired ? 'Yes' : 'No'} |\n`;
    md += `| **Demo Username** | ${rd.demoAccountName || '-'} |\n`;
    md += `| **Demo Password** | ${rd.demoAccountPassword ? '(set)' : '**NOT SET**'} |\n`;
    md += `| **Notes to Reviewer** | ${rd.notes || '-'} |\n`;

    if (rd.demoAccountRequired && (!rd.demoAccountName || !rd.demoAccountPassword)) {
      md += `\n> **CRITICAL:** Demo account is required but credentials are missing! This WILL cause rejection.\n`;
    }
  } else {
    md += `\n> **Warning:** No review detail set. Consider adding demo account and reviewer notes.\n`;
  }

  // Rejection info
  if (va.appStoreState === APP_STORE_STATES.REJECTED) {
    md += `\n### Rejection Details\n\n`;
    md += `**To see rejection details:**\n`;
    md += `1. Go to App Store Connect > Your App > Version ${va.versionString}\n`;
    md += `2. Check the "Resolution Center" tab\n`;
    md += `3. Use \`asc_get_rejection_reasons\` for API-accessible rejection info\n`;
  }

  return md;
}

export async function updateReviewDetail(
  versionId: string,
  updates: {
    contactFirstName?: string;
    contactLastName?: string;
    contactEmail?: string;
    contactPhone?: string;
    demoAccountName?: string;
    demoAccountPassword?: string;
    demoAccountRequired?: boolean;
    notes?: string;
  }
): Promise<string> {
  validateId(versionId, 'versionId');

  // Check if review detail exists
  const versionResult = await ascGet<ASCResponse>(`/v1/appStoreVersions/${versionId}`, {
    'include': 'appStoreReviewDetail',
    'fields[appStoreReviewDetails]': REVIEW_DETAIL_FIELDS.FULL,
  });

  const existingDetail = (versionResult.included || []).find((i: any) => i.type === RESOURCE_TYPES.APP_STORE_REVIEW_DETAILS);

  if (existingDetail) {
    await ascPatch(`/v1/appStoreReviewDetails/${existingDetail.id}`, {
      data: {
        type: 'appStoreReviewDetails',
        id: existingDetail.id,
        attributes: updates,
      },
    });
  } else {
    await ascPost('/v1/appStoreReviewDetails', {
      data: {
        type: 'appStoreReviewDetails',
        attributes: updates,
        relationships: {
          appStoreVersion: {
            data: { type: 'appStoreVersions', id: versionId },
          },
        },
      },
    });
  }

  let md = `## Review Detail Updated\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      const display = key === 'demoAccountPassword' ? '(set)' : String(value);
      md += `| ${key} | ${display} |\n`;
    }
  }
  md += `\n**Status:** ${existingDetail ? 'Updated' : 'Created'} successfully`;

  return md;
}

export async function submitForReview(versionId?: string, appId?: string, versionString?: string, platform?: string): Promise<string> {
  // If versionString provided instead of versionId, resolve it
  if (versionString && appId) {
    const { resolveVersionId } = await import('./versions.js');
    const resolved = await resolveVersionId(appId, versionString, platform || 'IOS');
    versionId = resolved.id;
  }
  if (!versionId) {
    throw new Error('Provide either versionId OR both appId and versionString.');
  }
  validateId(versionId, 'versionId');

  // Pre-flight checks
  const versionResult = await ascGet<ASCResponse>(`/v1/appStoreVersions/${versionId}`, {
    'fields[appStoreVersions]': 'versionString,appStoreState,platform',
    'include': 'build,appStoreReviewDetail,appStoreVersionLocalizations',
    'fields[builds]': 'version,processingState,usesNonExemptEncryption',
    'fields[appStoreReviewDetails]': 'demoAccountRequired,demoAccountName,demoAccountPassword,notes',
    'fields[appStoreVersionLocalizations]': 'locale,whatsNew,description',
  });

  const v = versionResult.data;
  const va = v.attributes;

  // Check state
  if (va.appStoreState !== APP_STORE_STATES.PREPARE_FOR_SUBMISSION && va.appStoreState !== APP_STORE_STATES.REJECTED) {
    throw new Error(`Version v${va.versionString} is in state \`${va.appStoreState}\`. Can only submit from PREPARE_FOR_SUBMISSION or REJECTED state.`);
  }

  // Check build attached
  const build = (versionResult.included || []).find((i: any) => i.type === RESOURCE_TYPES.BUILDS);
  if (!build) {
    throw new Error(`No build attached to version v${va.versionString}. Use \`asc_assign_build\` first.`);
  }
  if (build.attributes.processingState !== 'VALID') {
    throw new Error(`Build ${build.attributes.version} is in state \`${build.attributes.processingState}\`. Must be VALID.`);
  }

  // Check encryption declaration
  if (build.attributes.usesNonExemptEncryption === null || build.attributes.usesNonExemptEncryption === undefined) {
    throw new Error(`Build ${build.attributes.version} encryption declaration not set. Use \`asc_set_encryption\` first.`);
  }

  // Check localizations
  const locs = (versionResult.included || []).filter((i: any) => i.type === RESOURCE_TYPES.APP_STORE_VERSION_LOCALIZATIONS);
  const emptyWhatsNew = locs.filter((l: any) => !l.attributes.whatsNew);
  if (emptyWhatsNew.length > 0) {
    throw new Error(`Empty What's New for locales: ${emptyWhatsNew.map((l: any) => l.attributes.locale).join(', ')}. Use \`asc_update_whats_new\` to set them.`);
  }
  const emptyDesc = locs.filter((l: any) => !l.attributes.description);
  if (emptyDesc.length > 0) {
    throw new Error(`Empty description for locales: ${emptyDesc.map((l: any) => l.attributes.locale).join(', ')}. All locales need descriptions.`);
  }

  // Get app ID from version relationship
  const appRelationship = v.relationships?.app?.data;
  let resolvedAppId: string;
  if (!appRelationship) {
    // Fetch it separately
    const fullVersion = await ascGet<ASCResponse>(`/v1/appStoreVersions/${versionId}`, {
      'fields[appStoreVersions]': 'versionString',
      'include': 'app',
      'fields[apps]': 'bundleId',
    });
    const foundAppId = (fullVersion.included || []).find((i: any) => i.type === RESOURCE_TYPES.APPS)?.id;
    if (!foundAppId) {
      throw new Error(`Could not determine app ID for version ${versionId}. Please provide appId.`);
    }
    resolvedAppId = foundAppId;
  } else {
    resolvedAppId = appRelationship.id;
  }

  // Step 1: Create reviewSubmission
  const submissionResult = await ascPost<ASCResponse>('/v1/reviewSubmissions', {
    data: {
      type: 'reviewSubmissions',
      relationships: {
        app: { data: { type: RESOURCE_TYPES.APPS, id: resolvedAppId } },
      },
    },
  });
  const submissionId = submissionResult.data.id;

  // Step 2: Add reviewSubmissionItem (the version)
  await ascPost<ASCResponse>('/v1/reviewSubmissionItems', {
    data: {
      type: 'reviewSubmissionItems',
      relationships: {
        reviewSubmission: { data: { type: 'reviewSubmissions', id: submissionId } },
        appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
      },
    },
  });

  // Step 3: Confirm submission (set submitted = true)
  await ascPatch(`/v1/reviewSubmissions/${submissionId}`, {
    data: {
      type: 'reviewSubmissions',
      id: submissionId,
      attributes: { submitted: true },
    },
  });

  let md = `## Submitted for Review\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Version** | ${va.versionString} |\n`;
  md += `| **Platform** | ${va.platform} |\n`;
  md += `| **Build** | ${build.attributes.version} |\n`;
  md += `| **Locales** | ${locs.length} |\n`;
  md += `| **Submission ID** | ${submissionId} |\n`;
  md += `\n**Status:** Submitted for App Review. Typically takes 24-48 hours.\n`;
  md += `\nUse \`asc_list_versions\` to monitor review progress.`;

  return md;
}

export async function withdrawFromReview(versionId: string): Promise<string> {
  validateId(versionId, 'versionId');

  // Get version info
  const versionResult = await ascGet<ASCResponse>(`/v1/appStoreVersions/${versionId}`, {
    'fields[appStoreVersions]': 'versionString,appStoreState,platform',
  });

  const v = versionResult.data;
  const va = v.attributes;

  const validStates = [APP_STORE_STATES.WAITING_FOR_REVIEW, APP_STORE_STATES.IN_REVIEW];
  if (!validStates.includes(va.appStoreState)) {
    throw new Error(`Version v${va.versionString} is in state \`${va.appStoreState}\`. Can only withdraw from WAITING_FOR_REVIEW or IN_REVIEW.`);
  }

  // Find the active reviewSubmission for this app
  const appRelationship = v.relationships?.app?.data;
  let appId: string;

  if (appRelationship) {
    appId = appRelationship.id;
  } else {
    const fullVersion = await ascGet<ASCResponse>(`/v1/appStoreVersions/${versionId}`, {
      'include': 'app',
      'fields[apps]': 'bundleId',
    });
    const app = (fullVersion.included || []).find((i: any) => i.type === RESOURCE_TYPES.APPS);
    if (!app) {
      throw new Error(`Could not determine app ID for version ${versionId}.`);
    }
    appId = app.id;
  }

  // Find active review submission
  const submissions = await ascGet<ASCResponse>(`/v1/reviewSubmissions`, {
    'filter[app]': appId,
    'filter[state]': 'WAITING_FOR_REVIEW,IN_REVIEW',
    'fields[reviewSubmissions]': 'state,submittedDate',
  });

  const submissionsArray = Array.isArray(submissions.data) ? submissions.data : (submissions.data ? [submissions.data] : []);
  const submissionToCancel = submissionsArray.find((s: any) =>
    s.attributes.state === 'WAITING_FOR_REVIEW' || s.attributes.state === 'IN_REVIEW'
  );

  if (!submissionToCancel) {
    throw new Error('No active review submission found for this app. The version may have already been withdrawn or not yet submitted.');
  }

  // Cancel by setting submitted = false (PATCH)
  await ascPatch(`/v1/reviewSubmissions/${submissionToCancel.id}`, {
    data: {
      type: 'reviewSubmissions',
      id: submissionToCancel.id,
      attributes: { canceled: true },
    },
  });

  let md = `## Withdrawn from Review\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Version** | ${va.versionString} |\n`;
  md += `| **Platform** | ${va.platform} |\n`;
  md += `| **Previous State** | ${va.appStoreState} |\n`;
  md += `| **New State** | PREPARE_FOR_SUBMISSION |\n`;
  md += `\nThe version is now back in draft state. You can modify it or create a new version.`;

  return md;
}

export async function getRejectionReasons(appId: string): Promise<string> {
  validateId(appId, 'appId');

  // Get the most recent rejected version
  const result = await ascGet<ASCResponse>(`/v1/apps/${appId}/appStoreVersions`, {
    'filter[appStoreState]': APP_STORE_STATES.REJECTED,
    'fields[appStoreVersions]': 'versionString,appStoreState,platform,createdDate',
    'limit': '5',
  });

  if (!result.data || result.data.length === 0) {
    return `## Rejection History\n\nNo rejected versions found. That's good!`;
  }

  let md = `## Rejection History\n\n`;

  for (const v of result.data) {
    const va = v.attributes;
    const created = va.createdDate ? new Date(va.createdDate).toLocaleDateString() : '-';
    md += `### v${va.versionString} (${va.platform}) - Rejected ${created}\n\n`;

    // Try to get submission info
    try {
      const subResult = await ascGet<ASCResponse>(`/v1/appStoreVersions/${v.id}`, {
        'include': 'appStoreReviewDetail',
        'fields[appStoreReviewDetails]': 'notes',
      });
      const detail = (subResult.included || []).find((i: any) => i.type === RESOURCE_TYPES.APP_STORE_REVIEW_DETAILS);
      if (detail?.attributes?.notes) {
        md += `**Reviewer Notes:** ${detail.attributes.notes}\n\n`;
      }
    } catch {
      // API might not return this
    }

    md += `**Version ID:** \`${v.id}\` (use with \`asc_get_review_submission\` for more details)\n\n`;
  }

  md += `---\n`;
  md += `> **Tip:** For detailed rejection reasons, check the Resolution Center in App Store Connect web UI.\n`;
  md += `> Common rejection reasons:\n`;
  md += `> - 4.3 Spam (similar to existing apps) - provide differentiation details\n`;
  md += `> - 5.1.1 Privacy (missing privacy policy) - ensure all locales have privacy policy URL\n`;
  md += `> - 2.1 Performance (crashes) - check TestFlight crash reports\n`;
  md += `> - 1.2 Safety (user-generated content) - ensure moderation & reporting features\n`;

  return md;
}
