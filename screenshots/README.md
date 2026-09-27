# Screenshots

Real screens of the Namzilabs app (the dashboard, the flow builder, the apps page and so on), so Claude can see exactly how the product looks before building anything with it.

## How to upload

1. Open this folder on GitHub: `screenshots/` on the `claude/laughing-wozniak-zg8a1n` branch (the repo's only branch right now).
2. **Add file → Upload files**, drag the images in, then **Commit changes**.
3. Tell Claude they're in. Claude pulls them, sorts them into subfolders by area, renames them for what they show, and catalogues them.

No special names or order needed. PNG straight from the screenshot tool is best: no resizing, cropping or arrows. The web uploader takes files up to 25 MB each, so it can take short screen recordings (MP4 or MOV) too.

## Read this first: this repo is public

Anyone on the internet can see what lands here. Before uploading, either use a demo workspace with example data, or make the repo private (Settings → General → Danger Zone → Change visibility).

Never upload, even to a private repo:

- real customers' names, emails or phone numbers
- a real client's revenue or other numbers, unless you have their permission
- API keys, webhook URLs, signing secrets, or your referral link
- billing pages or anything from the admin console

If the workspace name at the top of the sidebar is a client's, blur it before uploading. Blurring it later in a crop doesn't help, because the original file stays public.

## How to take them

- Chrome at 100% zoom, bookmarks bar and extensions hidden.
- Capture the window, not the whole screen (Mac: ⌘⇧4, then Space, then click the window).
- Take the same screen in more than one theme if you can. The app has three (light, mix with the dark rail, and dark), and dark is the one there are no real captures of yet.
- Screen recordings are gold: 10 to 30 seconds of one action (building a metric, switching views, opening a number's working).

## Most useful to capture

Claude has already seen the twelve screens in `namzilabsposts/screenshots/app/`, all in the mix theme (Overview, Calls, Money, Leads, a custom view, Calendar, Flows, three flow-builder states, Apps, Invite & earn). Screens not covered yet:

| # | Screen | Why |
|---|---|---|
| 1 | The dashboard views in **dark** mode | No real dark captures exist yet |
| 2 | A flow being built: Get data → Match → Filter → Summarize, with the side panel's **Test** tab showing records | The core "build any metric" moment |
| 3 | What you see when you open a number: its sources, what was matched, what was left out | The "every number shows its working" proof |
| 4 | Adding a tile to the board, and the tile settings panel | How metrics reach the dashboard |
| 5 | A connection's page (health, sync status, preview), with secrets hidden | "Connect your tools" |
| 6 | Activity, Settings (members and roles, AI assistants), Profile | The rest of the app |
| 7 | First run: a fresh workspace, the get-started checklist, the tour | What a new user sees |
| 8 | Sign up, log in, onboarding, pricing, an upgrade prompt | The way in |
| 9 | The app on a phone | Vertical video framing |
| 10 | Screen recordings of any of the above | Source footage |

Capture what exists and skip what doesn't.
