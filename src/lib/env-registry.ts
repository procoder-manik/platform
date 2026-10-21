/** Every environment variable the platform reads. Used by the generated reference docs and the health panel. */
export interface EnvVar {
  name: string;
  required: 'yes' | 'no' | 'first run' | 'per provider';
  purpose: string;
  phase: number;
}

export const ENV_VARS: readonly EnvVar[] = [
  { name: 'DATABASE_URL', required: 'yes', purpose: 'Pooled PostgreSQL address used by the app.', phase: 0 },
  { name: 'DIRECT_URL', required: 'yes', purpose: 'Direct PostgreSQL address used by migrations.', phase: 0 },
  { name: 'DATABASE_POOL_MAX', required: 'no', purpose: 'Connections per server instance. Default 5.', phase: 0 },
  { name: 'AUTH_SECRET', required: 'yes', purpose: 'Signs sessions and derives the key that encrypts saved API keys. 32+ characters.', phase: 0 },
  { name: 'SITE_URL', required: 'yes', purpose: 'Public address. Used by background jobs and as the email link fallback.', phase: 0 },
  { name: 'ADMIN_EMAIL', required: 'first run', purpose: 'First administrator created by npm run db:seed.', phase: 0 },
  { name: 'ADMIN_PASSWORD', required: 'first run', purpose: 'Password for that administrator, 12+ characters.', phase: 0 },
  { name: 'ALLOWED_HOSTS', required: 'no', purpose: 'Extra host names (comma separated) the site may be reached on, for example a preview domain. Links in emails use the request host only when it is SITE_URL or listed here.', phase: 5 },
  { name: 'STRIPE_SECRET_KEY', required: 'per provider', purpose: 'Stripe secret key. May instead be saved under Settings, API keys. The environment wins.', phase: 5 },
  { name: 'STRIPE_WEBHOOK_SECRET', required: 'per provider', purpose: 'Stripe webhook signing secret (whsec_...).', phase: 5 },
  { name: 'PAYPAL_CLIENT_ID', required: 'per provider', purpose: 'PayPal client ID.', phase: 5 },
  { name: 'PAYPAL_CLIENT_SECRET', required: 'per provider', purpose: 'PayPal client secret.', phase: 5 },
  { name: 'PAYPAL_WEBHOOK_ID', required: 'no', purpose: 'PayPal webhook ID, needed to accept PayPal webhooks.', phase: 5 },
  { name: 'SSLCOMMERZ_STORE_ID', required: 'per provider', purpose: 'SSLCommerz store ID.', phase: 5 },
  { name: 'SSLCOMMERZ_STORE_PASSWORD', required: 'per provider', purpose: 'SSLCommerz store password.', phase: 5 },
  { name: 'MODULE_PROXY_TTL_MS', required: 'no', purpose: 'How long the proxy keeps module switches in memory. Default 3000.', phase: 0 },
  { name: 'STORAGE_PROVIDER', required: 'per provider', purpose: 'cloudinary or s3 (r2 works as an alias). Empty uses local disk in development and turns uploads off in production.', phase: 1 },
  { name: 'CLOUDINARY_CLOUD_NAME', required: 'per provider', purpose: 'Cloudinary cloud name.', phase: 1 },
  { name: 'CLOUDINARY_API_KEY', required: 'per provider', purpose: 'Cloudinary API key.', phase: 1 },
  { name: 'CLOUDINARY_API_SECRET', required: 'per provider', purpose: 'Cloudinary API secret. Signs uploads; never sent to the browser.', phase: 1 },
  { name: 'S3_ENDPOINT', required: 'per provider', purpose: 'S3-compatible endpoint, for R2: https://<account>.r2.cloudflarestorage.com', phase: 1 },
  { name: 'S3_REGION', required: 'no', purpose: 'Region. R2 uses auto (the default).', phase: 1 },
  { name: 'S3_BUCKET', required: 'per provider', purpose: 'Bucket name.', phase: 1 },
  { name: 'S3_ACCESS_KEY_ID', required: 'per provider', purpose: 'Access key with read and write rights on the bucket.', phase: 1 },
  { name: 'S3_SECRET_ACCESS_KEY', required: 'per provider', purpose: 'Secret for that access key.', phase: 1 },
  { name: 'S3_PUBLIC_URL', required: 'per provider', purpose: 'Public address of the bucket or its custom domain, used in file links.', phase: 1 },
  { name: 'TRASH_RETENTION_DAYS', required: 'no', purpose: 'Days an item stays in Trash before the daily cleanup deletes it. Default 30.', phase: 1 },
  { name: 'MAIL_PROVIDER', required: 'per provider', purpose: 'resend or smtp. Empty prints emails to the server log.', phase: 0 },
  { name: 'RESEND_API_KEY', required: 'per provider', purpose: 'Resend API key.', phase: 0 },
  { name: 'MAIL_FROM', required: 'per provider', purpose: 'Sender address on a verified domain.', phase: 0 },
  { name: 'SMTP_HOST', required: 'per provider', purpose: 'SMTP server address, when MAIL_PROVIDER is smtp.', phase: 10 },
  { name: 'SMTP_PORT', required: 'per provider', purpose: 'SMTP port. 587 for STARTTLS, 465 for implicit TLS.', phase: 10 },
  { name: 'SMTP_SECURE', required: 'per provider', purpose: '"true" for implicit TLS (port 465). Leave empty otherwise.', phase: 10 },
  { name: 'SMTP_USER', required: 'per provider', purpose: 'SMTP login, when the server needs one.', phase: 10 },
  { name: 'SMTP_PASS', required: 'per provider', purpose: 'SMTP password or app password.', phase: 10 },
  { name: 'NOTIFY_EMAIL', required: 'no', purpose: 'Where owner alerts go.', phase: 10 },
  { name: 'CRON_SECRET', required: 'no', purpose: 'Bearer token (16+ characters) that protects /api/cron routes.', phase: 1 },
  { name: 'UPSTASH_REDIS_REST_URL', required: 'no', purpose: 'Shared rate limits across server instances.', phase: 0 },
  { name: 'UPSTASH_REDIS_REST_TOKEN', required: 'no', purpose: 'Token for the Upstash URL above.', phase: 0 },
];
