import { ascGet, type ASCResponse } from '../client.js';
import { validateId } from '../validation.js';

export async function getTestFlightFeedback(appId: string): Promise<string> {
  validateId(appId, 'appId');

  // Fetch screenshot submissions (which contain general text feedback + optional screenshots)
  const screenshotResult = await ascGet<ASCResponse>(
    `/v1/betaFeedbackScreenshotSubmissions?filter[build.app]=${appId}&include=tester,build`,
    {}
  ).catch((e: any) => ({ data: [], included: [], error: e.message }));

  // Fetch crash submissions (which contain crash info + tester comments)
  const crashResult = await ascGet<ASCResponse>(
    `/v1/betaFeedbackCrashSubmissions?filter[build.app]=${appId}&include=tester,build`,
    {}
  ).catch((e: any) => ({ data: [], included: [], error: e.message }));

  const screenshots = screenshotResult.data || [];
  const crashes = crashResult.data || [];
  const included = [
    ...(screenshotResult.included || []),
    ...(crashResult.included || [])
  ];

  if (screenshots.length === 0 && crashes.length === 0) {
    let msg = `## TestFlight Beta Feedback\n\nNo feedback found for app \`${appId}\`.`;
    if ((screenshotResult as any).error) msg += `\n\nError (Screenshots): ${(screenshotResult as any).error}`;
    if ((crashResult as any).error) msg += `\n\nError (Crashes): ${(crashResult as any).error}`;
    return msg;
  }

  let md = `## TestFlight Beta Feedback\n\n`;
  md += `**App ID:** \`${appId}\`\n\n`;

  // Process Screenshot Submissions (General Feedback)
  if (screenshots.length > 0) {
    md += `### Feedback & Screenshot Submissions (${screenshots.length})\n\n`;
    for (const item of screenshots) {
      const attrs = item.attributes || {};
      const feedbackText = attrs.feedback || 'No text provided';
      const osVersion = attrs.osVersion || '-';
      const device = attrs.device || '-';
      
      const testerRef = item.relationships?.tester?.data;
      const buildRef = item.relationships?.build?.data;
      
      let testerInfo = 'Unknown Tester';
      if (testerRef) {
        const testerObj = included.find(i => i.type === 'betaTesters' && i.id === testerRef.id);
        if (testerObj) {
          testerInfo = `${testerObj.attributes.email || testerObj.attributes.firstName || testerObj.id}`;
        }
      }

      let buildInfo = 'Unknown Build';
      if (buildRef) {
        const buildObj = included.find(i => i.type === 'builds' && i.id === buildRef.id);
        if (buildObj) {
          buildInfo = `${buildObj.attributes.version} (${buildObj.attributes.buildVersion})`;
        }
      }

      md += `**Tester:** ${testerInfo} | **Build:** ${buildInfo} | **Device:** ${device} (${osVersion})\n`;
      md += `> ${feedbackText.replace(/\\n/g, '\n> ')}\n\n`;
    }
  }

  // Process Crash Submissions
  if (crashes.length > 0) {
    md += `### Crash Submissions (${crashes.length})\n\n`;
    for (const item of crashes) {
      const attrs = item.attributes || {};
      const feedbackText = attrs.feedback || 'No text provided';
      const osVersion = attrs.osVersion || '-';
      const device = attrs.device || '-';
      
      const testerRef = item.relationships?.tester?.data;
      const buildRef = item.relationships?.build?.data;
      
      let testerInfo = 'Unknown Tester';
      if (testerRef) {
        const testerObj = included.find(i => i.type === 'betaTesters' && i.id === testerRef.id);
        if (testerObj) {
          testerInfo = `${testerObj.attributes.email || testerObj.attributes.firstName || testerObj.id}`;
        }
      }

      let buildInfo = 'Unknown Build';
      if (buildRef) {
        const buildObj = included.find(i => i.type === 'builds' && i.id === buildRef.id);
        if (buildObj) {
          buildInfo = `${buildObj.attributes.version} (${buildObj.attributes.buildVersion})`;
        }
      }

      md += `**Tester:** ${testerInfo} | **Build:** ${buildInfo} | **Device:** ${device} (${osVersion})\n`;
      md += `> ${feedbackText.replace(/\\n/g, '\n> ')}\n\n`;
    }
  }

  return md;
}
