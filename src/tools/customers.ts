import { ascGet, ascPost, ascPatch, ascGetAll, type ASCResponse } from '../client.js';
import { validateId } from '../validation.js';

export async function listCustomerReviews(
  appId: string,
  sort: string = '-createdDate',
  limit: number = 20
): Promise<string> {
  validateId(appId, 'appId');

  const result = await ascGet<ASCResponse>(`/v1/apps/${appId}/customerReviews`, {
    'sort': sort,
    'limit': String(limit),
    'fields[customerReviews]': 'rating,title,body,reviewerNickname,createdDate,territory',
    'include': 'response',
    'fields[customerReviewResponses]': 'responseBody,lastModifiedDate,state',
  });

  if (!result.data || result.data.length === 0) {
    return `## Customer Reviews\n\nNo reviews found for app \`${appId}\`.`;
  }

  // Build response map
  const responseMap = new Map<string, any>();
  for (const inc of (result.included || [])) {
    if (inc.type === 'customerReviewResponses') {
      responseMap.set(inc.id, inc);
    }
  }

  let md = `## Customer Reviews (${result.data.length})\n\n`;

  for (const review of result.data) {
    const r = review.attributes;
    const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
    const date = r.createdDate ? new Date(r.createdDate).toLocaleDateString() : '-';

    md += `### ${stars} ${r.title || '(no title)'}\n`;
    md += `**By:** ${r.reviewerNickname || 'Anonymous'} | **Date:** ${date} | **Territory:** ${r.territory || '-'} | **Review ID:** \`${review.id}\`\n\n`;
    md += `${r.body || '-'}\n\n`;

    // Check for response
    const responseRel = review.relationships?.response?.data;
    if (responseRel) {
      const resp = responseMap.get(responseRel.id);
      if (resp) {
        md += `> **Your Response** (${resp.attributes.state || '-'}):\n> ${resp.attributes.responseBody || '-'}\n\n`;
      }
    }

    md += `---\n\n`;
  }

  // Summary
  const ratings = result.data.map((r: any) => r.attributes.rating);
  const avgRating = (ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length).toFixed(1);
  const respondedCount = result.data.filter((r: any) => r.relationships?.response?.data).length;

  md += `**Summary:** Avg ${avgRating}/5 | ${respondedCount}/${result.data.length} responded\n`;

  return md;
}

export async function respondToCustomerReview(
  reviewId: string,
  responseBody: string
): Promise<string> {
  validateId(reviewId, 'reviewId');

  // Check if there's already a response
  const reviewResult = await ascGet<ASCResponse>(`/v1/customerReviews/${reviewId}`, {
    'include': 'response',
    'fields[customerReviews]': 'title,rating,reviewerNickname',
    'fields[customerReviewResponses]': 'responseBody,state',
  });

  const existingResponse = (reviewResult.included || []).find((i: any) => i.type === 'customerReviewResponses');

  if (existingResponse) {
    // Update existing response
    await ascPatch(`/v1/customerReviewResponses/${existingResponse.id}`, {
      data: {
        type: 'customerReviewResponses',
        id: existingResponse.id,
        attributes: { responseBody },
      },
    });
  } else {
    // Create new response
    await ascPost('/v1/customerReviewResponses', {
      data: {
        type: 'customerReviewResponses',
        attributes: { responseBody },
        relationships: {
          review: {
            data: { type: 'customerReviews', id: reviewId },
          },
        },
      },
    });
  }

  const r = reviewResult.data.attributes;
  let md = `## Review Response ${existingResponse ? 'Updated' : 'Created'}\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Review** | ${'★'.repeat(r.rating)} ${r.title || '-'} |\n`;
  md += `| **By** | ${r.reviewerNickname || 'Anonymous'} |\n`;
  md += `| **Response** | ${responseBody.length > 100 ? responseBody.slice(0, 100) + '...' : responseBody} |\n`;
  md += `\n**Status:** ${existingResponse ? 'Updated' : 'Submitted'} successfully. Response will appear within 24 hours.`;

  return md;
}
