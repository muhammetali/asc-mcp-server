# ASC MCP Server

App Store Connect MCP Server for managing iOS app releases, TestFlight, screenshots, and review submissions directly from Claude Code.

## Features

### Apps & Metadata
- **asc_list_apps** - List all apps
- **asc_get_app_info** - Detailed app info (privacy policy, age rating, localizations)
- **asc_update_app_info_localization** - Update privacy policy URL, name, subtitle per locale

### Versions & Release
- **asc_list_versions** - All versions with states (LIVE, DRAFT, REJECTED, etc.)
- **asc_create_version** - Create new App Store version
- **asc_update_whats_new** - Batch update What's New for all locales
- **asc_update_version_localization** - Update single locale (description, keywords, etc.)
- **asc_get_version_localizations** - View all locale metadata
- **asc_assign_build** - Attach a build to a version

### Builds & TestFlight
- **asc_list_builds** - Recent builds with processing/TestFlight status
- **asc_get_build_details** - Detailed build info
- **asc_list_beta_groups** - TestFlight beta groups
- **asc_add_build_to_beta_group** - Distribute build to testers
- **asc_set_testflight_whats_new** - Set TestFlight release notes

### Review & Submission
- **asc_get_review_submission** - Review status, demo account, rejection info
- **asc_update_review_detail** - Set demo account, reviewer notes, contact info
- **asc_submit_for_review** - Submit with pre-flight checks
- **asc_get_rejection_reasons** - Recent rejections with common GoyGoyChat patterns

### Reports
- **asc_sales_report** - Sales data (daily/weekly/monthly)
- **asc_financial_report** - Financial reports by region

### Screenshots
- **asc_list_screenshot_sets** - View screenshot sets
- **asc_upload_screenshot** - 3-step upload (reserve, upload, commit)
- **asc_delete_screenshot** - Delete single screenshot
- **asc_delete_all_screenshots** - Clear entire screenshot set

## Setup

### 1. Install dependencies

```bash
cd tools/asc-mcp-server
npm install
```

### 2. Configure credentials

```bash
cp .env.example .env
```

Edit `.env`:
```
APP_STORE_CONNECT_KEY_ID=K6A6484965
APP_STORE_CONNECT_ISSUER_ID=018dec16-3615-432d-9441-f548f1b4c0f3
APP_STORE_CONNECT_P8_PATH=/home/mali/Development/falla-clone/AuthKey_K6A6484965.p8
```

### 3. Build

```bash
npm run build
```

### 4. Add to Claude Code

```bash
claude mcp add asc-mcp -- node /home/mali/Development/falla-clone/tools/asc-mcp-server/dist/index.js
```

Or add to your Claude Code settings (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "asc-mcp": {
      "command": "node",
      "args": ["/home/mali/Development/falla-clone/tools/asc-mcp-server/dist/index.js"],
      "env": {
        "APP_STORE_CONNECT_KEY_ID": "K6A6484965",
        "APP_STORE_CONNECT_ISSUER_ID": "018dec16-3615-432d-9441-f548f1b4c0f3",
        "APP_STORE_CONNECT_P8_PATH": "/home/mali/Development/falla-clone/AuthKey_K6A6484965.p8"
      }
    }
  }
}
```

## Supported Locales

| Code | Language |
|------|----------|
| en-US | English |
| tr | Turkish |
| de-DE | German |
| es-MX | Spanish (Mexico) |
| fr-FR | French |
| ru | Russian |
| ar-SA | Arabic |

## Common Workflows

### New Release
```
1. asc_list_builds      -> Find the latest valid build
2. asc_create_version   -> Create v2.1.0
3. asc_update_whats_new -> Set release notes for all 7 locales
4. asc_assign_build     -> Attach the build
5. asc_update_review_detail -> Set demo account & notes
6. asc_submit_for_review    -> Submit!
```

### Handle Rejection
```
1. asc_get_rejection_reasons -> See what was rejected
2. asc_get_review_submission -> Check review details
3. Fix the issue in code
4. Upload new build via Xcode/CI
5. asc_list_builds -> Wait for processing
6. asc_assign_build -> Attach new build
7. asc_update_review_detail -> Update notes explaining the fix
8. asc_submit_for_review -> Resubmit
```

### Update Privacy Policy (Common Rejection Fix)
```
1. asc_get_app_info -> Check which locales are missing privacy policy
2. asc_update_app_info_localization -> Set privacy policy URL for each locale
```

### TestFlight Distribution
```
1. asc_list_builds -> Find your build
2. asc_list_beta_groups -> Find your tester group
3. asc_set_testflight_whats_new -> Set what changed
4. asc_add_build_to_beta_group -> Distribute!
```

## Error Handling

The server provides detailed error messages with:
- Apple error codes and descriptions
- Actionable suggestions for common errors
- Rate limit handling (429)
- Pre-flight checks before submission

## License

Private - GoyGoyChat Project
