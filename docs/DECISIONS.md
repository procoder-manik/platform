# Decisions

Choices made where the specification was silent or could not be followed exactly. Newest last.

## Phase 0

**D1. TypeScript 6.0.3, not 7.** TypeScript 7 is the latest stable, but typescript-eslint 8.71 (used by Next's lint config) supports TypeScript below 6.1 only. Revisit when typescript-eslint supports 7.

**D2. ESLint 9.39.4, not 10.** eslint-config-next 16.3.8 pulls in eslint-plugin-import, which does not accept ESLint 10, and npm fails to install. ESLint 9 is still maintained.

**D3. npm 11.21 or later is required.** npm 10.9 crashes ("reading 'edgesOut'") while resolving Vitest 5's optional peer dependencies. `packageManager` in package.json and the CI workflow pin npm 11.21.0.

**D4. `proxy.ts` instead of `middleware.ts`.** Next.js 16 renamed middleware to proxy and runs it on Node.js, so it can read the database. The spec's "middleware" means this file.

**D5. The proxy keeps module switches in memory for 3 seconds.** The proxy is bundled apart from the app and cannot share the Next.js data cache, so a switch change reaches the proxy on each server instance within `MODULE_PROXY_TTL_MS` (default 3000). Route handlers and pages call `requireModule` / `isOn`, which read the tag-cached setting that refreshes at once, so a stale proxy copy never exposes a switched-off module's data or actions.

**D6. Database-backed sessions through a JWT that carries only a session id.** Auth.js refuses the credentials provider with the database session strategy when credentials is the only provider. The cookie therefore holds only `sid`, the id of a `Session` row created at sign-in. Every request loads that row (`getStaff`), so deleting it signs the user out at once, and signing out deletes it. This gives the revocation the spec wants while staying inside Auth.js. Verified: deleting the row sends the next admin request to the sign-in page.

**D7. Requirements are "all of these clauses, any option inside a clause".** The spec has dependencies like "services or store, and checkout". Manifests write that as `[['services', 'store'], ['checkout']]`.

**D8. Chosen state and live state are separate.** The owner may switch a module on without what it needs. It is then stored as chosen but treated as off everywhere (`effectiveStates`), and the Modules screen says "switched on, but not live until X is on". Nothing half-works.

**D9. Services does not hard-require Checkout.** The spec says Services needs Checkout "for buy buttons" only; quote packages work without it. It is stated in the description instead. `/checkout/<package>` is owned by both modules, so it needs both on.

**D10. Checkout defaults to on.** The spec says "on when Services or Store is on". Services defaults to on, so Checkout does too.

**D11. Module defaults are applied in code, not stored.** The `modules` setting stores only what the owner chose. A module added in a later release starts at its own default on every client site.

**D12. A development-only Demo module.** It owns `/demo` and `/api/demo` for the Phase 0 check. It never switches on in production and is hidden from the Modules screen there.

**D13. `Revision` has no foreign key to `Page`.** The spec links `Revision.entityId` to `Page`, which would reject revisions of posts, products and other content. Revisions are generic (`entity` plus `entityId`) with an index on both. Raised in the Phase 0 report; reverse this if you prefer the spec as written.

**D14. Auth.js fields on `Account`, plus `VerificationToken`.** Google sign-in and magic links (later phases) need the standard Auth.js columns. `Session` also stores IP and user agent for the audit trail.

**D15. Prisma 7 layout.** Prisma 7 needs the `prisma-client` generator with an output folder (`src/generated/prisma`, not committed), a driver adapter (`@prisma/adapter-pg`) and `prisma.config.ts`. Migrations use `DIRECT_URL`; the app uses `DATABASE_URL`. Pool size per instance is `DATABASE_POOL_MAX` (default 5).

**D16. Settings reads fall back but do not cache failures.** If the database is down, `getSetting` returns the defaults without caching them, so the next read tries again.

**D17. Phase 0 tokens are static.** `globals.css` holds the Blueprint preset as CSS variables and Tailwind maps them to token classes. Phase 2 prints them from the Brand settings at request time; components do not change.

**D18. The theme script reads `localStorage`.** Remembering the visitor's light or dark choice in the browser is a per-visitor convenience and needs no server.

**D19. Sign-in limits.** 5 attempts per email and 30 per IP in 15 minutes. Memory limiter by default; Upstash when its variables are set. If Upstash fails, the memory limiter takes over so sign-in keeps working.

**D20. Migrations in this phase were written by hand.** Prisma's migration engine could not be downloaded in the build environment. The SQL follows Prisma's own naming and was applied to a real PostgreSQL-compatible database. CI runs `prisma migrate diff --exit-code` against the schema to catch any drift; if it reports a difference, regenerate the migration with `prisma migrate dev`.

## Phase 1

**D21. Resources are data; behaviour lives in server hooks.** Resource files are imported by tests, the docs generator and client screens, so they hold no server code. Hashing passwords, single home page, role protection and similar rules live in `src/modules/<id>/hooks.ts`, registered in `src/lib/admin/hooks.ts`.

**D22. One generic repository over Prisma delegates.** `src/lib/admin/repo.ts` reads and writes any resource through its Prisma model name. Every write validates against the field declarations, checks unique fields, runs hooks, stores a version, writes the audit log and refreshes cache tags. Public pages never use it; they read through `lib/data`.

**D23. Errors carry the field they belong to.** Validation and hook errors come back keyed by field path, and the editor shows each one under its field, switches to its tab and focuses it (lesson: errors next to the thing that failed).

**D24. Editors send values keyed by field path.** "seo.title" is merged into the `seo` JSON column without touching its other keys. A full save clears optional fields the editor shows as empty; quick edit only touches its own fields.

**D25. Empty slug fields are filled from their source field** and made unique within the resource (`about`, `about-2`). Slugs are ASCII; text in non-Latin scripts falls back to the resource name.

**D26. Saved list views are stored per staff member** in a `views:<userId>` settings record. Column choice is part of the list address, so a saved view also keeps the columns.

**D27. Media uploads go straight to storage in two steps.** The server signs a short-lived upload, the browser sends the file, then the server reads the first 4 KB of the stored file and checks its real type and size. A file that fails is deleted at once. SVG files with scripts, event handlers or embedded content are refused, not rewritten.

**D28. S3 and R2 without the AWS SDK.** Presigned URLs use a small SigV4 implementation (`sigv4.ts`) that is tested against the example in the AWS documentation. S3 has no image transforms; Phase 2 serves those images through `next/image`.

**D29. A development-only local storage provider.** It writes to `.uploads/` through a signed, staff-only route and serves files with a sandboxing content security policy. It is never selected in production.

**D30. Replacing a file keeps its address.** The new file is uploaded to the same key (Cloudinary overwrites and invalidates), so every page that uses it shows the new file.

**D31. Media delete is permanent and checks usage first.** The usage list scans every resource column that can hold media, plus settings. If the file is used, the owner must confirm.

**D32. Users are staff only in Phase 1.** Customers get their own screens in Phase 9. Blocking a user or changing their password ends their sessions. The last administrator cannot be removed or demoted by themselves.

**D33. Preview links are signed** (HMAC of entity and id with AUTH_SECRET). The public renderer checks them in Phase 2.

**D34. The cleanup job runs in Phase 1** because Trash retention needs it. It is protected by `CRON_SECRET` (16 or more characters).

**D35. Rich text is a text area until Phase 3**, where Tiptap stores JSON and renders HTML. The field type already exists so resources can declare it.

## Phase 2

**D36. Fonts come from @fontsource-variable packages through next/font/local.** The spec asks for Google Fonts self-hosted with next/font. next/font/google downloads at build time, which fails on locked-down build machines, and needs the font list at build time anyway. The same fonts installed from npm are self-hosted, work offline and only download in the browser when the theme uses them. The list is curated (eleven fonts) rather than the whole Google catalogue; adding one is one line in `fonts.ts` and one in `font-catalog.ts`.

**D37. Theme tokens are printed on `html:root`** so they win over the fallback tokens in `globals.css` whatever the stylesheet order. Base element styles live in `@layer base` and shared classes in `@layer components`, so Tailwind utilities still win.

**D38. Brand colours are overrides on top of a preset.** Empty colour fields follow the preset; applying a preset clears colour, font and shape overrides after a confirmation. Content never changes.

**D39. Block definitions are data and renderers are server components** (same split as resources and hooks). The block list on a page is validated on save: unknown types are refused, props are checked against each block's fields, style values must be tokens, containers are one level deep, and non-administrators can neither add nor change Custom HTML.

**D40. Tabs and accordions hold text, not child blocks.** Section and Columns are the containers. This keeps the editor simple and the one-level rule easy to follow.

**D41. Rich text in blocks is a small, safe Markdown** (escaped first, links limited to http, https, relative, mailto and tel) until Tiptap arrives with the blog in Phase 3.

**D42. Custom HTML is cleaned with sanitize-html** (allow-list, iframes only from YouTube, Vimeo and Google Maps) and its CSS is scoped with native CSS nesting under the block id.

**D43. The live preview stores the builder's unsaved blocks per staff member** (`preview:<userId>` setting) and reloads an iframe at `/preview/draft`. Only the signed-in staff member can see their draft. Signed links (`/preview/page/<id>?token=`) let anyone with the link see a draft page.

**D44. Builder pages are statically generated on demand** (`revalidate = 3600`, empty `generateStaticParams`) and refreshed by cache tags on save. Exact redirects are honoured in the catch-all route; Phase 4 adds prefix and pattern redirects and the 404 log.

**D45. Images in blocks use `<img>` with lazy loading and reserved aspect ratios**, so any storage host works without per-client image configuration. The Phase 14 performance pass decides on `next/image` with remote patterns per client.

**D46. The 404 page is a normal builder page** published at the reserved address "not-found". Without it, a default message is shown inside the site header and footer.

**D47. Settings with text values store an empty string, not null, when cleared**, so their schemas stay simple.

## Phase 3

**D48. Rich text is Tiptap JSON rendered by our own allow-list renderer** (`src/lib/richtext/render.ts`), not by Tiptap's HTML generator. Only known nodes and marks are output and every value is escaped, so rendering is also sanitising, and it runs on the server without a DOM. The same pass builds heading ids, the word count, the reading time and the FAQ list.

**D49. HTML is rendered on save into `bodyHtml`** for posts, projects and products, so public pages never parse JSON. Case studies render their three short parts on read (they are cached).

**D50. Section blocks keep simple Markdown text** (D41). Long-form writing uses the full editor; sections stay quick to edit.

**D51. Authors are staff users** with an optional bio and photo, not a separate table. Author archives only list staff with live posts.

**D52. Tag archives are hidden from search engines by default** (Blog settings), because they usually repeat other pages.

**D53. The resume lives in settings**, not in its own table: one person, one resume, printed with print styles that hide the header, footer and buttons.

**D54. Testimonials have no status, only "Show on the site".** The library never ships with sample quotes, because placeholder quotes look real.

**D55. Seed presets only add what is missing** and save settings only when none are saved yet. Sample posts and projects are drafts, so nothing placeholder goes live by accident.

**D56. Unknown filter values on the portfolio are ignored** rather than returning an empty page, and filtered views are hidden from search engines.

**D57. Reserved addresses.** Builder pages cannot use addresses that belong to the site's own routes (blog, portfolio, apps, resume, shop, account and others).

## Phase 4

**D58. The score is computed on the server, also for the live panel.** The editor sends its unsaved values to a server action every 0.8 seconds. One scorer serves the editor, the save message, the list column and the overview, and it can look up image alt text in the media library and check whether another page uses the same keyword.

**D59. The score and the first three fixes are stored inside the record's `seo` JSON** (`seo.score`, `seo.fixes`) on every save, so lists and the overview do not recompute. "Score everything again" refreshes all of them, for example after changing a rule.

**D60. Score weights add up to 100** and are spread over four groups. Readability uses sentence and paragraph length rather than a Flesch score, because Flesch only works for English.

**D61. Missing addresses are logged from the browser** with a small beacon from the 404 page. Reading request headers on the server would make the 404 page dynamic, and because Next.js streams the 404 component with every page, that turned every static page dynamic. Bots that do not run JavaScript are not logged, which also keeps probes out of the log.

**D62. Redirects run in the proxy** with a short in-memory copy (same time limit as module switches) and count hits without waiting. Exact matches win, then the longest prefix, then patterns.

**D63. Page head code is not offered yet; page CSS is.** Arbitrary head HTML cannot be added safely through React metadata. Site-wide head code arrives with the Code area; pages can already add scoped CSS.

**D64. Required schema properties are tested against Google's documented requirements** in unit tests. Google's Rich Results Test is an online tool and must be run against the deployed site; the Schema panel links to it.

**D65. The share image route uses the brand's light palette** and the default font that ships with next/og, so it works without network access.

**D66. Sitemaps are cached with the content tags** and rebuilt on request after a change. Categories are only listed when they have live posts.

## Phase 5

**D67. Gateways are called over HTTPS without their SDKs.** Stripe Checkout, the PayPal Orders API and the SSLCommerz session and validator APIs are small, so plain `fetch` keeps the dependency list short and lets tests replace the network. Each adapter takes an injectable `fetch` and base URL.

**D68. Real gateway sandboxes were not available while building.** The adapters are tested against simulated responses and, for Stripe, against genuinely signed webhooks sent to the running site. Test each gateway once with your own sandbox keys before going live.

**D69. The price is never sent by the browser.** The checkout request accepts only the package, period, quantity, buyer details, answers, method and terms. Any other field, a price or total for example, makes the whole request fail. The server prices from the database, so a hidden, inactive or quoted package can never be bought, even from an old link.

**D70. One path marks an order paid.** A single conditional update moves the order to PAID, so however many webhooks, returns and clicks arrive, only the first runs the paid steps (invoice number, module handlers, receipt, owner alert). A failing module handler is logged and never undoes the payment.

**D71. Amounts must match.** A paid event is accepted only when its amount and currency equal the order. Otherwise it is stored as a mismatch, the order moves to "checking payment" and the owner is alerted. SSLCommerz and PayPal are confirmed with the gateway before any of this.

**D72. PayPal is looked up before it is captured.** The PayPal order must carry our order id, so a crafted return address cannot capture a buyer's money for the wrong order.

**D73. Cancelled and failed returns change nothing.** Coming back from a gateway without paying only shows a message; a forged "fail" address cannot cancel an order.

**D74. Refunds are records.** Recording a refund updates the order and tells the customer; the money itself must be returned in the gateway or the bank. A refund reported by Stripe is applied as the difference from what was already recorded.

**D75. Invoice numbers have no gaps.** Numbers are INV-2026-0001 and up. Two orders paid at the same moment may pick the same number; the unique index lets one keep it and the other asks again for the next free one.

**D76. Order and payment-proof links are secret addresses.** The order page and invoice are reached with a long random token and are not indexed. Receipt uploads are limited to JPG, PNG, WebP and PDF up to 5 MB, checked by their real bytes, and refused files are deleted.

**D77. Flat tax for now.** One rate with inclusive or exclusive prices. Tax classes, regions and shipping arrive with the store (Phase 7). Only currencies with two decimals are supported.

**D78. Orders have no subscription or coupon link yet.** Phase 6 adds subscriptions and Phase 8 coupons, each with its own column or table, hooked into the paid-order handler list.

**D79. Owner alerts are sent when money needs attention** (paid, a manual payment to check, an amount mismatch), not for every order placed, to keep abandoned checkouts out of the inbox.

**D80. Email templates live in code for now.** Ids and placeholders are final; Phase 10 adds editing with a live preview and test send.

**D81. Order attempts are rate limited per connection and per email** (12 and 6 an hour). Refused attempts count.

## Phase 6

**D82. Subscriptions renew by invoice, not by automatic charge.** Manual methods (bKash, Nagad, bank, Wise) cannot be charged on a schedule, and the card gateways are used through one-time checkouts. So shortly before the end a renewal order is created and emailed, and the customer pays it. Emails and the checkout page say plainly that nothing is charged automatically. Saved cards and gateway-side recurring billing would be a separate, per-gateway piece of work.

**D83. A subscription is separate from its orders.** The plan holds the dates and status; every payment is a normal order (`Order.subscriptionId`, item kind `renewal`), so invoices, refunds, gateways and the order desk work unchanged. `SubscriptionTerm` records each term once, and its unique order id makes the paid handler idempotent on top of the one-time paid transition (D70).

**D84. Paying late loses no days.** Inside the grace period a renewal continues from the old end date. After expiry a payment starts a new run from the payment day, anchored on that day of the month.

**D85. Month arithmetic keeps an anchor day.** Adding a month to the 31st lands on the last day of a shorter month, and the next term returns to the 31st. All dates are UTC.

**D86. Renewal price is locked by default.** Customers renew at the price they first paid. The owner can switch to following the package price. Tax is always recomputed from current Payments settings. A package in another currency, a hidden package or a quote-only package falls back to the locked price.

**D87. The daily job plans first, then acts.** `planCycle` is a pure function that decides what to do with each plan (unit tested); the engine only carries it out. Each step records itself (invoice exists, reminder key stored per end date, status changed), so running the job twice, or after a missed day, never duplicates an email or an invoice. A missed day sends only the nearest due reminder.

**D88. The invoice email counts as the first reminder.** When the renewal order is created, every reminder day already due is marked as covered, so the customer never gets two emails on the same day.

**D89. Changing the end date cancels the open invoice.** Free days or stopping renewal cancel an unpaid renewal order (never one with a payment awaiting verification), because the invoice was written for the old term.

**D90. Staff notes never reach the customer.** The history shown on the plan page is written by the engine in plain words. What staff type when adding free days or ending a plan goes to private notes.

**D91. New plans need the module on; renewals do not.** While the module is off, a paid package order starts no plan, but a paid renewal of an existing plan still extends it, so a customer who paid never gets nothing. The daily job does nothing until the module is switched on again.

**D92. Real gateway and cron behaviour was not available while building.** The engine is tested against a real PostgreSQL-compatible database with simulated dates (`runCycle(now)`). The live site was not exercised end to end here, so check one full cycle on a test deployment: buy, wait for or force the lead time, pay the renewal, and call the cron route with your `CRON_SECRET`.

## Phase 7

**D93. Stock is set aside when the order is placed, not when it is paid.** The Phase 5 note planned deduction on payment. With manual methods (bank, bKash) an order can wait days, and two buyers could pay for the same last item. So the order and its stock reservation are created in one transaction, and the stock goes back if the order is cancelled or not paid within the hold time. Orders with a payment waiting for a check are never expired.

**D94. Stock lives on the variant and changes in one statement.** `UPDATE ... SET stock = stock - n WHERE stock >= n RETURNING stock` cannot go below zero however many buyers arrive together. Every simple product also has one variant with an empty key, so there is one code path.

**D95. Stock is changed only by sales and by the Inventory screen.** The product editor sets starting stock once, when the product is first saved. Editing a stale copy of a product can therefore never overwrite stock that changed in the meantime.

**D96. Old variants are switched off, never deleted.** Orders refer to variants. Removing a combination hides it from sale; its history stays.

**D97. Every stock change is a record with the balance after it**, and sale and release records have a unique key per order and variant, so a cancellation or expiry can return stock only once.

**D98. The cart is a cookie of variant ids and quantities.** It holds nothing the buyer could use to change a price: prices, stock, tax and shipping are read again from the database every time. A tampered cookie is ignored. Carts are not stored on the server, so they do not follow a buyer between devices until accounts arrive.

**D99. One store currency.** Products are saved in the currency of Settings > Store and the shipping and threshold amounts use the same one. Mixed currencies in one order would need exchange rates, which the order engine does not have.

**D100. Tax per line, from where the goods go.** Each product has a tax class; the rate comes from the class or a country override for the delivery country (billing country for digital orders). Shipping has its own class. Rounding is done per line and the order stores the sum.

**D101. Shipping rates have no ids in settings.** A rate's id is made from its zone and name (`bangladesh:standard`), so a cart can refer to it. Renaming a rate between choosing it and paying makes the order ask the buyer to choose again.

**D102. Digital files are not copy protected.** A download link is checked on every use (paid order, expiry, limit) and hands out a redirect to the stored file. The file itself sits where you stored it, so a media library file has a public address that is hard to guess but not secret. For files that must stay private, use storage with signed links.

**D103. Digital-only orders complete themselves when paid.** There is nothing to ship, and the files are on the order page.

**D104. Refunds do not return stock.** A refunded physical order may or may not come back; add the stock in the Inventory screen when it does. Cancelling an order does return it.

**D105. No customer accounts yet.** Orders are reached through their private link, as in Phase 5. Saved addresses, order history and wishlists arrive with accounts (Phase 9).

**D106. The live site was not exercised end to end here.** The engine, stock, tax, shipping and downloads are tested against a real PostgreSQL-compatible database. The pages build and typecheck, but browsing the shop, adding to a cart and paying with a real gateway needs one pass on a test deployment.

## Phase 8

**D107. Referrals and Affiliates work without customer accounts.** The specification made both depend on Accounts, which arrive in Phase 9. Customers are identified by the email on their orders, and affiliates by a private dashboard link, as orders and subscriptions already are. The dependency was removed so the modules can be switched on now; accounts can add a login later without changing the data.

**D108. One code box for coupons and referral codes.** A coupon is looked up first, then a customer's referral code. Codes are unique across coupons, affiliates and referral codes, so a code can never mean two things. Affiliate links do not use the code box: they set a cookie.

**D109. A discount is counted when the order is placed, in the same transaction.** The coupon's use limit is raised and checked in one statement and the redemption is recorded with the order, so two buyers cannot share the last use. The order engine gives the use back when an order is cancelled, and a daily job cancels unpaid discounted orders after 72 hours so an abandoned cart cannot hold a limited code for ever.

**D110. Discounts come off products and services, not shipping or tax.** Percent and fixed coupons reduce the subtotal before tax. Free shipping is its own kind and applies only to shop orders. In the shop the discount is shared across lines by price (the last line takes the rounding), so a mixed cart of taxed and untaxed products is taxed correctly.

**D111. Fixed amounts are in the main currency.** Fixed coupons, reward codes and fixed friend discounts apply only to orders in the currency of Settings > Payments. A coupon in another currency would need exchange rates, which the order engine does not have.

**D112. The referral reward is a single-use coupon.** Without accounts there is no balance to credit, so the referrer receives a reward code by email, valid for the number of days in Settings, usable only by their email address. A full refund of the friend's order deactivates the code if it is still unused.

**D113. Referral abuse rules.** The code owner cannot use their own code; the friend must have no paid order and no earlier referral; the minimum order applies; and a referral only pays out when the friend's order is paid. A cancelled order voids a pending referral and lets the friend try again.

**D114. Commission is on what the customer paid for the goods.** The base is the order's subtotal minus its discount: no tax, no shipping. It is stored with the rate and amount at the time, so changing a rate later never rewrites earned commission.

**D115. Last click wins, and attribution happens when the order is placed.** The cookie holds the latest affiliate code. The affiliate is saved on the order then, so a paused or removed link later does not move old orders. The order is only credited if the affiliate was active and is not the buyer.

**D116. Commission is held, then approved by the daily job.** It starts as waiting, becomes ready after the hold (default 14 days) and is paid in one transaction that links the commissions to a payout, so nothing is paid twice. A refund before approval cancels it; after payout it only adds a note, because the money has gone.

**D117. Payouts are records.** Recording a payout does not send money. The Payouts screen shows the affiliate's payout details and the amount, and you send it yourself, as with refunds.

**D118. Subscription renewals earn commission only if the owner allows it.** Off by default; when on, renewal orders inherit the affiliate of the first order.

**D119. The live site was not exercised end to end here.** The engine is tested against a real PostgreSQL-compatible database. The pages and admin screens build and typecheck, but the checkout code box, the `/a` and `/ref` links with real cookies, and the affiliate dashboard need one pass on a test deployment.

## Phase 9

**D120. Customers have their own session, separate from staff.** Staff keep the Auth.js sign-in (D-series, Phase 0). Customers get a random token in an httpOnly cookie that points at a Session row, checked on every request, so signing out or blocking works at once. The two cannot cross: the customer cookie is only read for customers, and the staff check only reads the Auth.js cookie. Social sign-in (Google) is not included: it needs the owner's OAuth keys and is better added when a client wants it.

**D121. Sign-in by password or by emailed link.** No passwords are needed for the link route. Following a link proves the address, so it also confirms it.

**D122. One answer for known and unknown addresses.** Sign-up, forgot-password and sign-in-link requests never say whether an address has an account. A known address gets an email saying so. Sign-in failures use one message. The cost is that a mistyped email at sign-up is only noticed when no confirmation arrives.

**D123. One-time links are hashed and need a button press.** Only the SHA-256 of a token is stored. The emailed address opens a page with a button; the work happens on the press. Mail security scanners follow links automatically and would otherwise use up a one-time link before the customer sees it.

**D124. Guest data is claimed only after the email is confirmed.** Otherwise anyone could register someone else's address and read their orders. Claiming links orders and subscriptions with the same address and no owner; those already owned are never moved.

**D125. Deleting an account keeps orders.** Invoices and payments must be kept for accounting. The order keeps the customer's name and email as entered at checkout, and loses the link to an account. Addresses, wishlist, sessions and the sign-in record are deleted. Referral codes and affiliate records are tied to the email, not the account, and are not deleted: contact the owner to remove those.

**D126. The email address cannot be changed by the customer yet.** It is the key for guest orders, referrals and affiliates. A safe change needs confirmation at both addresses; staff can handle it for now.

**D127. Messages are not included.** The module description mentions messages; they arrive with the inbox in a later phase.

**D128. Checkout stays open to guests.** An account is never required. Signed-in customers get their details and addresses filled in and their orders linked automatically.

**D129. The live site was not exercised end to end here.** The account engine is tested against a real PostgreSQL-compatible database with cookies and email replaced by test doubles. The pages build and typecheck, but sign-up with a real mail provider, the confirm buttons and the cookie in a browser need one pass on a test deployment.

## Phase 10

**D130. Overrides sit beside the code defaults, keyed by template id.** `EmailTemplateOverride` holds only a subject and a body; everything else about a template (who it goes to, its button label, which placeholders it understands) stays in code. One row per id, so editing one email can never affect another and a brand-new phase can add new ids without touching this table.

**D131. Saving is refused if it uses a placeholder nobody declared.** The same check the test suite used from Phase 5 onward (`unknownPlaceholders`) now gates every save, with the exact placeholder named in the error. A preview still renders with a warning instead of refusing, because a preview should show something even while someone is mid-edit.

**D132. `renderEmail` takes text, not an id.** It used to look `EMAIL_TEMPLATES[id]` up itself; now the caller resolves the text first (`resolvedTemplate`, which checks the override table) and hands it the result. This is what lets the same function render a live preview of text that was never saved.

**D133. A test send goes to the staff member's own address, with sample values, and is never saved.** Nobody can use the test button to spam a customer or a stranger, and trying wording out costs nothing.

**D134. SMTP is a second mail provider, not a replacement for Resend.** `MAIL_PROVIDER=smtp` picks it; Resend keeps working as before. It covers any server Resend does not: a host's own mail server, a business inbox with an app password, or another transactional provider used over SMTP.

**D135. No translation yet.** The admin description already says so plainly: every customer gets the one wording set here, regardless of language, until a translation phase arrives.

