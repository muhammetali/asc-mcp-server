import { ascGet, ascPost, ascPatch, type ASCResponse } from '../client.js';

export async function getReviewSubmission(versionId: string): Promise<string> {
  // Get the version details first
  const versionResult = await ascGet<ASCResponse>(`/v1/appStoreVersions/${versionId}`, {
    'fields[appStoreVersions]': 'versionString,appStoreState,platform,createdDate',
    'include': 'appStoreReviewDetail,appStoreVersionSubmission',
    'fields[appStoreReviewDetails]': 'contactFirstName,contactLastName,contactEmail,contactPhone,demoAccountName,demoAccountPassword,demoAccountRequired,notes',
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
  const reviewDetail = (versionResult.included || []).find((i: any) => i.type === 'appStoreReviewDetails');
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
  if (va.appStoreState === 'REJECTED') {
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
  // Check if review detail exists
  const versionResult = await ascGet<ASCResponse>(`/v1/appStoreVersions/${versionId}`, {
    'include': 'appStoreReviewDetail',
    'fields[appStoreReviewDetails]': 'contactFirstName,contactLastName,contactEmail,contactPhone,demoAccountName,demoAccountPassword,demoAccountRequired,notes',
  });

  const existingDetail = (versionResult.included || []).find((i: any) => i.type === 'appStoreReviewDetails');

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

export async function submitForReview(versionId: string): Promise<string> {
  // Pre-flight checks
  const versionResult = await ascGet<ASCResponse>(`/v1/appStoreVersions/${versionId}`, {
    'fields[appStoreVersions]': 'versionString,appStoreState,platform',
    'include': 'build,appStoreReviewDetail,appStoreVersionLocalizations',
    'fields[builds]': 'version,processingState',
    'fields[appStoreReviewDetails]': 'demoAccountRequired,demoAccountName,demoAccountPassword,notes',
    'fields[appStoreVersionLocalizations]': 'locale,whatsNew,description',
  });

  const v = versionResult.data;
  const va = v.attributes;

  // Check state
  if (va.appStoreState !== 'PREPARE_FOR_SUBMISSION' && va.appStoreState !== 'REJECTED') {
    return `**Error:** Version v${va.versionString} is in state \`${va.appStoreState}\`. Can only submit from PREPARE_FOR_SUBMISSION or REJECTED state.`;
  }

  // Check build attached
  const build = (versionResult.included || []).find((i: any) => i.type === 'builds');
  if (!build) {
    return `**Error:** No build attached to version v${va.versionString}. Use \`asc_assign_build\` first.`;
  }
  if (build.attributes.processingState !== 'VALID') {
    return `**Error:** Build ${build.attributes.version} is in state \`${build.attributes.processingState}\`. Must be VALID.`;
  }

  // Check localizations
  const locs = (versionResult.included || []).filter((i: any) => i.type === 'appStoreVersionLocalizations');
  const emptyDesc = locs.filter((l: any) => !l.attributes.description);
  if (emptyDesc.length > 0) {
    return `**Error:** Empty description for locales: ${emptyDesc.map((l: any) => l.attributes.locale).join(', ')}. All locales need descriptions.`;
  }

  // Submit
  const result = await ascPost<ASCResponse>('/v1/appStoreVersionSubmissions', {
    data: {
      type: 'appStoreVersionSubmissions',
      relationships: {
        appStoreVersion: {
          data: { type: 'appStoreVersions', id: versionId },
        },
      },
    },
  });

  let md = `## Submitted for Review\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Version** | ${va.versionString} |\n`;
  md += `| **Platform** | ${va.platform} |\n`;
  md += `| **Build** | ${build.attributes.version} |\n`;
  md += `| **Locales** | ${locs.length} |\n`;
  md += `\n**Status:** Submitted for App Review. Typically takes 24-48 hours.\n`;
  md += `\nUse \`asc_list_versions\` to monitor review progress.`;

  return md;
}

export async function getRejectionReasons(appId: string): Promise<string> {
  // Get the most recent rejected version
  const result = await ascGet<ASCResponse>(`/v1/apps/${appId}/appStoreVersions`, {
    'filter[appStoreState]': 'REJECTED',
    'fields[appStoreVersions]': 'versionString,appStoreState,platform,createdDate',
    'sort': '-createdDate',
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
      const detail = (subResult.included || []).find((i: any) => i.type === 'appStoreReviewDetails');
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
  md += `> Common rejection reasons for GoyGoyChat:\n`;
  md += `> - 4.3 Spam (similar to existing apps) - provide differentiation details\n`;
  md += `> - 5.1.1 Privacy (missing privacy policy) - ensure all locales have privacy policy URL\n`;
  md += `> - 2.1 Performance (crashes) - check TestFlight crash reports\n`;
  md += `> - 1.2 Safety (user-generated content) - ensure moderation & reporting features\n`;

  return md;
}
