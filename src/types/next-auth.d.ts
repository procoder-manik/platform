import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    /** Id of the server-side Session row. */
    sid?: string;
  }
  interface User {
    sid?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    sid?: string;
  }
}
