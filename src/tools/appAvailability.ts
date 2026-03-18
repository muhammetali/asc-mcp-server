import { ascGet, ascPatch, ascPost, type ASCResponse } from '../client.js';
import { validateId } from '../validation.js';

export async function listInAppPurchases(appId: string): Promise<string> {
  validateId(appId, 'appId');

  const result = await ascGet<ASCResponse>(`/v1/apps/${appId}/inAppPurchasesV2`, {
    'fields[inAppPurchases]': 'name,productId,inAppPurchaseType,state,reviewNote',
    'limit': '100',
  });

  if (!result.data || result.data.length === 0) {
    return `## In-App Purchases\n\nNo in-app purchases found for app \`${appId}\`.`;
  }

  let md = `## In-App Purchases (${result.data.length})\n\n`;
  md += `| Name | Product ID | Type | State | IAP ID |\n`;
  md += `|------|-----------|------|-------|--------|\n`;

  for (const iap of result.data) {
    const a = iap.attributes;
    md += `| ${a.name} | ${a.productId} | ${a.inAppPurchaseType} | ${a.state} | \`${iap.id}\` |\n`;
  }

  // Summary by type
  const byType: Record<string, number> = {};
  for (const iap of result.data) {
    const t = iap.attributes.inAppPurchaseType;
    byType[t] = (byType[t] || 0) + 1;
  }

  md += `\n**Summary:** `;
  md += Object.entries(byType).map(([t, c]) => `${c} ${t}`).join(', ');

  return md;
}

export async function listSubscriptionGroups(appId: string): Promise<string> {
  validateId(appId, 'appId');

  const result = await ascGet<ASCResponse>(`/v1/apps/${appId}/subscriptionGroups`, {
    'fields[subscriptionGroups]': 'referenceName',
    'include': 'subscriptions',
    'fields[subscriptions]': 'name,productId,state,subscriptionPeriod,groupLevel,reviewNote',
    'limit': '50',
  });

  if (!result.data || result.data.length === 0) {
    return `## Subscription Groups\n\nNo subscription groups found for app \`${appId}\`.`;
  }

  // Map subscriptions by group
  const subsMap = new Map<string, any[]>();
  for (const inc of (result.included || [])) {
    if (inc.type === 'subscriptions') {
      // find which group owns this
      for (const group of result.data) {
        const groupSubs = group.relationships?.subscriptions?.data || [];
        if (groupSubs.some((s: any) => s.id === inc.id)) {
          if (!subsMap.has(group.id)) subsMap.set(group.id, []);
          subsMap.get(group.id)!.push(inc);
        }
      }
    }
  }

  let md = `## Subscription Groups (${result.data.length})\n\n`;

  for (const group of result.data) {
    md += `### ${group.attributes.referenceName}\n`;
    md += `**Group ID:** \`${group.id}\`\n\n`;

    const subs = subsMap.get(group.id) || [];
    if (subs.length === 0) {
      md += `No subscriptions in this group.\n\n`;
    } else {
      md += `| Name | Product ID | State | Period | Level |\n`;
      md += `|------|-----------|-------|--------|-------|\n`;
      for (const sub of subs) {
        const a = sub.attributes;
        md += `| ${a.name} | ${a.productId} | ${a.state} | ${a.subscriptionPeriod || '-'} | ${a.groupLevel || '-'} |\n`;
      }
      md += `\n`;
    }
  }

  return md;
}

export async function getAppPricing(appId: string): Promise<string> {
  validateId(appId, 'appId');

  // Get app price schedule
  const result = await ascGet<ASCResponse>(`/v1/apps/${appId}/appPriceSchedule`, {
    'include': 'manualPrices,automaticPrices',
    'fields[appPrices]': 'startDate,endDate',
    'fields[appPricePoints]': 'customerPrice,proceeds,priceTier',
  });

  let md = `## App Pricing: \`${appId}\`\n\n`;

  if (result.data) {
    const manualPrices = (result.included || []).filter((i: any) => i.type === 'appPrices');
    if (manualPrices.length > 0) {
      md += `### Price Schedule\n\n`;
      md += `| Start Date | End Date | Price ID |\n`;
      md += `|-----------|----------|----------|\n`;
      for (const price of manualPrices) {
        const a = price.attributes;
        md += `| ${a.startDate || '-'} | ${a.endDate || 'Ongoing'} | \`${price.id}\` |\n`;
      }
    }
  }

  // Also try to get territories
  try {
    const territories = await ascGet<ASCResponse>(`/v1/apps/${appId}/availableTerritories`, {
      'limit': '200',
    });

    if (territories.data && territories.data.length > 0) {
      md += `\n### Available Territories (${territories.data.length})\n\n`;
      const codes = territories.data.map((t: any) => t.id).sort();
      md += codes.join(', ') + '\n';
    }
  } catch {
    md += `\n> Could not fetch territory data.\n`;
  }

  return md;
}
