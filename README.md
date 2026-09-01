# 🍏 App Store Connect MCP Server

[![npm version](https://img.shields.io/npm/v/asc-mcp-server.svg)](https://npmjs.org/package/asc-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io/)

A powerful [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for managing iOS app releases, TestFlight distribution, screenshots, and review submissions **directly from your AI Assistant** (Claude, Gemini, etc.).

No more clicking through App Store Connect for 20 minutes just to submit a new version. Let your AI agent handle the deployment pipeline.

> "Claude, distribute the latest build to the Internal Testers group."
> "Gemini, create version 2.1.0, attach the newest build, and submit it for review."
> "Claude, what was the reason for our last App Store rejection?"

---

## 🌟 Key Features

*   🚀 **End-to-end Releases:** Create versions, assign builds, update "What's New", and submit for review.
*   ✈️ **TestFlight Automation:** Distribute builds to beta groups and manage testers.
*   🖼️ **Metadata & Screenshots:** Update app descriptions, keywords, privacy policies, and upload/delete screenshots.
*   📊 **Financials & Sales:** Fetch daily/weekly sales and financial reports.
*   🛡️ **Pre-flight Checks:** Built-in error handling and submission pre-flight validation.

## 🛠️ Provided Tools

### 📦 Apps & Metadata
*   `asc_list_apps` - List all apps under your account
*   `asc_get_app_info` - Detailed app info (privacy policy, age rating, localizations)
*   `asc_update_app_info_localization` - Update privacy policy URL, name, subtitle per locale

### 🚀 Versions & Release
*   `asc_list_versions` - Fetch all versions with states (LIVE, DRAFT, REJECTED, etc.)
*   `asc_create_version` - Create a new App Store version
*   `asc_update_whats_new` - Batch update "What's New" for all locales
*   `asc_update_version_localization` - Update single locale metadata (description, keywords)
*   `asc_get_version_localizations` - View all locale metadata
*   `asc_assign_build` - Attach a TestFlight build to a version

### ✈️ Builds & TestFlight
*   `asc_list_builds` - View recent builds and their processing status
*   `asc_get_build_details` - Detailed build info
*   `asc_list_beta_groups` - List TestFlight beta groups
*   `asc_add_build_to_beta_group` - Distribute build to a specific tester group
*   `asc_set_testflight_whats_new` - Set TestFlight release notes
*   `asc_get_testflight_feedback` - Pull tester screenshot + crash feedback (text, device, OS, tester, build) so an AI agent can triage it

### 🔍 Review & Submission
*   `asc_get_review_submission` - Check review status, demo account, and rejection info
*   `asc_update_review_detail` - Set demo account, reviewer notes, contact info
*   `asc_submit_for_review` - Submit version for review (with pre-flight checks)
*   `asc_get_rejection_reasons` - View recent rejection reasons and resolutions

### 📊 Reports
*   `asc_sales_report` - Sales data (daily/weekly/monthly)
*   `asc_financial_report` - Financial reports by region

### 📸 Screenshots
*   `asc_list_screenshot_sets` - View screenshot sets
*   `asc_upload_screenshot` - 3-step upload automation (reserve, upload, commit)
*   `asc_delete_screenshot` - Delete a single screenshot
*   `asc_delete_all_screenshots` - Clear an entire screenshot set

---

## ⚙️ Quick Start

### 1. Generate App Store Connect API Keys
1. Go to [App Store Connect > Users and Access > Keys](https://appstoreconnect.apple.com/access/api).
2. Generate an **App Store Connect API Key** with **App Manager** or **Admin** access.
3. Download the `.p8` file. You will also need the `Key ID` and `Issuer ID`.

### 2. Installation

Clone this repository and build:
```bash
git clone https://github.com/YOUR_USERNAME/asc-mcp-server.git
cd asc-mcp-server
npm install
npm run build
```

### 3. Connect to Claude Code (or any MCP Client)

Use the `claude mcp add` command to inject this server into your Claude environment:

```bash
claude mcp add asc-mcp -- node /path/to/asc-mcp-server/dist/index.js
```

Then configure the environment variables in your Claude settings (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "asc-mcp": {
      "command": "node",
      "args": ["/path/to/asc-mcp-server/dist/index.js"],
      "env": {
        "APP_STORE_CONNECT_KEY_ID": "YOUR_KEY_ID",
        "APP_STORE_CONNECT_ISSUER_ID": "YOUR_ISSUER_ID",
        "APP_STORE_CONNECT_P8_PATH": "/path/to/AuthKey_YOUR_KEY_ID.p8"
      }
    }
  }
}
```

---

## 🤖 AI Workflow Examples

### 1. New Release Pipeline
Just tell your AI: *"Prepare the latest build for release. Create version 2.1.0, attach the build, update the release notes, set the demo account password, and submit it for review."*

The AI will sequentially execute:
`asc_list_builds` -> `asc_create_version` -> `asc_update_whats_new` -> `asc_assign_build` -> `asc_update_review_detail` -> `asc_submit_for_review`

### 2. Handle Rejections
*"Why was our app rejected? Read the rejection reason, let me fix the code, then update the review notes explaining the fix and resubmit."*

### 3. Quick TestFlight Push
*"Distribute the newest build to the 'Internal Testers' group and set the notes to 'Added dark mode'."*

### 4. Triage Beta Feedback
*"What are TestFlight testers saying about the latest build? Summarize the crashes and complaints."*

The AI will call `asc_get_testflight_feedback` and summarize the screenshot + crash submissions for you.

### 5. Auto-Generate Release Notes from Git
*"Look at the commits since our last tag, write user-friendly release notes from them (no commit-speak), and push them as the What's New text."*

The AI reads your local git history, drafts copy, then calls `asc_update_whats_new` (and can loop over each locale via `asc_update_version_localization`).

### 6. ASO Keyword Refresh
*"Pull our current App Store keywords, research what's trending for our category, and update the keyword field with a stronger 100-character set."*

The AI calls `asc_get_version_localizations` to read the current keywords, then `asc_update_version_localization` to write the new ones back.

### 7. Auto-Respond to Reviews
*"Reply to this week's 1 and 2-star reviews with a genuinely helpful, empathetic response."*

The AI calls `asc_list_customer_reviews`, drafts a reply per review, then posts each one with `asc_respond_to_review`.

## 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
