# Changelog

## 0.11.0 (Phase 10: editable email templates, SMTP) 2026-10-20

Added
- Settings > Email templates: every automatic email, grouped (Orders, Subscriptions, Referrals, Affiliates, Accounts, Alerts to you), each with its subject and text, a live preview rendered in your brand colours with sample values, and a button to send yourself a test without saving. Reset returns one email to its built-in wording.
- Saved wording is used the next time that email is sent; template ids and placeholders cannot be changed, so earlier phases keep working unchanged. A subject or body may only use the placeholders that email actually supports; anything else is refused with the exact placeholder named.
- SMTP as a mail provider (`MAIL_PROVIDER=smtp`), for any server that is not Resend: a hosting provider's mail server, a business inbox with an app password, or another provider's SMTP endpoint. New variables `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`.
- Migration `20261020040000_email_templates`.

Changed
- `renderEmail` now takes the template's actual text (a saved override or the code default) instead of just an id, so the same renderer draws both a live preview of unsaved text and a real email.

## 0.10.0 (Phase 9: customer accounts) 2026-10-20

Added
- Customer accounts (the Accounts module, on by default). Sign up with name, email and password (at least 10 characters, common passwords refused), confirm the email by a link, sign in with a password or an emailed one-time link, reset a forgotten password, change it, and sign out. Customers have their own sign-in, separate from staff: a staff session never signs a customer in and the other way round.
- Safe by design: sign-up, reset and sign-in-link requests answer the same way whether or not an address is known; one-time links are stored only as hashes, work once and expire (3 days, 1 hour, 15 minutes); the buttons on emailed links must be pressed, so mail scanners cannot use a link up; sign-in is limited per address and per connection; a password reset or change signs out other devices and sends a notice.
- Account area `/account`: overview, orders (with the order page and invoice), subscriptions, downloads, saved addresses, wishlist and profile. Customers can download all their data as JSON and delete their account (orders and invoices are kept, unlinked from the account).
- Guest orders and subscriptions placed with an address are added to the account once that address is confirmed.
- Checkout fills in the signed-in customer's details, offers their saved addresses in the shop, and links the order to them. Guests can still buy without an account.
- Wishlist: a Save to wishlist button on product pages (sends visitors to sign in and back).
- Shop > Customers: the people with accounts, with block and unblock (blocking signs them out everywhere).
- Five new emails. Migration `20261020030000_accounts` (phone, last sign-in, addresses, wishlist).

Changed
- The order, subscription and affiliate pages are unchanged and still work from their private links.

## 0.9.0 (Phase 8: coupons, referrals and affiliates) 2026-10-20

Added
- Coupons module. Codes with a percentage (optionally capped), a fixed amount or free shipping, a start and end, total and per customer limits, a smallest order, first orders only, services or shop products only, and a private owner email. One code box at checkout for services and the shop, with a live total. Tax is worked out after the discount, and in the shop the discount is shared across lines so each tax class follows it. Coupon uses list.
- A use is counted in the same transaction that creates the order, and the limit is checked in one statement, so a code with one use left can never go to two orders. A cancelled order, or an unpaid one after 72 hours, gives its use back.
- Referrals module. After a customer's first paid order they get their own code (and an email with a sharing link). A friend using it on their first order gets a discount; when the friend's order is paid, the customer gets a single-use reward code by email. Own codes, repeat customers, a second referral for the same friend and codes on orders that were refunded are all refused or taken back. Referrals list.
- Affiliates module. Public application page `/affiliates`, links at `/a/CODE` (counts clicks and remembers the affiliate for a set number of days, latest link wins), a private dashboard at `/affiliate/<token>` with clicks, orders, commission and payouts, and approval by staff. Commission is paid on what the customer paid for products or services after discounts, without tax and shipping, at a default or per-affiliate rate, optionally also on subscription renewals.
- Commission is held (default 14 days) so refunds can still cancel it, then becomes ready to pay. A refund cancels commission that was not paid out yet and leaves a note on one that was. No commission on a buyer's own orders or for paused affiliates.
- Marketing > Payouts: applications waiting, balances ready to pay with the affiliate's payout details, recording a payout (method, reference, note) that marks the commissions paid in one step and emails the affiliate, and the recent commission and payout history.
- Settings > Referrals and Settings > Affiliates. Eight new emails.
- Daily job `/api/cron/growth` (scheduled in `vercel.json`).
- Migration `20261020020000_growth`.

Changed
- Referrals and Affiliates no longer need the Accounts module (not built yet). They work from email addresses and private links.
- Store order cancellation by expiry now runs the same cancel handlers as a staff cancellation.
- `/a`, `/ref`, `/affiliate` and `/affiliates` join the addresses builder pages cannot use.

## 0.8.0 (Phase 7: store) 2026-10-20

Added
- Store module (off by default; needs Checkout). Products are physical (shipped) or digital (downloaded), with a short and full description, pictures, category, featured flag, price, compare at price and a tax class. Shop categories, `/shop` with category filter, search, sort and paging, and a product page with Product structured data, option pickers, live price and stock wording and add to cart. Products are in the sitemap.
- Options and variants. Up to three options (Size, Colour) and 100 variants per product. Each variant has its own stock, SKU, price and picture. Changing options keeps existing stock and switches off combinations that no longer exist instead of deleting them, because old orders point at them.
- Stock. Tracked per variant, changed in one database statement so two buyers can never take the last item. Stock is set aside when the order is placed and returned if the order is cancelled or not paid within the hold time (default 48 hours; the daily job `/api/cron/store`). Every change is kept with a reason and the balance after it. Low stock and sold out alerts by email.
- Inventory screen (Shop > Inventory): every tracked variant, lowest first, add or remove with a note, history per variant.
- Cart in a cookie that holds only which variant and how many. `/cart`, and `/cart/checkout` with delivery address, shipping method choice, billing country for digital goods, live totals from the server, and payment through the existing methods.
- Tax classes with a rate, country overrides, and a tax class for shipping. Tax is worked out per line from the delivery country (billing country for digital orders), with prices inclusive or exclusive as set in Settings > Payments.
- Shipping zones: countries or `*` for the rest of the world, and flat, per item, weight based or free rates, with a free shipping threshold. Buyers see only the rates for their country; an unserved country is refused.
- Digital products: files with a download limit and a number of open days. Orders are completed when paid and the order page lists the downloads. Downloads go through `/download/<order token>/<item>/<file>`, which checks payment, expiry and the limit in one step.
- Order pages and the admin order screen show the delivery address, shipping and SKUs.
- Settings > Store: shop page, stock, tax and shipping tabs.
- Order cancelled event for modules that must give something back (stock); eight tests cover it.
- Migration `20261020010000_store`.

Changed
- `vercel.json` now also schedules `/api/cron/store`.
- `/download` joins the addresses builder pages cannot use.

## 0.7.0 (Phase 6: subscriptions) 2026-10-20

Added
- Subscriptions module (off by default; needs Services or Store, and Checkout). A paid package that bills monthly or yearly starts a subscription with a start date, a current term and an end date. Each paid term is recorded once, so a repeated payment event can never extend a plan twice.
- Renewals by invoice. Shortly before the end date (default 7 days) a renewal order is created and emailed; the customer pays it like any order, with any of the payment methods. Nothing is charged automatically. Tax is worked out again at renewal. Renewals keep the price the customer signed up at, or follow the package price (Settings > Subscriptions).
- Daily job `/api/cron/subscriptions` (scheduled in `vercel.json`): renewal invoices, reminders (default 7, 3 and 1 days before the end, each sent once), a grace period (default 3 days) when the end date passes unpaid, expiry after it, and ending plans that were set not to renew. A missed run catches up without sending duplicate emails.
- Paying late inside the grace period continues from the old end date, so no days are lost. Paying after expiry starts a fresh term from the payment day. Month ends are handled (a plan on the 31st renews on the last day of shorter months and returns to the 31st).
- Customer plan page `/subscription/<token>` (private, not indexed): status, dates, renewal invoice, Renew now, Stop renewing, Keep renewing, Start again, terms and history. Order pages link to their plan.
- Admin: Subscriptions list (status, end date, filters, CSV), a plan screen (send or resend the renewal invoice, add free days, stop renewing, end now, private notes, terms, orders, history, emails sent) and an Add subscription form for customers who pay outside the site.
- Eight customer emails and an owner alert, in the same branded layout (plain text always included, every send logged against the plan).
- A full refund of the order that paid the current term ends the plan (switchable); any other refund adds a note.
- Settings > Subscriptions: lead days, reminder days, grace period, renewal price, number prefix, what customers can do, owner alerts.
- Checkout tells buyers of a recurring plan how renewals work.
- Migration `20261020000000_subscriptions`.

Changed
- The order engine has an order-refunded event next to the order-paid event; handlers load on first use, so there is no import cycle.
- `/subscription` joins the addresses builder pages cannot use.
- Cron routes share one `CRON_SECRET` check (`src/lib/cron-auth.ts`).
- Resources can show an Add button for a dedicated screen (`addHref`).

## 0.6.0 (Phase 5: services, checkout and payments) 2026-10-20

Added
- Services and packages with price, optional top of range, billing (one time, monthly, yearly, hourly), a monthly or yearly choice (discount percent, or a fixed yearly price that wins), delivery days, features, popular badge, and a buy or quote button. Services can ask checkout questions.
- `/pricing` with service tabs, the monthly and yearly switch, "You save X (Y%)" and the effective monthly cost; a Pricing packages block; Service and Offer structured data; the pricing page in the sitemap. Quote buttons open the contact form with the package filled in.
- Checkout at `/checkout/<package>`, the private order page `/order/<token>` and a printable invoice `/invoice/<token>`.
- Checkout engine: every price, period, quantity, tax and method is computed on the server from the database. Extra fields such as a price are refused outright. Orders keep a snapshot of the package as sold.
- Payment methods: Stripe (Checkout and signed webhooks), PayPal (Orders API, capture on return, verified webhooks), SSLCommerz (validator API before marking paid, IPN), and manual methods (bKash, Nagad, Rocket with a local-currency amount; bank, Wise and Payoneer with a receipt upload).
- Idempotent payment handling: each gateway event is stored with a unique key; a repeated webhook changes nothing. A paid event whose amount or currency differs is recorded as a mismatch, the order moves to "checking payment" and the owner is alerted.
- Order statuses with allowed moves, history, private notes, progress updates and files visible to the customer, refund records, gap-free invoice numbers, and an order desk for staff.
- Branded transactional emails (plain-text version always included, every send logged against the order): order received, paid, started, shipped, delivered, completed, cancelled, refunded, payment problem, update, invoice, and owner alerts.
- Settings > Payments (methods and their order, local currency and rate, order and invoice prefixes, tax, terms, company details) and Settings > API keys (encrypted keys for the gateways; the environment wins).
- Links in emails and gateway returns use the request host only when it is SITE_URL or listed in ALLOWED_HOSTS.
- Hook for later modules to react to a paid order (subscriptions, stock, rewards).
- Seed: the agency preset adds placeholder services and packages, switched off with no prices.
- Migration `20261019020000_services_checkout`.

Fixed
- Blank optional text inside a repeater row is now saved as an empty string, so settings with such rows (payment methods) save correctly.

## 0.5.0 (Phase 4: SEO) 2026-10-19

Added
- SEO, Social, Schema and Code tabs on pages, posts, projects, case studies, products and categories: focus and related keywords, meta title and description with length meters, canonical, index and follow, snippet and image preview limits, sitemap include, priority and change frequency, share title, description, image and card type, schema type with fields (How-to, Event, Course, Video), page CSS.
- SEO score (0 to 100) graded against the focus keyword in four groups (keyword, content, media and links, technical), shown live in the editor with a Google preview for desktop and phone, as a coloured column in every list, in the save message ("Saved. SEO score 82/100. Next: ...") and in the overview. Advice only.
- Internal-link suggestions in the SEO panel from pages and posts that share words with the keywords.
- SEO overview: every page-like item with score, keyword, lengths, index state, schema type and first fixes; filters for needs work, no description, no keyword, duplicate keyword and hidden; lowest score first; "Score everything again".
- Schema graph: one JSON-LD @graph per page with Organization, Person, ProfessionalService or LocalBusiness (address, hours, area served, socials), WebSite with SearchAction, WebPage or CollectionPage, BreadcrumbList, BlogPosting, Article, CreativeWork, SoftwareApplication, FAQPage (FAQ blocks and "Frequently asked questions" sections in rich text) and the type chosen in the Schema tab. The admin Schema panel explains each node, shows warnings, the JSON with Copy, a Rich Results Test link and Rebuild; it updates while you type.
- SEO settings: title format, default share image, business details, staging switch, category archive indexing, llms.txt summary, IndexNow, Google and Bing verification.
- Generated files: sitemap index split by type with image entries (`/sitemap.xml`, `/sitemaps/<type>.xml`), `robots.txt`, `llms.txt`, `llms-full.txt`, `/indexnow.txt`, and automatic share images at `/og` in the brand colours. Types of switched-off modules disappear.
- Redirects now run before every page: exact, longest prefix and pattern, 301, 302 and 410, with hit counts. New redirects never chain (they point at the final address) and loops are refused.
- 404 log with hit counts and "Create redirect" (the redirect form opens filled in). Probes for WordPress and server files and addresses of switched-off modules are not logged.
- IndexNow ping on publish and when a live address changes (live site only, never in staging).
- Migration `20261019010000_seo`: the 404 log gets its own id.

## 0.4.0 (Phase 3: content modules) 2026-10-19

Added
- Blog: posts and short updates, categories, tags, authors (staff with photo and bio), scheduling, featured posts, sections after the article, archive with search and pagination, category, tag and author archives, RSS 2.0 feed at `/feed.xml`, blog settings.
- Article page: breadcrumb, author and date, reading time, reading progress bar, contents list (sticky on desktop, a collapsible "current section" card on phones, highlights as you scroll), share links with copy, author box, tags, previous and next, related posts.
- Rich text editor (Tiptap 3): H2 to H4, bold, italic, strike, code, links with a page and post search, lists, quotes, code blocks, tables, images from the media library, YouTube, callouts, buttons, undo and redo, word count and reading time, Markdown import and export. Stored as JSON; HTML is rendered on save by an allow-list renderer that also builds heading ids (with a fallback for Bengali and other scripts), the word count and any FAQ section.
- Portfolio: projects with client, platform, services, technologies, results, gallery, video and a tall screenshot that scrolls inside a browser frame on hover or tap (speed set in Portfolio settings, still for reduced motion); portfolio page with platform and service filters; project pages.
- Case studies with problem, approach, results and key numbers, linked to projects.
- Products showcase on `/apps`, product pages and an automatic Products column in the footer.
- Testimonials library and the Testimonials block.
- Printable resume page at `/resume` from Resume settings.
- Live content blocks: Blog posts, Portfolio, Case studies, Your products, Testimonials, and a Showcase hero with featured projects.
- Seed presets (blank, freelancer, agency, shop, local): modules, brand preset, menu, placeholder pages from templates, sample draft posts and projects. Never overwrites existing content or settings.
- Migration `20261019000000_content_modules`.

Changed
- Rich text fields now store Tiptap JSON. Section blocks keep their simple Markdown text.
- Page addresses used by the site itself (blog, portfolio, apps, resume, shop and others) are refused for builder pages.

## 0.3.0 (Phase 2: theme and builder) 2026-10-19

Added
- Brand settings (Identity, Colours, Dark mode, Typography, Shape, Buttons, Motion, Mode, Custom CSS) printed as CSS variables on every request; components use tokens only.
- Five presets (Blueprint, Clean, Warm, Bold, Calm), all passing WCAG AA in light and dark mode, applied in one click, with a live contrast check on the Brand screen.
- Eleven self-hosted variable fonts plus Noto Sans Bengali as a fallback for Bengali text, through next/font/local (no requests to Google).
- Fluid heading ladder (H1 to H6 with phone and desktop sizes), button styles (solid, outline, soft) and shapes, shadows, container width, motion with reduced-motion support, dark and light mode with no flash and an optional visitor switch.
- Header and footer settings: three header layouts, sticky header, menus with dropdowns, header button, account and cart icons tied to their modules, side drawer or drop-down phone menu, footer columns, social links, pages marked "show in footer", Back to Top with a reading-progress ring that stacks above the chat button. Links to switched-off modules are dropped.
- Block registry, validation and server renderer with 29 core blocks: Section, Columns, Tabs, Accordion, Spacer, Divider, Hero (text, image right, image behind, video), Rich text, Image and text, Quote, Logo strip, Stats, Countdown, Cards, Feature grid, Steps, Team, Pricing table, Timeline, Comparison table, Gallery (grid, masonry, slider), Video, Map, Call to action, Contact form, Booking link, FAQ, Custom HTML, Global section.
- Twelve card templates including "My own HTML" with placeholders and scoped CSS; layout controls (grid or carousel, cards per row, autoplay, interval, arrows, dots, swipe, keyboard, pause on hover).
- Page builder in the editor: add from a searchable palette, drag or move to reorder, hide, copy, delete, containers one level deep, per-block content, layout and design settings, undo and redo, save as global section, live preview of unsaved changes at desktop, tablet and phone widths.
- Global sections (reusable, edit once), seven page templates, builder pages on `/` and `/<slug>`, exact redirects honoured, signed preview links for drafts, an editable 404 page (publish a page at "not-found"), editable maintenance page.
- Contact form endpoint with honeypot, rate limit, validation and an owner email.
- Admin shows the client's admin logo and brand colours; "Powered by" only when switched on.

## 0.2.0 (Phase 1: admin framework) 2026-10-18

Added
- Resource and settings registries. Resources are plain declarations (fields, tabs, columns, filters, quick edit, CSV, Trash, versions); generic screens draw them and server hooks add behaviour.
- All field types from the specification with help text, conditions (`showIf`), half or full width, administrator-only fields and plain-English validation messages shown next to each field. Rich text is a plain text area until Tiptap arrives in Phase 3.
- Generic list: search, filters, sort, page size, column chooser, saved views per staff member, selection with bulk publish, draft, duplicate, Trash, restore and delete, quick edit, duplicate, Trash tab, CSV export, CSV import (redirects).
- Generic editor: tabs, sticky save bar (Saved, Unsaved, Saving), Ctrl or Cmd + S, leave guard, versions (last 30, restore), scheduling, preview link with a secret token, view live, duplicate, move to Trash.
- Generic settings screen, with the Site and contact group.
- Media library: direct signed uploads to Cloudinary or S3-compatible storage (R2), a development-only local provider, file type checked by real bytes, size limits per type, unsafe SVG refused, alt text required before use, caption, folder, focal point, usage list before delete, replace in place.
- Core resources: Pages, Redirects (CSV import), Users (staff), Roles (custom areas), Audit log.
- Automatic 301 when the address of a live page changes, with chains flattened and loops removed.
- Daily cleanup job (`/api/cron/cleanup`): empties Trash after `TRASH_RETENTION_DAYS` and removes expired sessions.
- Integration tests against a real database, a server render check of every admin screen (`npm run render-check`), and Playwright tests for every screen and the Pages workflow.
- Migration `20261018010000_admin_framework`: media caption and change time.

## 0.1.0 (Phase 0: foundation) 2026-10-18

Added
- Repository with pinned versions: Next.js 16.3.8, React 19.3.0, TypeScript 6.0.3, Prisma 7.10.0 with the pg adapter, Auth.js (next-auth 5.0.0-beta.32), zod 4.6.5, Tailwind CSS 4.3.3, Vitest 5.0.3, Playwright 1.63.0, ESLint 9.39.4. Every version was published more than 14 days before this release.
- Prisma schema and first migration for the core models: Setting, Secret, User, Account, Session, VerificationToken, Role, Media, Page, Revision, GlobalSection, Redirect, NotFoundHit, AuditLog, EmailLog.
- Settings store: groups declared in code, merged over defaults at read time, cached with the `settings` tag, defaults returned when the database is down.
- Module registry with all 27 modules from the specification plus a development-only Demo module. `isOn`, `requireModule`, dependency planning, and a proxy that serves the 404 page for routes of switched-off modules. Maintenance mode.
- Staff sign-in with Auth.js, Argon2id passwords, rate limits and server-side sessions. Roles and areas with guards for pages, route handlers and server actions.
- Admin shell with a menu filtered by module and role, a dashboard and the Modules screen.
- Adapter interfaces for storage, mail (console and Resend), payments, AI, rate limits (memory and Upstash) and cache.
- AES-256-GCM encryption for API keys saved in the admin.
- Lint rules: no raw colours, no hard-coded fonts, no long dashes.
- Unit tests, Playwright render and module-switch tests, GitHub Actions CI with a schema drift check.
- Generated reference docs for modules, settings, environment variables and roles.
