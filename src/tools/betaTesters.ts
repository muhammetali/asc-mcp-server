import { ascGet, ascPost, ascDelete, type ASCResponse } from '../client.js';
import { validateId } from '../validation.js';

export async function listBetaTesters(
  appId?: string,
  betaGroupId?: string,
  email?: string,
  limit: number = 50
): Promise<string> {
  if (appId) validateId(appId, 'appId');
  if (betaGroupId) validateId(betaGroupId, 'betaGroupId');

  const params: Record<string, string> = {
    'fields[betaTesters]': 'firstName,lastName,email,inviteType,state',
    'limit': String(limit),
  };

  if (appId) params['filter[apps]'] = appId;
  if (betaGroupId) params['filter[betaGroups]'] = betaGroupId;
  if (email) params['filter[email]'] = email;

  const result = await ascGet<ASCResponse>('/v1/betaTesters', params);

  if (!result.data || result.data.length === 0) {
    return `## Beta Testers\n\nNo beta testers found.${email ? ` (filter: ${email})` : ''}`;
  }

  let md = `## TestFlight Beta Testers (${result.data.length})\n\n`;
  md += `| Name | Email | Invite Type | State | Tester ID |\n`;
  md += `|------|-------|-------------|-------|----------|\n`;

  for (const tester of result.data) {
    const a = tester.attributes;
    const name = [a.firstName, a.lastName].filter(Boolean).join(' ') || '-';
    md += `| ${name} | ${a.email || '-'} | ${a.inviteType || '-'} | ${a.state || '-'} | \`${tester.id}\` |\n`;
  }

  return md;
}

export async function addBetaTester(
  betaGroupId: string,
  email: string,
  firstName?: string,
  lastName?: string
): Promise<string> {
  validateId(betaGroupId, 'betaGroupId');

  const result = await ascPost<ASCResponse>('/v1/betaTesters', {
    data: {
      type: 'betaTesters',
      attributes: {
        email,
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
      },
      relationships: {
        betaGroups: {
          data: [{ type: 'betaGroups', id: betaGroupId }],
        },
      },
    },
  });

  let md = `## Beta Tester Added\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Email** | ${email} |\n`;
  md += `| **Name** | ${[firstName, lastName].filter(Boolean).join(' ') || '-'} |\n`;
  md += `| **Group** | ${betaGroupId} |\n`;
  md += `| **Tester ID** | ${result.data.id} |\n`;
  md += `\n**Status:** Tester invited. They will receive an email with TestFlight instructions.`;

  return md;
}

export async function removeBetaTester(
  betaGroupId: string,
  testerId: string
): Promise<string> {
  validateId(betaGroupId, 'betaGroupId');
  validateId(testerId, 'testerId');

  await ascDelete(`/v1/betaGroups/${betaGroupId}/relationships/betaTesters`, {
    data: [{ type: 'betaTesters', id: testerId }],
  } as any);

  return `## Beta Tester Removed\n\n**Tester** \`${testerId}\` removed from **group** \`${betaGroupId}\`.`;
}

export async function createBetaGroup(
  appId: string,
  name: string,
  isInternal: boolean = false,
  publicLinkEnabled: boolean = false
): Promise<string> {
  validateId(appId, 'appId');

  const result = await ascPost<ASCResponse>('/v1/betaGroups', {
    data: {
      type: 'betaGroups',
      attributes: {
        name,
        isInternalGroup: isInternal,
        publicLinkEnabled,
        hasAccessToAllBuilds: isInternal,
      },
      relationships: {
        app: {
          data: { type: 'apps', id: appId },
        },
      },
    },
  });

  let md = `## Beta Group Created\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Name** | ${name} |\n`;
  md += `| **Type** | ${isInternal ? 'Internal' : 'External'} |\n`;
  md += `| **Public Link** | ${publicLinkEnabled ? 'Enabled' : 'Disabled'} |\n`;
  md += `| **Group ID** | ${result.data.id} |\n`;

  return md;
}

export async function deleteBetaGroup(betaGroupId: string): Promise<string> {
  validateId(betaGroupId, 'betaGroupId');

  await ascDelete(`/v1/betaGroups/${betaGroupId}`);

  return `## Beta Group Deleted\n\n**Group** \`${betaGroupId}\` deleted successfully.`;
}
