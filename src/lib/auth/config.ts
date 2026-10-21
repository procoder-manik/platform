import 'server-only';
import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { rateLimit } from '@/lib/adapters/ratelimit';
import { writeAudit } from '@/lib/audit';
import { verifyPassword } from './password';
import { createDbSession, deleteDbSession, SESSION_MAX_AGE_SECONDS } from './session-store';

class InvalidSignIn extends CredentialsSignin {
  override code = 'invalid';
}
class TooManyAttempts extends CredentialsSignin {
  override code = 'rate_limited';
}

const credentialsSchema = z.object({
  email: z.email().max(254).transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(200),
});

/**
 * Staff sign-in with Auth.js.
 *
 * Auth.js only allows the credentials provider with JWT cookies. To keep the security of database
 * sessions, the cookie carries nothing but the id of a Session row (`sid`). Every request checks that
 * row (src/lib/auth/guards.ts), so deleting it signs the user out at once. See docs/DECISIONS.md.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: '/admin/login', error: '/admin/login' },
  providers: [
    Credentials({
      credentials: { email: { label: 'Email' }, password: { label: 'Password', type: 'password' } },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) throw new InvalidSignIn();
        const { email, password } = parsed.data;
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

        const [byEmail, byIp] = await Promise.all([
          rateLimit(`signin:email:${email}`, { max: 5, windowMs: 15 * 60_000 }),
          rateLimit(`signin:ip:${ip}`, { max: 30, windowMs: 15 * 60_000 }),
        ]);
        if (!byEmail.ok || !byIp.ok) throw new TooManyAttempts();

        const user = await getDb().user.findUnique({ where: { email } });
        const valid = !!user?.passwordHash && (await verifyPassword(user.passwordHash, password));
        if (!user || !valid || user.kind !== 'STAFF' || user.blocked) {
          await writeAudit({ action: 'signin.failed', entity: 'user', entityId: user?.id, ip, diff: { email } });
          throw new InvalidSignIn();
        }

        const session = await createDbSession(user.id, { ip, userAgent: request.headers.get('user-agent') });
        await writeAudit({ userId: user.id, action: 'signin', entity: 'user', entityId: user.id, ip });
        return { id: user.id, email: user.email, name: user.name, sid: session.sessionToken };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user && 'sid' in user && typeof user.sid === 'string') token.sid = user.sid;
      return token;
    },
    session({ session, token }) {
      return { ...session, sid: typeof token.sid === 'string' ? token.sid : undefined };
    },
  },
  events: {
    async signOut(message) {
      const sid = 'token' in message ? message.token?.sid : undefined;
      if (typeof sid === 'string') await deleteDbSession(sid);
    },
  },
});
