import { ascGet, ascPost, type ASCResponse } from '../client.js';
import { validateId } from '../validation.js';

export async function getBuildDiagnostics(buildId: string): Promise<string> {
  validateId(buildId, 'buildId');

  const result = await ascGet<ASCResponse>(`/v1/builds/${buildId}/diagnosticSignatures`, {
    'fields[diagnosticSignatures]': 'diagnosticType,signature,weight',
  });

  const signatures = result.data || [];

  if (!Array.isArray(signatures) || signatures.length === 0) {
    return `## Build Diagnostics\n\nNo diagnostic signatures found for build \`${buildId}\`.`;
  }

  let md = `## Build Diagnostics\n\n`;
  md += `**Build:** \`${buildId}\`\n`;
  md += `**Signatures Found:** ${signatures.length}\n\n`;
  md += `| # | Diagnostic Type | Signature | Weight |\n`;
  md += `|---|----------------|-----------|--------|\n`;

  for (let i = 0; i < signatures.length; i++) {
    const sig = signatures[i];
    const a = sig.attributes;
    const sigPreview = a.signature ? (a.signature.length > 60 ? a.signature.slice(0, 60) + '...' : a.signature) : '-';
    md += `| ${i + 1} | ${a.diagnosticType || '-'} | ${sigPreview} | ${a.weight ?? '-'} |\n`;
  }

  // Fetch logs for top signatures in parallel (limit to 10 to avoid rate limits)
  const topSignatures = signatures.slice(0, 10);
  const logResults = await Promise.allSettled(
    topSignatures.map(async (sig: any) => {
      const logsResult = await ascGet<ASCResponse>(`/v1/diagnosticSignatures/${sig.id}/logs`, {
        'fields[diagnosticLogs]': 'diagnosticType,isSimulated',
      });
      return { sig, logs: logsResult.data || [] };
    })
  );

  md += `\n### Diagnostic Logs\n\n`;

  for (const result of logResults) {
    if (result.status === 'rejected') {
      md += `Unable to fetch logs for a signature.\n\n`;
      continue;
    }
    const { sig, logs } = result.value;
    const a = sig.attributes;
    md += `#### ${a.diagnosticType || 'Unknown'} (weight: ${a.weight ?? '-'})\n\n`;

    if (!Array.isArray(logs) || logs.length === 0) {
      md += `No logs available for this signature.\n\n`;
    } else {
      md += `| Log ID | Diagnostic Type | Simulated |\n`;
      md += `|--------|----------------|-----------|\n`;
      for (const log of logs) {
        const la = log.attributes;
        md += `| \`${log.id}\` | ${la.diagnosticType || '-'} | ${la.isSimulated ? 'Yes' : 'No'} |\n`;
      }
      md += `\n`;
    }
  }

  if (signatures.length > 10) {
    md += `> Showing logs for top 10 of ${signatures.length} signatures.\n`;
  }

  return md;
}

export async function getPerfPowerMetrics(
  appId: string,
  metricType?: string,
  platform?: string
): Promise<string> {
  validateId(appId, 'appId');

  const validMetricTypes = ['DISK', 'HANG', 'BATTERY', 'LAUNCH', 'MEMORY', 'ANIMATION', 'TERMINATION'];

  if (metricType && !validMetricTypes.includes(metricType)) {
    throw new Error(`Invalid metricType: "${metricType}". Valid types: ${validMetricTypes.join(', ')}.`);
  }

  const params: Record<string, string> = {};
  if (metricType) {
    params['filter[metricType]'] = metricType;
  }
  if (platform) {
    params['filter[platform]'] = platform;
  }

  const result = await ascGet<ASCResponse>(`/v1/apps/${appId}/perfPowerMetrics`, params);

  const metrics = result.data || [];

  if (!Array.isArray(metrics) || metrics.length === 0) {
    let msg = `## Performance & Power Metrics\n\nNo metrics found for app \`${appId}\`.`;
    if (metricType) msg += ` (filter: ${metricType})`;
    if (platform) msg += ` (platform: ${platform})`;
    return msg;
  }

  let md = `## Performance & Power Metrics\n\n`;
  md += `**App:** \`${appId}\`\n`;
  if (metricType) md += `**Filter:** ${metricType}\n`;
  if (platform) md += `**Platform:** ${platform}\n`;
  md += `**Metrics Found:** ${metrics.length}\n\n`;

  for (const metric of metrics) {
    const a = metric.attributes;
    md += `### ${a.metricType || metric.type || 'Unknown Metric'}\n\n`;

    if (a.datasets && Array.isArray(a.datasets)) {
      for (const dataset of a.datasets) {
        md += `**${dataset.filterCriteria?.device || ''} ${dataset.filterCriteria?.percentile || ''}**\n\n`;
        if (dataset.points && Array.isArray(dataset.points)) {
          md += `| Date | Value | Unit |\n`;
          md += `|------|-------|------|\n`;
          for (const point of dataset.points.slice(0, 10)) {
            const version = point.version || '-';
            const value = point.value ?? '-';
            const unit = dataset.unit || a.unit || '-';
            md += `| ${version} | ${value} | ${unit} |\n`;
          }
          if (dataset.points.length > 10) {
            md += `\n> Showing 10 of ${dataset.points.length} data points.\n`;
          }
          md += `\n`;
        }
      }
    } else {
      md += `No dataset details available.\n\n`;
    }
  }

  return md;
}

export async function requestAnalyticsReport(
  appId: string,
  category: string
): Promise<string> {
  validateId(appId, 'appId');

  const validCategories = ['APP_USAGE', 'APP_STORE_ENGAGEMENT', 'COMMERCE', 'FRAMEWORK_USAGE', 'PERFORMANCE'];

  if (!validCategories.includes(category)) {
    throw new Error(`Invalid category: "${category}". Valid categories: ${validCategories.join(', ')}.`);
  }

  const result = await ascPost<ASCResponse>('/v1/analyticsReportRequests', {
    data: {
      type: 'analyticsReportRequests',
      attributes: {
        accessType: 'ONE_TIME_SNAPSHOT',
        category,
      },
      relationships: {
        app: {
          data: { type: 'apps', id: appId },
        },
      },
    },
  });

  const requestId = result.data.id;
  const attrs = result.data.attributes || {};

  let md = `## Analytics Report Requested\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Request ID** | \`${requestId}\` |\n`;
  md += `| **App** | \`${appId}\` |\n`;
  md += `| **Category** | ${category} |\n`;
  md += `| **Access Type** | ONE_TIME_SNAPSHOT |\n`;
  if (attrs.stoppedDueToInactivity !== undefined) {
    md += `| **Stopped Due To Inactivity** | ${attrs.stoppedDueToInactivity} |\n`;
  }
  md += `\n**Next:** Use \`getAnalyticsReport\` with request ID \`${requestId}\` to check status and download reports once they are ready.`;

  return md;
}

export async function getAnalyticsReport(requestId: string): Promise<string> {
  validateId(requestId, 'requestId');

  const result = await ascGet<ASCResponse>(`/v1/analyticsReportRequests/${requestId}`, {
    'include': 'reports,reports.instances',
  });

  const request = result.data;
  const attrs = request.attributes || {};
  const included = result.included || [];

  let md = `## Analytics Report\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Request ID** | \`${requestId}\` |\n`;
  if (attrs.accessType) md += `| **Access Type** | ${attrs.accessType} |\n`;
  if (attrs.category) md += `| **Category** | ${attrs.category} |\n`;
  if (attrs.stoppedDueToInactivity !== undefined) {
    md += `| **Stopped Due To Inactivity** | ${attrs.stoppedDueToInactivity} |\n`;
  }

  // Find reports in included resources
  const reports = included.filter((i: any) => i.type === 'analyticsReports');
  const instances = included.filter((i: any) => i.type === 'analyticsReportInstances');

  if (reports.length === 0) {
    md += `\n> **Status:** No reports available yet. The report may still be processing. Try again later.\n`;
    return md;
  }

  md += `\n### Available Reports (${reports.length})\n\n`;

  for (const report of reports) {
    const ra = report.attributes || {};
    md += `#### ${ra.name || 'Report'}\n\n`;
    md += `| Field | Value |\n`;
    md += `|-------|-------|\n`;
    md += `| **Report ID** | \`${report.id}\` |\n`;
    if (ra.category) md += `| **Category** | ${ra.category} |\n`;
    if (ra.name) md += `| **Name** | ${ra.name} |\n`;

    // Find instances for this report
    const reportInstanceData = report.relationships?.instances?.data || [];
    const reportInstanceIds: any[] = Array.isArray(reportInstanceData) ? reportInstanceData : [reportInstanceData];
    const reportInstances = reportInstanceIds
      .map((ref: any) => instances.find((inst: any) => inst.id === ref.id))
      .filter((x: any): x is any => Boolean(x));

    if (reportInstances.length > 0) {
      md += `\n**Instances:**\n\n`;
      md += `| Instance ID | Granularity | Processing Date | Download URL |\n`;
      md += `|-------------|-------------|-----------------|-------------|\n`;

      for (const inst of reportInstances) {
        const ia = inst.attributes || {};
        const granularity = ia.granularity || '-';
        const processingDate = ia.processingDate || '-';
        const segments = ia.segments || [];

        if (segments.length > 0) {
          for (const seg of segments) {
            const url = seg.url || '-';
            const urlPreview = url.length > 60 ? url.slice(0, 60) + '...' : url;
            md += `| \`${inst.id}\` | ${granularity} | ${processingDate} | ${urlPreview} |\n`;
          }
        } else {
          md += `| \`${inst.id}\` | ${granularity} | ${processingDate} | No download URL available |\n`;
        }
      }
      md += `\n`;
    } else {
      md += `\nNo instances available for this report.\n\n`;
    }
  }

  return md;
}
