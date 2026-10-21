import { notFound } from 'next/navigation';

/** The proxy rewrites paths of switched-off modules here, which renders the custom 404 with a 404 status. */
export default function ModuleUnavailable(): never {
  notFound();
}
