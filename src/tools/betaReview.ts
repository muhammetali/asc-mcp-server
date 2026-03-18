import { ascGet, ascPost, type ASCResponse } from '../client.js';
import { validateId } from '../validation.js';

export async function submitForBetaReview(buildId: string): Promise<string> {
  validateId(buildId, 'buildId');

  const result = await ascPost<ASCResponse>('/v1/betaAppReviewSubmissions', {
    data: {
      type: 'betaAppReviewSubmissions',
      relationships: {
        build: {
          data: { type: 'builds', id: buildId },
        },
      },
    },
  });

  const submission = result.data;
  const sa = submission.attributes;

  let md = `## Beta Review Submission\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Submission ID** | ${submission.id} |\n`;
  md += `| **Build ID** | ${buildId} |\n`;
  md += `| **Status** | ${sa.betaReviewState || 'SUBMITTED'} |\n`;
  if (sa.submittedDate) {
    md += `| **Submitted** | ${new Date(sa.submittedDate).toLocaleString()} |\n`;
  }
  md += `\n**Status:** Build submitted for beta review. External testers will have access once approved.`;

  return md;
}

export async function getBetaReviewStatus(buildId: string): Promise<string> {
  validateId(buildId, 'buildId');

  const result = await ascGet<ASCResponse>(
    `/v1/builds/${buildId}/betaAppReviewSubmission`,
    {
      'fields[betaAppReviewSubmissions]': 'betaReviewState,submittedDate',
    }
  );

  const submission = result.data;

  if (!submission) {
    return `## Beta Review Status\n\nNo beta review submission found for build \`${buildId}\`.`;
  }

  const sa = submission.attributes;

  let md = `## Beta Review Status\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Submission ID** | ${submission.id} |\n`;
  md += `| **Build ID** | ${buildId} |\n`;
  md += `| **State** | ${sa.betaReviewState} |\n`;
  if (sa.submittedDate) {
    md += `| **Submitted** | ${new Date(sa.submittedDate).toLocaleString()} |\n`;
  }

  return md;
}
