import { NextResponse, type NextRequest } from 'next/server';
import { modulesForPath } from '@/lib/modules/logic';
import { countRedirectHit, matchRedirect, proxyModuleMetas, proxyModuleStates, proxyRedirects } from '@/lib/modules/proxy-state';

/** Internal page that renders the custom 404 with a 404 status. */
const OFF_PATH = '/module-unavailable';

/**
 * Runs before every page request.
 * 1. Redirects (exact, prefix and pattern) with hit counts; 410 answers "gone".
 * 2. A path owned by a switched-off module gets the custom 404 before any page work.
 * 3. Maintenance mode shows the maintenance page to visitors; the admin, API and sign-in keep working.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const isApi = pathname.startsWith('/api/');
  const next = () => NextResponse.next();

  if (!isAdmin && !isApi) {
    const found = matchRedirect(await proxyRedirects(), pathname);
    if (found) {
      countRedirectHit(found.redirect.id);
      if (found.redirect.code === 410) return new NextResponse('This page has been removed.', { status: 410, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      const target = /^https?:\/\//.test(found.to) ? found.to : new URL(`${found.to}${request.nextUrl.search}`, request.url);
      return NextResponse.redirect(target, found.redirect.code === 302 ? 302 : 301);
    }
  }

  const owners = isApi ? [] : modulesForPath(proxyModuleMetas(), pathname);
  const checkMaintenance = !isAdmin && !isApi && pathname !== '/maintenance';
  if (owners.length === 0 && !checkMaintenance) return next();

  const states = await proxyModuleStates();
  if (owners.some((id) => states[id] !== true)) return NextResponse.rewrite(new URL(OFF_PATH, request.url));
  if (checkMaintenance && states.maintenance === true) return NextResponse.rewrite(new URL('/maintenance', request.url));
  return next();
}

export const config = {
  // Skip static files, images and Next internals. Generated files (sitemap, robots, feeds) check modules themselves.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)'],
};
