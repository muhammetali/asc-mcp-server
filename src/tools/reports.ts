import { ascGetReport } from '../client.js';
import { validateId } from '../validation.js';

type ReportFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
type ReportSubType = 'SUMMARY' | 'DETAILED' | 'OPT_IN';

export async function getSalesReport(
  vendorNumber: string,
  frequency: ReportFrequency = 'DAILY',
  reportDate: string,
  reportSubType: ReportSubType = 'SUMMARY'
): Promise<string> {
  validateId(vendorNumber, 'vendorNumber');
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(reportDate)) {
    throw new Error(`Invalid reportDate: "${reportDate}". Use YYYY-MM-DD for daily or YYYY-MM for monthly/yearly.`);
  }

  const params = new URLSearchParams({
    'filter[frequency]': frequency,
    'filter[reportDate]': reportDate,
    'filter[reportSubType]': reportSubType,
    'filter[reportType]': 'SALES',
    'filter[vendorNumber]': vendorNumber,
  });

  const url = `https://api.appstoreconnect.apple.com/v1/salesReports?${params.toString()}`;

  try {
    const csvData = await ascGetReport(url);

    // Parse TSV (Tab-separated)
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      return `## Sales Report (${frequency} - ${reportDate})\n\nNo data available for this period.`;
    }

    const headers = lines[0].split('\t');
    const rows = lines.slice(1).map(line => line.split('\t'));

    let md = `## Sales Report: ${frequency} - ${reportDate}\n\n`;

    // Key metrics summary
    let totalUnits = 0;
    let totalProceeds = 0;
    const byProduct: Record<string, { units: number; proceeds: number }> = {};

    const unitsIdx = headers.indexOf('Units');
    const proceedsIdx = headers.indexOf('Developer Proceeds');
    const titleIdx = headers.indexOf('Title');
    const skuIdx = headers.indexOf('SKU');
    const typeIdx = headers.indexOf('Product Type Identifier');

    for (const row of rows) {
      const units = parseInt(row[unitsIdx] || '0', 10);
      const proceeds = parseFloat(row[proceedsIdx] || '0');
      const title = row[titleIdx] || 'Unknown';

      totalUnits += units;
      totalProceeds += proceeds;

      if (!byProduct[title]) byProduct[title] = { units: 0, proceeds: 0 };
      byProduct[title].units += units;
      byProduct[title].proceeds += proceeds;
    }

    md += `### Summary\n\n`;
    md += `| Metric | Value |\n`;
    md += `|--------|-------|\n`;
    md += `| **Total Units** | ${totalUnits} |\n`;
    md += `| **Total Proceeds** | $${totalProceeds.toFixed(2)} |\n`;
    md += `| **Products** | ${Object.keys(byProduct).length} |\n`;
    md += `| **Rows** | ${rows.length} |\n`;

    // By product
    md += `\n### By Product\n\n`;
    md += `| Product | Units | Proceeds |\n`;
    md += `|---------|-------|----------|\n`;
    for (const [title, data] of Object.entries(byProduct)) {
      md += `| ${title} | ${data.units} | $${data.proceeds.toFixed(2)} |\n`;
    }

    // Detailed data (first 20 rows)
    if (rows.length > 0) {
      md += `\n### Detail (first ${Math.min(20, rows.length)} rows)\n\n`;
      // Show relevant columns
      const showCols = ['Title', 'SKU', 'Product Type Identifier', 'Units', 'Developer Proceeds', 'Currency of Proceeds', 'Country Code'];
      const colIdxs = showCols.map(c => headers.indexOf(c)).filter(i => i >= 0);

      md += `| ${colIdxs.map(i => headers[i]).join(' | ')} |\n`;
      md += `| ${colIdxs.map(() => '---').join(' | ')} |\n`;

      for (const row of rows.slice(0, 20)) {
        md += `| ${colIdxs.map(i => row[i] || '-').join(' | ')} |\n`;
      }
    }

    return md;
  } catch (error: any) {
    if (error.message?.includes('404') || error.status === 404) {
      return `## Sales Report (${frequency} - ${reportDate})\n\nNo report available for this date. Reports are typically available:\n- Daily: ~5 AM UTC next day\n- Weekly: Sunday for previous week\n- Monthly: ~5th of following month`;
    }
    throw error;
  }
}

export async function getFinancialReport(
  vendorNumber: string,
  regionCode: string,
  reportDate: string
): Promise<string> {
  validateId(vendorNumber, 'vendorNumber');
  validateId(regionCode, 'regionCode');

  const params = new URLSearchParams({
    'filter[regionCode]': regionCode,
    'filter[reportDate]': reportDate,
    'filter[reportType]': 'FINANCIAL',
    'filter[vendorNumber]': vendorNumber,
  });

  const url = `https://api.appstoreconnect.apple.com/v1/financeReports?${params.toString()}`;

  try {
    const csvData = await ascGetReport(url);
    const lines = csvData.trim().split('\n');

    if (lines.length < 2) {
      return `## Financial Report (${regionCode} - ${reportDate})\n\nNo data available.`;
    }

    let md = `## Financial Report: ${regionCode} - ${reportDate}\n\n`;
    md += '```\n';
    md += csvData.slice(0, 3000); // Limit output
    md += '\n```\n';

    return md;
  } catch (error: any) {
    if (error.message?.includes('404') || error.status === 404) {
      return `## Financial Report (${regionCode} - ${reportDate})\n\nNo report available for this date/region.`;
    }
    throw error;
  }
}
