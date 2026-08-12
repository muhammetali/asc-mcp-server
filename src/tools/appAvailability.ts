import { ascGet, ascPatch, ascPost, type ASCResponse } from '../client.js';
import { validateId } from '../validation.js';
import { getAppAvailabilityId, listTerritoryAvailabilities } from './appManagement.js';

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

  // Get app price schedule. `appPricePoints` is NOT a fields-selectable
  // relation of this resource — Apple moved actual price-point values
  // (currency, customer price) to the separate `/v3/appPricePoints/{id}`
  // resource. Requesting `fields[appPricePoints]` here 400s with
  // "not a valid type name" (confirmed live 2026-08-12) — verified against
  // Apple's official OpenAPI spec (fields[] enum for this endpoint is only
  // appPriceSchedules/apps/territories/appPrices). This function only ever
  // rendered startDate/endDate/Price ID below, never an actual price value,
  // so removing the invalid param doesn't drop anything from the output.
  const result = await ascGet<ASCResponse>(`/v1/apps/${appId}/appPriceSchedule`, {
    'include': 'manualPrices,automaticPrices',
    'fields[appPrices]': 'startDate,endDate',
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

  // Also try to get territories. `/v1/apps/{id}/availableTerritories` (the
  // old call here) doesn't exist anywhere in Apple's current API — this was
  // ALWAYS hitting the catch block below and silently printing "Could not
  // fetch territory data" for every app, every time. Reuses the same v2
  // (appAvailabilityV2 -> territoryAvailabilities) lookup as
  // manageAppAvailability, since it's the same underlying resource.
  try {
    const availabilityId = await getAppAvailabilityId(appId);
    const territories = await listTerritoryAvailabilities(availabilityId);

    const codes = territories.filter((t) => t.available).map((t) => t.territoryCode).sort();
    if (codes.length > 0) {
      md += `\n### Available Territories (${codes.length})\n\n`;
      md += codes.join(', ') + '\n';
    }
  } catch {
    md += `\n> Could not fetch territory data.\n`;
  }

  return md;
}
