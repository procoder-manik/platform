/**
 * Transactional email templates: defaults in code, placeholders in {braces}. Phase 10 adds editing in the
 * admin with a live preview and a test send; the ids and placeholders stay the same.
 */
export const PLACEHOLDERS = ['name', 'number', 'package', 'total', 'link', 'invoice_link', 'message', 'method', 'transaction', 'status', 'plan', 'period', 'ends', 'days', 'manage_link', 'code', 'amount'] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

export interface EmailTemplate {
  to: 'customer' | 'owner';
  subject: string;
  body: string;
  /** Label of the button that opens {link}. */
  cta?: string;
}

export const EMAIL_TEMPLATES = {
  'order.received': { to: 'customer', subject: 'We received your order {number}', cta: 'View your order', body: 'Hi {name},\n\nThank you for your order {number} for {package}. The total is {total}.\n\nYou can pay, follow progress and download your invoice on your private order page.' },
  'order.paid': { to: 'customer', subject: 'Payment confirmed for order {number}', cta: 'View your order', body: 'Hi {name},\n\nWe received your payment of {total} for order {number} ({package}). Thank you.\n\nYour invoice is ready: {invoice_link}' },
  'order.started': { to: 'customer', subject: 'We have started on order {number}', cta: 'Follow progress', body: 'Hi {name},\n\nGood news: work on {package} has started. We will post updates on your order page.' },
  'order.shipped': { to: 'customer', subject: 'Order {number} has shipped', cta: 'View your order', body: 'Hi {name},\n\nYour order {number} is on its way.' },
  'order.delivered': { to: 'customer', subject: 'Order {number} was delivered', cta: 'View your order', body: 'Hi {name},\n\nYour order {number} has been delivered. Tell us if anything is not right.' },
  'order.completed': { to: 'customer', subject: 'Order {number} is complete', cta: 'View your order', body: 'Hi {name},\n\nYour order {number} ({package}) is complete. Thank you for working with us.' },
  'order.cancelled': { to: 'customer', subject: 'Order {number} was cancelled', cta: 'View your order', body: 'Hi {name},\n\nYour order {number} has been cancelled. If this is a surprise, just reply to this email.' },
  'order.refunded': { to: 'customer', subject: 'Refund for order {number}', cta: 'View your order', body: 'Hi {name},\n\nWe have refunded order {number}. The money can take a few days to reach you, depending on your bank or wallet.' },
  'order.payment_failed': { to: 'customer', subject: 'We could not confirm the payment for order {number}', cta: 'Pay again', body: 'Hi {name},\n\nWe could not confirm your payment for order {number}.\n\n{message}\n\nYou can try again on your order page.' },
  'order.update': { to: 'customer', subject: 'An update on order {number}', cta: 'View your order', body: 'Hi {name},\n\n{message}' },
  'order.invoice': { to: 'customer', subject: 'Invoice {number}', cta: 'Open your invoice', body: 'Hi {name},\n\nYour invoice for order {number} ({total}) is ready.' },
  'subscription.started': { to: 'customer', subject: 'Your plan {plan} is active', cta: 'View your plan', body: 'Hi {name},\n\nYour {period} plan {plan} ({number}) is now active and runs until {ends}.\n\nShortly before it ends we will email you a renewal invoice. Nothing is charged automatically: you pay each renewal yourself, and you can stop renewing at any time on your plan page.' },
  'subscription.renewal_due': { to: 'customer', subject: 'Your renewal for {plan} is ready', cta: 'Pay the renewal', body: 'Hi {name},\n\nYour plan {plan} ends on {ends}. The renewal invoice is {total}. Pay it before then and the plan continues without a break.\n\nNothing is charged automatically. To stop renewing instead, open your plan page: {manage_link}' },
  'subscription.reminder': { to: 'customer', subject: 'Your plan {plan} ends in {days}', cta: 'Pay the renewal', body: 'Hi {name},\n\nA reminder: your plan {plan} ends on {ends}, which is in {days}. The renewal invoice ({total}) is still waiting for payment.\n\nIf you do not want to renew, you can stop renewing on your plan page: {manage_link}' },
  'subscription.renewed': { to: 'customer', subject: 'Renewal received for {plan}', cta: 'View your plan', body: 'Hi {name},\n\nThank you. We received {total} and your plan {plan} now runs until {ends}.\n\nYour invoice: {invoice_link}' },
  'subscription.past_due': { to: 'customer', subject: 'Your plan {plan} needs payment', cta: 'Pay the renewal', body: 'Hi {name},\n\nYour plan {plan} reached its end date on {ends} and the renewal has not been paid.\n\n{message}' },
  'subscription.expired': { to: 'customer', subject: 'Your plan {plan} has expired', cta: 'View your plan', body: 'Hi {name},\n\nYour plan {plan} ({number}) expired because the renewal was not paid.\n\n{message}' },
  'subscription.ended': { to: 'customer', subject: 'Your plan {plan} has ended', cta: 'View your plan', body: 'Hi {name},\n\nAs you asked, your plan {plan} ({number}) did not renew and ended on {ends}. Thank you for being with us.\n\n{message}' },
  'subscription.stopped': { to: 'customer', subject: 'We will not renew {plan}', cta: 'View your plan', body: 'Hi {name},\n\nAs you asked, we will not renew your plan {plan}. It stays active until {ends}.\n\nChanged your mind? Use the button on your plan page and it will renew as before.' },
  'owner.subscription': { to: 'owner', subject: 'Subscription {number}: {status}', cta: 'Open the subscription', body: '{message}' },
  'referral.invite': { to: 'customer', subject: 'Share {code} and your friends save {amount}', cta: 'Your sharing link', body: 'Hi {name},\n\nThank you for your order. Your personal code is {code}. A friend who uses it on their first order gets {amount}, and you get a reward once their order is paid.\n\nOr share this link, which fills the code in for them: {link}' },
  'referral.reward': { to: 'customer', subject: 'Your reward: {amount} off', cta: 'Use your reward', body: 'Hi {name},\n\nA friend ordered with your code and paid, so here is your reward: {amount} off your next order with the code {code}. It works until {ends}.' },
  'affiliate.received': { to: 'customer', subject: 'We received your affiliate application', cta: 'Your dashboard', body: 'Hi {name},\n\nThank you for applying. We will look at your application and email you when it is approved. Your private dashboard is here and will show your link once you are approved.' },
  'affiliate.welcome': { to: 'customer', subject: 'You are in: your affiliate link', cta: 'Open your dashboard', body: 'Hi {name},\n\nWelcome to the affiliate programme. You earn {amount} of every order you bring.\n\nYour link: {manage_link}\nYour code: {code}\n\nYour dashboard shows clicks, orders, commission and payouts. Keep its address private.' },
  'affiliate.approved': { to: 'customer', subject: 'Your affiliate application was approved', cta: 'Open your dashboard', body: 'Hi {name},\n\nGood news: you are approved. You earn {amount} of every order you bring.\n\nYour link: {manage_link}\nYour code: {code}' },
  'affiliate.payout': { to: 'customer', subject: 'We sent you a payout of {amount}', cta: 'See your payouts', body: 'Hi {name},\n\nWe recorded a payout of {amount} for your commission.\n\n{message}' },
  'owner.affiliate': { to: 'owner', subject: 'Affiliate application: {name}', cta: 'Open the affiliate', body: '{message}' },
  'account.verify': { to: 'customer', subject: 'Confirm your email address', cta: 'Confirm my email', body: 'Hi {name},\n\nThanks for creating an account. Please confirm your email address so we can link your earlier orders to it. The link works for 3 days.\n\nIf you did not create an account, you can ignore this email.' },
  'account.reset': { to: 'customer', subject: 'Reset your password', cta: 'Choose a new password', body: 'Hi {name},\n\nSomeone asked to reset the password for this account. The link works for one hour and only once.\n\nIf it was not you, you can ignore this email. Your password stays as it is.' },
  'account.magic': { to: 'customer', subject: 'Your sign-in link', cta: 'Sign in', body: 'Hi {name},\n\nUse this link to sign in. It works for 15 minutes and only once.\n\nIf you did not ask for it, you can ignore this email.' },
  'account.exists': { to: 'customer', subject: 'You already have an account', cta: 'Sign in', body: 'Hi {name},\n\nSomeone tried to create an account with this email address, but you already have one. You can sign in, or reset your password if you forgot it: {manage_link}\n\nIf it was not you, no action is needed.' },
  'account.changed': { to: 'customer', subject: 'Your password was changed', cta: 'Open your account', body: 'Hi {name},\n\nThe password of your account was just changed and you were signed out everywhere else.\n\nIf this was not you, reset your password right away: {manage_link}' },
  'owner.lowstock': { to: 'owner', subject: 'Low stock: {package}', cta: 'Open the inventory', body: '{message}' },
  'owner.paid': { to: 'owner', subject: 'New paid order {number}: {total}', cta: 'Open the order', body: '{name} paid {total} for {package} by {method}.' },
  'owner.proof': { to: 'owner', subject: 'Payment needs checking: order {number}', cta: 'Check the payment', body: '{name} says they paid {total} for order {number} by {method}.\n\nTransaction: {transaction}\n\nCheck your account, then confirm or reject the payment on the order.' },
  'owner.attention': { to: 'owner', subject: 'Order {number} needs your attention', cta: 'Open the order', body: '{message}' },
} as const satisfies Record<string, EmailTemplate>;

export type TemplateId = keyof typeof EMAIL_TEMPLATES;

export function fill(text: string, vars: Partial<Record<Placeholder, string>>): string {
  return text.replace(/\{([a-z_]+)\}/g, (match, key: string) => (key in vars ? (vars[key as Placeholder] ?? '') : match));
}

/** Placeholders in a template that no variable list knows, shown as warnings in the editor. */
export function unknownPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1] as string))].filter((p) => !(PLACEHOLDERS as readonly string[]).includes(p));
}

/** Placeholders a template actually uses, so the editor can show only the relevant sample values. */
export function placeholdersIn(text: string): Placeholder[] {
  return [...new Set([...text.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1] as string))].filter((p): p is Placeholder => (PLACEHOLDERS as readonly string[]).includes(p));
}

/** A short, human label and a group for every template id, so the editor can list them sensibly. */
export const TEMPLATE_GROUP: Record<TemplateId, string> = {
  'order.received': 'Orders', 'order.paid': 'Orders', 'order.started': 'Orders', 'order.shipped': 'Orders', 'order.delivered': 'Orders', 'order.completed': 'Orders', 'order.cancelled': 'Orders', 'order.refunded': 'Orders', 'order.payment_failed': 'Orders', 'order.update': 'Orders', 'order.invoice': 'Orders',
  'subscription.started': 'Subscriptions', 'subscription.renewal_due': 'Subscriptions', 'subscription.reminder': 'Subscriptions', 'subscription.renewed': 'Subscriptions', 'subscription.past_due': 'Subscriptions', 'subscription.expired': 'Subscriptions', 'subscription.ended': 'Subscriptions', 'subscription.stopped': 'Subscriptions',
  'referral.invite': 'Referrals', 'referral.reward': 'Referrals',
  'affiliate.received': 'Affiliates', 'affiliate.welcome': 'Affiliates', 'affiliate.approved': 'Affiliates', 'affiliate.payout': 'Affiliates',
  'account.verify': 'Accounts', 'account.reset': 'Accounts', 'account.magic': 'Accounts', 'account.exists': 'Accounts', 'account.changed': 'Accounts',
  'owner.subscription': 'Alerts to you', 'owner.affiliate': 'Alerts to you', 'owner.lowstock': 'Alerts to you', 'owner.paid': 'Alerts to you', 'owner.proof': 'Alerts to you', 'owner.attention': 'Alerts to you',
};

const SAMPLE: Record<Placeholder, string> = {
  name: 'Jordan', number: 'WL-261020-K7QX', package: 'Website care plan: Pro', total: '$149.00', link: '#', invoice_link: '#',
  message: 'This is a sample message, shown here as it would appear in a real email.', method: 'bKash', transaction: 'TX4821001', status: 'Active',
  plan: 'Care plan: Pro', period: 'monthly', ends: '20 November 2026', days: '3 days', manage_link: '#', code: 'FRIEND-K7QX2M', amount: '10% off',
};

/** Sample values for every placeholder a template uses, for the live preview and a test send. */
export function sampleVarsFor(id: TemplateId): Partial<Record<Placeholder, string>> {
  const t = EMAIL_TEMPLATES[id];
  const used = new Set(placeholdersIn(`${t.subject} ${t.body}`));
  return Object.fromEntries(Object.entries(SAMPLE).filter(([k]) => used.has(k as Placeholder)));
}
