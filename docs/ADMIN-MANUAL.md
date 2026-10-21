# Admin manual

This manual grows with each phase. Field-by-field reference is generated into `docs/reference` from the code.

## Signing in

Go to `/admin`. If you are not signed in you are sent to the sign-in page. After five wrong passwords for one email in 15 minutes, sign-in pauses for that email.

Signing out ends the session everywhere it was used, because sessions are stored on the server.

## Modules

**Settings > Modules** lists every feature group with a switch.

- Switching a module **off** hides it from the site, the admin menu, the sitemap and search. Its data stays in the database.
- Switching it back **on** restores everything as it was.
- Some modules need others. Switching on a module that needs another offers to switch that one on too. Switching off a module that others depend on lists them and offers to switch them off too. You can also change only the one module; it then shows as "switched on, but not live" until what it needs is on.
- **Maintenance mode** shows a "back soon" page to visitors. You stay signed in and the admin keeps working.
- Every change is written to the audit log with who made it.

## Roles

| Role | Can use |
| --- | --- |
| Administrator | Everything |
| Editor | Blog, content, media, marketing, SEO, design, form answers |
| Shop manager | Shop, media, form answers, inbox |
| Author | Their blog posts, categories, media |

Make custom roles under **Settings > Roles**: give the role a name and tick the areas it may use. Every screen and action checks the role, not only the menu.

## Lists

Every list in the admin works the same way.

- **Search, filters and sort** sit above the list. Press **Apply** to use them.
- **Columns** lets you show or hide columns. **Saved views** keeps the current search, filters, sort and columns under a name, just for you.
- **Select** rows with the boxes to publish, switch to draft, duplicate or move them to Trash in one go.
- **Quick edit** changes a few common fields without opening the editor.
- **Duplicate** makes a copy named "(copy)", saved as a draft with a new address.
- **Trash** holds deleted items for 30 days. Restore them from the Trash tab, or delete them for good.
- **Export CSV** downloads the selected rows, or the whole list when nothing is selected. Redirects can also be imported from a CSV file with the columns from, to, code, match and active.

## The editor

- Fields are grouped in tabs (Content, SEO, Advanced...). A dot on a tab means a field there needs attention.
- Every field has a short explanation under it. Errors appear right under the field.
- The bar at the bottom shows whether your changes are saved. **Ctrl + S** (or **Cmd + S** on a Mac) saves.
- **Versions** lists the last 30 saves. Restoring one saves it as a new version, so nothing is lost.
- **Scheduled** pages need a publish time and go live then.
- Changing the address of a published page adds a redirect from the old address automatically.

## Media

**Content > Media** holds images, video and documents.

- Upload with the button or drop files on the grid.
- Add **alt text** to every image: it describes the image for people who cannot see it, and images without it cannot be picked in an editor.
- Click an image to set its **focal point**, so crops keep that spot in view.
- **Replace file** swaps the file and keeps its address, so every page shows the new one.
- **Delete** shows where the file is used first.

## Settings

**Settings > Site and contact** holds the site name, tagline, contact email and time zone. Saved settings show on the live site on the next visit.

## Brand

**Settings > Brand** sets the whole look of the site, the emails and the admin.

- **Presets** give a full look in one click. Applying one resets colour, font and shape changes; your pages are not touched.
- **Colours** override the preset one by one. Leave a field empty to follow the preset. Each colour has a dark-mode value.
- The **Contrast check** shows whether text stays readable. Aim for "Pass" everywhere.
- **Typography** picks heading, body and code fonts and the heading sizes. Bengali text automatically uses Noto Sans Bengali.
- **Mode** sets light, dark or "follow the device", and whether visitors can switch.

## Header and footer

**Settings > Header and footer** holds the menu (with dropdowns), the header button, footer columns, social links and the Back to Top button. Links to parts of the site that are switched off are hidden automatically.

## Building pages

Open a page and choose the **Sections** tab.

- **Add section** opens a searchable list. A new section goes after the selected one.
- Drag the handle, or use the arrows, to reorder. **Hide** keeps a section without showing it. **Copy** duplicates it.
- Click a section to edit it. **Content** holds its text and images, **Layout** its grid or carousel, **Design** its spacing, background, width, alignment and entrance animation.
- **Section** and **Columns** can hold other sections; use **Add inside**.
- **Undo** and **Redo** step through your changes. Nothing is live until you save.
- The **Preview** on the right shows unsaved changes at desktop, tablet and phone widths.
- **Save as global section** keeps a section for reuse. Editing it under **Content > Global sections** changes every page that uses it.
- A new page can start from a layout (Home, About, Services, Landing page, Contact, Pricing, Thank you). Replace every placeholder text before publishing.
- Tick **Use as home page** to show a page at the site address. To design the "page not found" screen, publish a page with the address `not-found`.

## Writing posts

**Content > Posts** holds articles and short updates.

- Write in the **Article** box. Use **Heading 2** for main sections and **Heading 3** inside them: they become the contents list readers see.
- Add a section called **Frequently asked questions** (Heading 2) with each question as a **Heading 3** and the answer under it. Search engines can show these answers.
- **Image** opens the media library; **Video** takes a YouTube link; **Callout** adds a highlighted note; **Button** adds a call to action.
- **Import Markdown** and **Export Markdown** move text in and out of the editor.
- Pick a **Category** and a few **Tags**. The author defaults to you.
- **Sections after the article** adds builder sections, such as a call to action, under the post.
- Choose **Scheduled** and a time to publish later.

## Portfolio, case studies and products

- **Content > Portfolio** holds projects. Upload a tall **full-page screenshot** (1440 pixels wide); it scrolls inside a browser frame when visitors hover over it. Set the speed in **Settings > Portfolio**.
- **Content > Case studies** tells a client story in three parts with key numbers. Use real numbers only.
- **Content > Your products** lists your own apps on `/apps`, and in the footer when "List in the footer" is on.
- **Marketing > Testimonials** holds real quotes from real clients. The Testimonials section shows them.
- **Settings > Resume** fills the printable page at `/resume`.

## Starting content

A new site can start from a preset: `SEED_PRESET=agency npm run db:seed` (blank, freelancer, agency, shop or local). It switches on the right modules, picks a brand preset, builds the menu and adds placeholder pages, plus sample posts and projects saved as drafts. Replace every placeholder before launch. Running it again never changes existing content.

## SEO

Every page, post, project, case study, product and category has **SEO**, **Social** and **Schema** tabs.

- Set a **Focus keyword**: the phrase people search for. The **SEO score** (0 to 100) checks the page against it and lists what to fix, most useful first. Green is 80 or more, amber 60 to 79, red below 60. It is advice; you can always publish.
- The **Google preview** shows how the result may look on desktop and phone, with length meters for the title and description.
- **Pages you could link to** suggests related pages and posts for internal links.
- **Social** sets what shows when the page is shared. Without an image, one is made automatically from the title in your brand colours.
- **Schema** shows the structured data search engines read, with plain explanations and warnings. Pick How-to, Event, Course or Video to add those details. **Rich Results Test** opens Google's checker for the live page.

**SEO > SEO overview** lists everything with its score, lowest first. Use the filters to find pages without a description or keyword, keywords used twice, and hidden pages.

**Settings > SEO** holds the title format, business details (address, hours and area for local results), the staging switch that hides the whole site from search engines, the summary for AI assistants (/llms.txt), IndexNow and the Google and Bing verification codes.

## Redirects and the 404 log

- **Marketing > Redirects**: send old addresses to new ones. *Exact* matches one address, *Starts with* moves a whole section, *Pattern* uses a regular expression. 410 tells search engines a page is gone. Changing the address of a live page adds a redirect automatically.
- **Marketing > 404 log**: addresses visitors asked for that do not exist, most frequent first. **Create redirect** opens the redirect form already filled in. Delete rows you do not need.

## Selling services

1. **Shop > Services**: add a service (it becomes a tab on the pricing page). Under **Checkout questions** add what buyers must tell you, for example their website.
2. **Shop > Packages**: add packages to the service. Choose **Buy now** (goes to checkout) or **Request a quote** (opens the contact form with the package filled in).
   - For monthly packages, **Offer a yearly choice** adds a switch to the card. The yearly price is monthly x 12 minus the discount percent, or a fixed yearly price if you set one. Cards show "You save X (Y%)".
   - Hourly packages let buyers pick the number of hours.
   - A package that can be bought needs a price above zero. Prices are always taken from here, never from the buyer's browser.
3. The **Pricing packages** section shows them on any page, and **/pricing** lists them all.

## Getting paid

- **Settings > Payments**: switch on the methods you want and put them in order. Manual methods need their details (account number and name). Set the local currency and rate if buyers pay in BDT or similar.
- **Settings > API keys**: paste the keys for Stripe, PayPal and SSLCommerz. A method stays hidden until its keys are set.
- In each gateway, add the webhook address of your site: `/api/payments/stripe/webhook` (events checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, charge.refunded), `/api/payments/paypal/webhook` (PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.REFUNDED) and, for SSLCommerz, set the IPN address to `/api/payments/sslcommerz/webhook`.
- Test mode: PayPal and SSLCommerz use their sandbox while **Test mode** is on for the method; Stripe follows the key (sk_test_ or sk_live_). Switch off before going live.

## Working an order

**Shop > Orders** lists every order. Open one to:
- **Check a manual payment**: you see the transaction ID, sender and receipt. **Payment received** marks the order paid and sends the receipt and invoice. **Reject** asks the customer to send the details again. A warning appears if the same transaction ID was used on another order.
- **Change the status** along the allowed path (waiting, checking, paid, in progress, shipped, delivered, completed, cancelled, refunded). Tick the box to email the customer.
- **Post an update** with an optional file; it shows on the customer's order page. **Private notes** are for staff only.
- **Record a refund**. This records it only: send the money back in your gateway or bank.
- **Email the invoice**. Invoices are numbered in order (INV-2026-0001) and created when the order is paid.

If a gateway reports a different amount than the order total, the order is **not** marked paid: it goes to "checking payment" and you get an email.

## Subscriptions

Switch on **Subscriptions** under Modules. Any package billed monthly or yearly now starts a subscription when its first order is paid.

**How renewals work.** Nothing is charged automatically. About a week before a plan ends we create a renewal invoice and email it. The customer pays it on their order page with any payment method you offer, and the plan continues from its old end date. Reminders follow (by default 7, 3 and 1 days before the end), each sent once. If the end date passes unpaid, the plan stays active for the grace period (default 3 days) and then expires. Customers see all of this on their private plan page, linked from every email.

**Working a plan.** Open it from Subscriptions. You can email the renewal invoice now or again, add free days (this also brings an ended plan back and cancels the old invoice), stop renewing (the plan ends on its end date), end the plan today, and keep private notes. Orders, terms, history and the emails sent are listed on the same screen.

**Customers who pay you directly.** Use Add subscription: pick a package or type a plan name, the price per term, the customer and the start date. The first term is recorded as paid and renewals then work as usual.

**Refunds.** Recording a full refund on the order that paid the current term ends the plan (you can switch this off in settings). Money still has to be returned in your gateway or bank, as for any refund.

**Settings.** Settings > Subscriptions sets how early the invoice goes out, the reminder days, the grace period, whether renewals keep the signup price or follow the package price, and what customers may do themselves (stop renewing, start again).

**Daily job.** Set `CRON_SECRET`. The included `vercel.json` runs `/api/cron/subscriptions` once a day. If it did not run, nothing is lost: the next run catches up.

## Store

Switch on **Store** under Modules. Under Shop you get Products, Shop categories and Inventory, and Settings gets a Store group.

**Set up once (Settings > Store).** Choose the store currency, add tax classes (Standard, Reduced, Digital) with their rate, and add country rates where the rate differs, such as VAT for the EU. Add shipping rates: each row is a way to ship to some countries (two-letter codes, or * for everywhere else) priced as one price, per item, by weight, or free, with an optional free shipping amount. Whether prices include tax is in Settings > Payments.

**Adding a product.** Choose physical or digital, write the description, set the price and tax class, and add pictures. For a product with choices, add options in the Options tab (Size with S, M, L) and save: the combinations appear below, where each can have its own SKU, price and picture. Switch off "Sold" to stop selling one combination.

**Stock.** For a product without options, enter the starting stock on first save. After that, change stock only in Shop > Inventory: add what arrives, remove what breaks, with a note. Sales take stock off by themselves and cancelled or unpaid orders put it back. Set a low stock level to get an email when a variant runs low. Turn "Track stock" off for things made to order.

**Unpaid orders.** Stock is set aside when an order is placed. If it is not paid within the hold time (Settings > Store > Stock, 48 hours by default), the order is cancelled and the stock goes back on sale. Orders where the buyer sent a manual payment for checking are left alone until you decide.

**Digital products.** Add files in the Digital tab, and choose how many times each can be downloaded and for how many days. After payment the order is completed and the buyer sees the download links on their order page.

**Shipping an order.** Open the order: the delivery address is on it. Move it to Shipped or Delivered and post an update with the tracking number, which the customer sees on their order page.

**Refunds.** Recording a refund does not put stock back. If the goods return, add them in Inventory.

## Coupons, referrals and affiliates

Switch on **Coupons**, **Referrals** and **Affiliates** under Modules. They appear under Marketing. Buyers type codes in one box at checkout; discounts come off the products or services, before tax, never off shipping.

**Coupons.** Marketing > Coupons. Choose a percentage (with an optional cap), a fixed amount or free shipping (shop orders only). Under Rules set what it works on, the smallest order, first orders only and the dates; under Limits set total uses, uses per customer and, if you want, one email address that may use it. Switch a code off instead of deleting it once it has been used. Coupon uses lists every order a code was on. A cancelled order, or one left unpaid for 72 hours, gives its use back, so abandoned carts do not use up a limited code.

**Referrals.** Settings > Referrals sets what a friend gets, what the customer who shared earns, and the smallest first order. After a customer's first paid order they get a personal code and a sharing link by email. When a friend pays their first order with it, the customer gets a single-use reward code by email. Nobody can use their own code, repeat customers cannot use a friend's code, and a full refund takes the reward back if it was not used. See Marketing > Referrals.

**Affiliates.** Settings > Affiliates sets the default commission, how long a link counts, how long commission is held, the smallest payout and whether applications are approved automatically. People apply on /affiliates; approve them under Marketing > Payouts or Marketing > Affiliates and they get a link (/a/CODE) and a private dashboard. Commission is worked out on what the customer paid for products or services after discounts, without tax and shipping. It is held for a few days so refunds can cancel it, then becomes ready to pay.

**Paying affiliates.** Marketing > Payouts lists who is ready to be paid, their payout details and the amount. Send the money yourself, then press Record payout with how you paid and a reference: the commissions are marked paid, the affiliate is emailed and nothing can be paid twice. If an order is refunded after its commission was paid, the commission shows a note so you can recover it from the next payout.

**Daily job.** The included `vercel.json` runs `/api/cron/growth` once a day to make commission ready and give back stuck codes.

## Customer accounts

Customer accounts are on by default under Modules. Visitors can still buy as guests; an account adds an order history, downloads, saved addresses and a wishlist, and links their subscriptions.

**What customers see.** An account icon in the header leads to /account. They sign up with an email and password and confirm the email by a link. They can also ask for a sign-in link by email, or reset a forgotten password. Orders and subscriptions placed earlier with the same email appear after they confirm it.

**Customers (Shop > Customers).** Everyone with an account, with when they confirmed their email and last signed in. You can fix a name or phone, and Block someone: they are signed out everywhere and cannot sign in, but their orders and subscriptions stay. You cannot see or set passwords: a customer who forgets theirs uses the Forgot password link.

**Privacy.** Customers can download all their data and delete their account from their profile. Deleting keeps orders and invoices (you must keep them) but unlinks them from the account. A customer who wants a different email address needs your help: contact the person and change it with them.

**Mail matters.** Confirmation, reset and sign-in links are emails. If a customer says no email arrived, check Settings > Email and the sender address first.

## Email templates

Settings > Email templates lists every automatic email, grouped by what it is for. Open one to change its subject and text. The right side shows a live preview in your brand colours, filled with sample values, as you type. Only the placeholders listed under the text box work; anything else is refused when you try to save, with the exact placeholder named so you can fix it.

Use Send me a test to receive the email yourself with sample values, without saving anything, so you can check it looks right in your own inbox. Reset to default throws away your changes and goes back to the built-in wording for that one email.

Email providers: set `MAIL_PROVIDER` to `resend` or `smtp` as before; SMTP is now available for any mail server that is not Resend, such as a hosting provider's mail server or a business inbox with an app password, with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `SMTP_PASS`.

