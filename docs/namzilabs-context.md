# Namzilabs: product and visual context

A working reference for building anything that has to look and sound like Namzilabs. It was put together on 27 September 2026 from the product's code, its landing page, the social content repo, and renders and screenshots of the running app.

This repo is public, so this file only covers what's already visible to the public: the product as a user sees it, the look, and the published copy and content rules. Internals of the private product repo stay out.

**Sources of truth, in order:** the app's stylesheet (`src/app/globals.css` in namzilabsv2) wins over its design docs (`DESIGN.md`, `docs/BRAND_KIT.md`) when they disagree. For social content, `lib/brand.css` and `brand/BRAND_KIT.md` in namzilabsposts are the source.

---

## 1. What Namzilabs is

**All your data in one place.** Namzilabs connects the tools a business already runs on (calendar, CRM, outreach, payments, forms, calls, spreadsheets), matches the same person across all of them, and lets you build any metric from the combined data. The metrics land on one live dashboard, recompute on their own, and every number can show its working.

| Line | Where it's used |
|---|---|
| "All your data. One place." | Primary tagline (banners, site, lockup) |
| "Your best metrics live *between* your tools." | Landing page headline |
| "Zapier connects your apps. Namzilabs connects your numbers." | The short hook |
| "Namzilabs puts all your business data in one place, so you can build any metric or KPI from it, trust every number and see exactly where your funnel breaks." | One-liner |
| "Every number shows its *working*." | The proof line (receipts) |
| "Stop reconciling by *hand*." | Landing page closing call to action |
| "Free to start, no card." | The offer |

**Who it's for, in order:** (1) coaching and info-product sales teams with setters and closers (hero metric: show rate), (2) outbound and appointment-setting agencies (cost per held meeting), (3) creators with courses, communities and newsletters (revenue per subscriber), (4) e-commerce brands, later.

**How it works, as a user sees it:**

1. **Connect your tools.** Sign in with Google or paste an API key. It never edits your data. New records arrive within minutes and history backfills behind you. Each app syncs *Instant* (webhooks), *Scheduled* (polling) or both.
2. **Build the metric.** A flow on a canvas: get the records, narrow them down, turn them into a number. Test each step against real rows, then publish. No SQL.
3. **Watch it stay right.** Published metrics recompute every 10 minutes and show when they last ran, which sources they read, how many duplicates they matched, and what they left out and why.

**Sources:** the landing page and the app's Apps page read the count from the live catalogue (35 in the current build). The social content says 33, the live and connectable ones. Ad platforms (Meta, TikTok and Google Ads) are "coming soon". The categories are scheduling, CRM, outreach, payments, forms, calls, data and docs, and commerce.

**AI assistants:** Claude, ChatGPT or any MCP client can connect to a workspace and read its published metrics (read-only). Content treats this as "coming soon" until it's switched on in production.

**Referrals:** "Invite & earn". 1 invite = 1 month free, 3 = 3 months, 5 = 6 months, 10 = a year.

**Website:** namzilabs.co.

---

## 2. The repos

| Repo | Visibility | What it is |
|---|---|---|
| `eliascroesus/namzilabsv2` | private | **The product.** Next.js 16 app: the landing page, the app, connectors, sync engine, flow engine, dashboard |
| `eliascroesus/namzilabsposts` | public | **The social content factory.** HTML designs rendered to exact-size PNGs and 60fps MP4s: 56 posts, 14 videos, Instagram highlights, 35 banners, logo variants, the mascot, copy and strategy |
| `eliascroesus/namzilabs` | public | First prototype ("Namzi", July 2026). Superseded |
| `eliascroesus/namzilabs-gpt` | public | Second prototype ("Namzi Data", July 2026). Superseded |
| `eliascroesus/namzilabsclipper` | public | **This repo** |

---

## 3. The app, screen by screen

Screen size in all captures: 1728×960 CSS px at 2× (3456 px wide).

### The shell

- **Rail (left, 260 px wide):** workspace switcher at the top (a blue rounded square holding the workspace's initial, then the name and a chevron), a search box (⌘K), the caps caption "Main Menu", then **Dashboard** (with its views nested under it on a thin vertical line: Overview, Calls, Money, Leads…, then "Show all N"), **Activity**, **Flows**, **Apps** and **Settings**. At the bottom: the user's initials avatar with a settings cog, the **Invite & earn** card (deep blue gradient, gift icon, "1 invite = 1 month free", an arrow, and a slowly rotating light beam around its edge), and a full-width **+ New** button. On a phone the same rail opens as a drawer from a menu button.
- **Top bar (inside the content panel):** page title in 24 px bold, a dash, then the date window in muted text ("Mon, Jun 29 - Sat, Sep 26"). On the right: "Updated 4 hr ago", **Share** (link icon), a theme toggle (moon or sun), and a bell (a red count badge when something needs attention).
- **The content panel** sits inset 8 px from the window on the top, right and bottom, with rounded corners, so the rail frames it.
- **Icons** (lucide): Dashboard `LayoutDashboard`, Activity `Radio`, Flows `Workflow`, Apps `Plug`, Settings `Settings`, search `Search`, invite card `Gift` and `ArrowUpRight`, New `Plus`, Share `Link2`, theme `Moon` / `Sun`, notifications `Bell`.
- **Notifications:** the bell opens a side panel, "Needs attention", listing only broken or paused connections and failed metrics. When nothing is wrong it says "Everything is running".

### Themes

| Theme | What it looks like |
|---|---|
| **mix** (the default) | Near-black rail (`#121212`) beside a light content area (`#F3F3F3` page, white cards). Every real screenshot so far is this one |
| **light** | Everything light: `#F3F3F3` rail and page, white cards and top bar |
| **dark** ("the console") | Everything near-black: `#121212` ground, `#151515` cards and top bar, `#343434` hairlines, white numerals |

### Dashboard

A workspace's dashboard is a set of **views**, shown as tabs under the page title. There are three kinds:

| Kind | Looks like | In the screenshots |
|---|---|---|
| **Custom** (and **Report**, a custom layout preset: an area and a line chart over four numbers) | A 12-column grid of chart tiles (6 columns on a tablet, 1 on a phone), where one metric can appear several times as different charts | Overview, Calls, Money, Leads |
| **Columns** | Notion-style coloured lanes (groups) of metric cards | "View 5" |
| **Calendar** | One metric, day by day, for a month | Calendar |

A new view starts from a "Choose a layout" modal with four big picture cards: Columns, Custom, Report and Calendar. Each view tab's menu has Rename, Duplicate, Share as template and Delete view.

- **View tabs:** each tab has a small icon (a grid for custom, people for columns, a calendar for calendar), the active one is a grey filled rounded rectangle with a "⋯" menu, and a **+** adds a view.
- **Controls (right):** **+ Add** (or **+ New group** on a columns view), the date window (a calendar-icon dropdown: Today, Yesterday, Last 7 days, Last 30 days, Last 90 days, All time, or a custom range picked with two clicks on a calendar), **Compare To** (muted; comparisons aren't drawn at the moment), and **Refresh All**.
- **Tiles** are white cards with an 8 px radius and a 1 px hairline. Each has a title (14 px semibold, sentence case, the name the customer gave it) and a big figure (28 px semibold, tabular digits), and most show a chart beneath. A tile that is catching up says "Recomputing…" with a spinner.
- **Columns view:** one lane per group (for example Leads, Facebook, Instagram, TikTok, Revenue). Each lane is washed in its own colour at 6%, has a 4 px coloured bar on top, and a header with a coloured dot, the group name and a count. Each card shows its title, "4 hr ago" and a big figure.
- **Calendar view:** a month grid with SUN to SAT caps headers. Each day with data shows the figure and "N RECORDS" in caps, tinted periwinkle blue by its share of the month's best day. A black "BEST" badge marks the best day. Below: "SHADED BY SHARE OF THE MONTH'S BEST DAY", a LESS ▢▢▢▢ MORE legend, and chips reading "BEST DAY $9,991 on Aug 31", "AVERAGE DAY" and "DAYS WITH DATA". Controls: a month stepper ("‹ August 2026 ›"), the timezone, and a metric picker.

**Chart types:**

| Chart | Default size (columns × rows) | Looks like |
|---|---|---|
| Single number | 3×4 | Title and figure |
| Line / Area / Bar | 6×6 | 3 px line, area fill at 12%, flat bars; weekly buckets labelled W27, W33, W39 on long windows; a dashed baseline |
| Breakdown | 4×6 | Horizontal bars with the label inside the bar and the value at the right |
| Ranked bars | 4×6 | Several metrics side by side |
| Pie (and donut) | 4×6 | Outside labels: name, count, share |
| Progress to target | 3×4 | A thin track with "GOAL 20" and "60%"; grey until the goal is met |
| Pipeline | 6×7 | A horizontal Sankey-style funnel: a header row of stages (Leads, Booked, Showed, Customers) and flowing bands in one hue that deepens stage by stage, with "34% →" conversion chips on white pills |
| Table | 4×6 | PERIOD / VALUE |
| Text blocks | 6×3, 12×1 | A note or a divider, no metric |

**Tile colours.** Each tile or group picks one of twelve hues (new tiles get a random one): grey `#8A8A8A`, red `#FF6B66`, orange `#FF8A3D`, amber `#D9A400`, olive `#9BC61F`, green `#2ECC4A`, teal `#1FC9A0`, cyan `#22BEE8`, blue `#5AAEFF`, indigo `#A99BFF`, violet `#E27DFF`, pink `#FF6FBA`. Pie slices go blue, orange, teal, violet, amber, indigo, pink, olive, with "Other" always grey. A pipeline uses one hue mixed at 16% to 100% into the card. Group lanes use the hue at 6% (wash), 16% (badge) and 60% (text).

### Flows (the metric builder)

- **Flows list:** a page header with a lavender icon tile, **+ Create flow**, filter tabs (All flows, Active, Drafts, Paused, each with a count; the active one is filled blue), a "Search flows..." box, and a table (FLOW / STATUS / ON). Each row shows the source's logo, the flow's name, "41 steps · Google Sheets · Edited Sep 15, 2026", a green "● ACTIVE" badge, a blue toggle, and edit, duplicate and delete icons.
- **The builder:** a toolbar with **Review & publish** (rocket icon), an on/off toggle, the flow's name ("Untitled flow"), a ⋮ menu, and an amber "NOT PUBLISHED" badge; "Saved" on the right. The canvas is light grey with a dot grid. The zoom stack at the bottom left has zoom out, the percentage, zoom in, undo, redo and fit.
- **An empty flow** shows a blue gradient card: "NEW FLOW / Build a metric in three moves", with 1 Get the records (from an app you've connected), 2 Narrow them down (keep only the ones that count), 3 Turn them into a number (count, total, average, compare), and a white **Start with Get data** button.
- **Step cards** are white, with a left edge in the step's colour, a coloured icon tile, a step number, the name, a status dot (orange means untested) and a one-line hint in amber ink ("Pick an account"). A step that publishes carries an "On your dashboard" footer strip with a chart icon. Steps connect with dashed lines and a round **+** insert button, and an "Add next step" dashed card ends the list.
- **Step picker** ("Search steps..."), grouped under caps headings, with a CLIPBOARD section on top when a step has been copied. Each entry is a coloured icon tile, a name and a one-line description:

| Group | Step | Description | Colour | Icon (lucide) |
|---|---|---|---|---|
| DATA | **Get data** | Pull records from a connected app | `#0EAB0E` | Database (becomes the app's logo once picked) |
| DATA | **Combine** | Put several steps' records on one line | `#009ED3` | Merge |
| DATA | **Match** | Keep only records that appear in another step | `#009ED3` | Blend |
| CONDITIONS | **Filter** | Keep only the records you want | `#8176F9` | Filter |
| CONDITIONS | **Split** | Send records down separate branches | `#F856A7` | Split |
| CALCULATION | **Summarize** | Count, total or average into one number | `#D95FF2` | BarChart3 |
| CALCULATION | **Break down** | One number per value of a field | `#71A20D` | LayoutGrid |
| CALCULATION | **Calculate** | A rate, ratio or % change from two steps | `#D95FF2` | Divide |
| CALCULATION | **Time between** | How long from one event to another (this is how speed to lead is built) | `#F66700` | Timer |

- **Step statuses:** "Tested", "Needs setup" (amber, blocks publishing), "Not tested", "Testing…", "Test failed".
- **Review & publish** turns every last step into a dashboard metric with a name, a chart (Single number, Bar chart, Category breakdown or Progress toward goal), a format (number, percentage or currency) and an optional target.
- **Config panel** (right side, the step's colour as a top rule): the step's icon and name, **Configure / Test** tabs, caps field labels (TIME PERIOD, ONLY CONTINUE IF..., FIELD, CONDITION, VALUE), "+ Add condition", and a full-width **Continue** button.

### Apps

"Discover / Manage" segmented tabs, a "Find apps and integrations" search box and an "All apps" filter, then "ALL APPS · 35 apps" over a three-column grid of cards. Each card shows the app's own logo, its name, a one-line description of what it reads, grey **Instant** / **Scheduled** tags, and an outline **Connect** button (or a blue **Connect with Google** for Google apps). A connected app wears a green "● CONNECTED" badge.

### Invite & earn

A big deep-blue gradient card: "INVITE & EARN", a huge "0" with "people joined", "1 more unlocks 1 month free", an **Invite someone** button, and a track with milestones at 1, 3, 5 and 10. Below it are four tier cards (1 invite: 1 month free, 3: 3 months, 5: 6 months, 10: 1 year; the next one to unlock is highlighted with a "1 to go" pill, the rest are locked), then the personal link with a **Copy** button.

### Sign up and log in

A centred card on the page ground, in the same deep-blue gradient with a faint grid: "Create your account", a white **Continue with Google** button, "or", Email and Password fields, a white **Create account** button, the terms line, and "Already have an account? Sign in". Log in is the same card ("Welcome back" / "Sign in").

### First run, in order

1. **Verify email:** "Check your email" / "We sent you a code. Enter it to finish signing in.", a six-digit code field, **Verify email**.
2. **Create your workspace:** a narrow centred column. "A workspace is your organization's private space. All connected integrations and data live inside it." A "Workspace name" field ("Acme Inc") and **Create workspace**.
3. **The empty dashboard:** a large "Build your Dashboard" and a blue gradient card, "New dashboard / Build a dashboard in three clicks", with 1 Get Started, 2 Select a Template, 3 Add your Metrics, and a white **Get Started** button.
4. **The tour** (desktop, while the workspace has no apps and no flows): a spotlight ring on each target, a white bubble with "1 / 5", Skip, Back and Next. The five stops: "This is your board" ("Every metric you publish lands here and keeps itself up to date."), "Flows make the numbers", "Search", "Alerts", and "Start here", whose button **Connect an app** goes to Apps.
5. **"Get your first metric live"** checklist on an empty columns view: "Three steps — the first takes about a minute." Connect an integration, Build your first flow, Publish it, each ticked off from what's really done.
6. **Connect an app:** a "Connect <App>" modal (a connection name, "Where do I find these?", masked key fields) or Google's own sign-in, landing on the connection's page.
7. **Build and publish a flow**, then the metric appears on the board.

### Other screens

- **A connection's page:** a back link to Apps, the app's logo and the connection's name, a status pill, and Disconnect. A "Data status" card (last full sync, last event, instant webhook, polling, and the data guarantee, for example "Mirror — always matches the source"), then the inbound webhook, "Latest records", "Delivery issues", and sync actions (Sync new, Full re-sync, Reprocess, Import more history).
- **Activity:** filter chips by app, then a table of the last 50 records (Source / Type / Subject / Occurred).
- **Settings:** a stack of cards: Members, Invite, Pending invitations, Roles (named permission sets that can limit which metrics someone sees), Templates, AI assistants, Danger zone.
- **Templates:** a workspace can share its layout as a public link (`/t/<code>`) with a note on every slot saying which metric goes there, and never its data, apps or people. Built for a coach or agency sending one board to every student or client. The template page shows a numberless preview and **Use this template**.
- **Profile:** picture, name, sign-in email, **Appearance** (Light / Mix / Dark / System), and Delete your account.

---

## 4. App design tokens

### Colour

| Role | Dark | Light | Notes |
|---|---|---|---|
| Page / ground | `#121212` | `#F3F3F3` | |
| Rail | `#121212` | `#F3F3F3` | Mix theme: dark rail over light content |
| Top bar | `#151515` | `#FFFFFF` | |
| Card | `#151515` | `#FFFFFF` | |
| Panel | `#191919` | `#FAFAFA` | |
| Control (fields, search, active nav row) | `#202020` | `#F4F4F4` | |
| Hover step | `#3A3A3A` | `#ECECEC` | |
| Hairline | `#343434` | `#E1E1E1` | The main structure; shadows barely exist |
| Heavier rule | `#4A4A4A` | `#CFCFCF` | |
| Text | `#FFFFFF` | `#121214` (headings `#313131`) | |
| Muted text | `#828282` | `#6B6B6B` | |
| Caps label | `#6E6E6E` | `#8E8E8E` | |
| **Brand / primary fill** | `#568CFF` | `#568CFF` | Always with near-black ink `#1F1F1F`, never white |
| Primary hover / active | `#8FB2FF` / `#3F73E6` | same | |
| Brand text on white | | `#2F5FD8` | |
| Success | `#00D492` | `#00734B` | |
| Warning | `#F5A524` | `#B45309` | |
| Danger | `#FB2C36` | `#B42318` | |
| Freshness dot | `#34C759` | `#34C759` | The live dot |
| Flow canvas | `#1B191A`, dots `#2E3646`, edges `#475467` | `#F5F5F5`, dots `#D6D6D6`, edges `#98A2B3` | Edges are dashed 6/7 |
| Extra accents | orange `#FF8A5C`, pink `#FFB3B3`, periwinkle `#A8A8F0` | | |

Brand ramp: `#EEF4FF` 50, `#DCE8FF` 100, `#C0D5FF` 200, `#8FB2FF` 300, **`#568CFF` 400**, `#3F73E6` 500, `#3767D6` 600, `#3462CF` 700, `#2F5FD8` 800, `#24489F` 900.

**The blue "sky" gradient** (the Invite & earn card, the new-flow card, auth): `linear-gradient(135deg, #1B3577 0%, #2A55B8 55%, #3F73E6 100%)` with a soft white radial bloom at the top right, and a faint 88 px white grid at 6% on the sky panels.

### Type

- **Inter** everywhere in the app (weights 400, 500 and 600). The one exception is the wordmark, Inter 900.
- Scale: 12, **13** (buttons, labels), **14** (the interface), 17 (prose), 18, 20, **24** (page titles, weight 700), 26, **28** (the tile numeral), 30, 48.
- **The numeral:** 28 px, weight 600, tabular digits, tracking −0.0386em.
- **The micro label:** 12 px, weight 500, ALL CAPS, tracking 0.12 px, muted. Used for status pills, section captions and table heads, never for a name the customer wrote.

### Shape, spacing and elevation

- **8 px radius** on everything: cards, buttons, fields, menus, tables. Badges 4 px. Full circles only for avatars, the notification badge, the freshness dot and count numerals. Nothing you press is a pill.
- **32 px** is the height of every control.
- Rail 260 px; content inset 8 px; board gutter 16 px; board grid 12 columns (6 on tablet, 1 on phone).
- Almost no shadows: hairlines do the separating.

### Motion

120 / 180 / 280 ms. Curves: standard `cubic-bezier(0.2, 0, 0.13, 1)`, spring `cubic-bezier(0.34, 1.56, 0.64, 1)` (for things that appear), exit `cubic-bezier(0.4, 0, 1, 1)`. Exits are faster than entries. Buttons press down 0.5 px. Flow steps pop in (scale 0.9 to 1).

### Icons

lucide-react only, 16 px by default (14 dense, 18 toolbar, 24 rail), stroke 2.25.

### Data visualisation rules

- The default series is brand blue `#568CFF`; an area fill is the same blue at about 12%; bars are flat.
- Tiles carry their own colour from the twelve-hue palette in section 3 (the real boards use green bars, orange and grey pipelines, teal and amber lines).
- **Deltas are never green or red:** up is good for leads and bad for speed to lead. Percentages move in points.
- An em dash means "no answer", which is not zero. A number says when it was true ("Updated 4 hr ago").
- The calendar's heat is magnitude, never judgement: brand blue at 12% to 56% by share of the best day.

### Voice in the UI

Sentence case everywhere. Plain-English statuses ("Active", "Needs attention"). Dates like "Aug 21, 2026". Empty values "—".

---

## 5. The landing page

A separate, lighter world from the app, still with the same blue.

- **Canvas** `#FAFBFD` with three blurred blue radial blooms and 2.5% film grain. Ink `#14141C`, muted `#5C5C6B`, faint `#6E6E80`, hairline `#ECEBF2`.
- **Type:** Switzer (a heavy, tightly tracked grotesk, weights 400 to 800) for everything, and **exactly one word per headline in Instrument Serif italic** ("live *between*", "shows its *working*", "by *hand*"). Hero 88 px, weight 800, line height 0.92, tracking −0.045em. Section headings 52 px / 700. Body 17 to 19 px.
- **Buttons:** 56 px tall pills. Primary is `#2F5FD8` with white text ("Start free with email"); secondary is white with a hairline and the Google mark ("Start free with Google"). They lift 2 px on hover.
- **Cards:** 24 px radius, white-to-`#FBFBFD` gradient, soft layered shadows.
- **Dark moments are "sky" panels:** `linear-gradient(135deg, #16305E, #22438F 55%, #2B53AE)` with a white bloom, a faint 88 px grid and a lit edge. Only two sections are dark.
- **Motion:** the hero lines rise in from a mask (460 ms, staggered 90 ms); the board screenshot rises in at 820 ms; wires draw from four source chips into the board's rail; two logo marquees run in opposite directions (44 s loops); the canvas drawing plays once when scrolled into view and the answer counts up. No fade-up on scroll anywhere else, no parallax.

**Sections, in order:**

1. **Hero:** "Your best metrics live *between* your tools." Sub-line: "Namzilabs reads your calendar, CRM, outreach and payments together, matches the records that are the same person, and builds the number none of them can." Two start buttons, then "Free to start, no card. Read-only — disconnect anytime." On the right, the real dashboard screenshot bleeds off the right edge, with Calendly, Close, Stripe and Google Sheets chips wired into its rail.
2. **Source marquee:** "Reads directly from 35 sources." with logo pills.
3. **"Ten tools. Ten dashboards. One number, built from *all* of them."** A sticky column beside six source rows (Calendly 41 meetings booked "but not which ones showed up", Close 18, Instantly 112, Stripe $48.2k, Google Sheets 2,130, Aircall 306), each with a red dot.
4. **"Connected on Monday. Defensible by *Friday*."** Three numbered steps and a light flow canvas: Google Calendar + Google Sheets → Match (same person) → Filter (held only) → Divide (by booked) → a sky card "Show-up rate 66.8%, 247 of 370 booked".
5. **Metric marquee:** "Metrics that need two tools to exist." (show-up rate 66.8%, cost per held meeting $86.40, speed to lead 8m 39s, and so on)
6. **"Every number shows its *working*."** A tabbed receipt card (Meetings held / Cost per held meeting / Speed to lead): a sky panel with the figure and "What each source said", beside the lines Sources read, Last computed, Records in, Matched as the same person, Excluded, and a note.
7. **Dark sky panel: "Your AI can only see what you paste. Give it the *whole* business."** Chips for Claude, ChatGPT and Any MCP client, and a chat card: "Why did our close rate drop last week?", with flagged rows and the diagnosis.
8. **"35 sources, read *directly*."** A searchable, filterable index of every source (category chips with counts; each card has a logo, a description and three field tags).
9. **Four promises in one card:** Read-only, No warehouse, No SQL, Leave anytime.
10. **Dark sky panel: "Stop reconciling by *hand*."** Eight overlapping logos on white discs, "+27 more", "Connect one tool and build your first metric this afternoon.", then the start buttons and "Read-only. No card required."
11. **Footer:** the lockup, "The number none of your tools can build alone.", a "● Reading 35 sources" pill, and Product / Sources / Company / Legal link groups.

---

## 6. Social content (namzilabsposts)

Everything is HTML rendered by code: stills with Playwright, videos frame by frame at 60 fps through ffmpeg (`lib/motion.js` is a deterministic, seekable timeline engine; `tools/render-video.mjs` renders). Open any `video.html` to watch it live.

- **Surfaces:** *paper* (`#F6F7FB` with blue blooms and a faint grid), *sky* (`#0A1431 → #16305E → #22438F → #2B53AE` with an 88 px grid), *ink* (`#07090F` with a blue glow). All three carry 5% grain.
- **Colour means something:** blue is the answer (`#2F5FD8` for action, `#568CFF` the product's blue), red `#F0553D` is wrong or excluded, green `#34C759` is live. Never decorative.
- **Type:** Inter 800 headlines, tracking −0.045 to −0.05em, and one Instrument Serif italic word per headline. Tabular numbers.
- **Formats:** feed 1080×1350, Reels / TikTok / Shorts 1080×1920 (keep the story between y 240 and 1500), X 1600×900, square 1080×1080.
- **Motion spec:** 60 fps, rendered not recorded. Entries rise and fade with `cubic-bezier(0.16, 1, 0.3, 1)` over 450 to 750 ms; headlines rise word by word from a mask, 60 to 70 ms apart; weighty objects spring (about 10% overshoot, 0.9 to 1.2 s); exits are faster (250 to 450 ms) with a little blur; numbers count up; a slow 1 to 2% camera push. One idea per scene, 2 to 4 s each. Hook in the first 1.5 s. End on the logo plus "Start free · namzilabs.co". Silent by design (music gets added in the app).
- **The logo:** two overlapping rings (radius 15, 14 apart, stroke 4.6, on a 64-unit grid) with the space between them left empty, plus the "Namzilabs" wordmark (outlined Inter 800/900). One colour: white on dark and blue, ink on light.
- **Namzi, the mascot:** lives in the overlap between the rings. Social only (never in the product or on the landing page), in at most 1 post in 4, and it reacts while the numbers talk.
- **Real screens:** twelve catalogued captures in `screenshots/app/`, drawn inside a clean app-window frame. Anything made from them is labelled "Real screenshot", and captions never quote their numbers.

### Voice

Plain, specific and a little dry. Hook first. One idea per line. Their words (booked, held, no-show, show rate, setter, closer, cash collected, launch, list). No hype words, no emoji walls, one ask per post. **No em dashes, ever**, in anything published.

### Claims rules

1. No invented proof: no testimonials, "trusted by", customer counts or "10x".
2. Every example number is labelled **"Example data"**.
3. Don't announce what isn't live: the AI connection and the ad platforms are "coming soon".
4. Say "never edits your data" (not "can't change anything").
5. "33 tools" in copy (the live, connectable ones).
6. Never show a real customer's numbers without written permission.
7. "Free to start, no card", never "free forever".

The backlog in the content strategy already names this repo's likely territory: *creators and clippers, paid per 1,000 views once the product converts, with strict claim rules and source footage.*
