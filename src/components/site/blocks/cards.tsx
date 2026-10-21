/* Card templates. Every template reads brand tokens only. */
/* eslint-disable @next/next/no-img-element */
import { Icon } from '../Icon';
import { Img, SmartLink } from './parts';

export interface CardItem {
  title?: string;
  body?: string;
  image?: string | null;
  icon?: string | null;
  number?: string;
  role?: string;
  price?: string;
  period?: string;
  features?: string[];
  badge?: string;
  href?: string | null;
  linkLabel?: string;
}

const box = 'relative h-full rounded-card border border-line bg-surface text-body';

function Wrap({ item, children, className }: { item: CardItem; children: React.ReactNode; className: string }) {
  // Price and product cards have their own button; the others become one big link.
  return item.href ? (
    <SmartLink href={item.href} className={`block transition-colors hover:border-primary ${className}`}>
      {children}
    </SmartLink>
  ) : (
    <div className={className}>{children}</div>
  );
}

const Badge = ({ text }: { text?: string }) => (text ? <span className="absolute -top-3 left-5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-ink">{text}</span> : null);

export function Card({ template, item, index, headingLevel }: { template: string; item: CardItem; index: number; headingLevel: 'h3' | 'h4' }) {
  const H = headingLevel;
  switch (template) {
    case 'numbered':
      return (
        <div className={`${box} p-6`}>
          <span className="font-display text-h3 font-semibold text-primary" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <H className="mt-3 text-h5">{item.title}</H>
          {item.body ? <p className="mt-2">{item.body}</p> : null}
        </div>
      );
    case 'image':
      return (
        <Wrap item={item} className={`${box} overflow-hidden`}>
          <Img src={item.image} alt="" ratio="aspect-[4/3]" className="w-full object-cover" />
          <div className="p-5">
            <H className="text-h5">{item.title}</H>
            {item.body ? <p className="mt-2">{item.body}</p> : null}
          </div>
        </Wrap>
      );
    case 'bigNumber':
      return (
        <div className={`${box} p-6`}>
          <span className="block font-display text-h1 font-semibold text-ink">{item.number}</span>
          <H className="mt-2 text-h6">{item.title}</H>
          {item.body ? <p className="mt-1 text-sm">{item.body}</p> : null}
        </div>
      );
    case 'testimonial':
      return (
        <figure className={`${box} flex flex-col p-6`}>
          <blockquote className="flex-1 text-lg text-ink">“{item.body}”</blockquote>
          <figcaption className="mt-5 flex items-center gap-3">
            {item.image ? <img src={item.image} alt="" className="h-11 w-11 rounded-full object-cover" loading="lazy" /> : null}
            <span>
              <span className="block font-semibold text-ink">{item.title}</span>
              {item.role ? <span className="text-sm text-muted">{item.role}</span> : null}
            </span>
          </figcaption>
        </figure>
      );
    case 'compact':
      return (
        <Wrap item={item} className="flex h-full items-start gap-3 border-b border-line py-4">
          {item.icon ? <span className="mt-0.5 text-primary"><Icon name={item.icon} /></span> : null}
          <span>
            <H className="text-h6">{item.title}</H>
            {item.body ? <span className="mt-1 block text-sm">{item.body}</span> : null}
          </span>
        </Wrap>
      );
    case 'glow':
      return (
        <Wrap item={item} className={`${box} p-6 shadow-card`}>
          <Badge text={item.badge} />
          <span className="grid h-11 w-11 place-items-center rounded-input bg-primary text-primary-ink"><Icon name={item.icon} /></span>
          <H className="mt-4 text-h5">{item.title}</H>
          {item.body ? <p className="mt-2">{item.body}</p> : null}
        </Wrap>
      );
    case 'editorial':
      return (
        <Wrap item={item} className="group block h-full">
          <Img src={item.image} alt="" ratio="aspect-[3/2]" className="w-full rounded-card object-cover" />
          {item.role ? <p className="mt-4 text-sm text-muted">{item.role}</p> : null}
          <H className="mt-1 text-h4 group-hover:underline">{item.title}</H>
          {item.body ? <p className="mt-2">{item.body}</p> : null}
        </Wrap>
      );
    case 'price':
      return (
        <div className={`${box} flex flex-col p-6 ${item.badge ? 'border-primary shadow-card' : ''}`}>
          <Badge text={item.badge} />
          <H className="text-h5">{item.title}</H>
          {item.body ? <p className="mt-1 text-sm">{item.body}</p> : null}
          <p className="mt-5">
            <span className="font-display text-h2 font-semibold text-ink">{item.price}</span>
            {item.period ? <span className="ml-1 text-muted">{item.period}</span> : null}
          </p>
          {item.features?.length ? (
            <ul className="mt-5 flex-1 space-y-2">
              {item.features.map((f) => (
                <li key={f} className="flex gap-2"><span className="mt-0.5 text-success"><Icon name="check" className="h-4 w-4" /></span>{f}</li>
              ))}
            </ul>
          ) : <div className="flex-1" />}
          {item.href ? (
            <SmartLink href={item.href} className={`btn mt-6 ${item.badge ? 'btn-primary' : 'btn-ghost'}`}>{item.linkLabel || 'Choose'}</SmartLink>
          ) : null}
        </div>
      );
    case 'product':
      return (
        <div className={`${box} flex flex-col overflow-hidden`}>
          <Badge text={item.badge} />
          <Img src={item.image} alt="" ratio="aspect-square" className="w-full object-cover" />
          <div className="flex flex-1 flex-col p-5">
            <H className="text-h6">{item.title}</H>
            {item.price ? <p className="mt-1 font-semibold text-ink">{item.price}</p> : null}
            {item.body ? <p className="mt-2 flex-1 text-sm">{item.body}</p> : <div className="flex-1" />}
            {item.href ? <SmartLink href={item.href} className="btn btn-primary mt-4">{item.linkLabel || 'View'}</SmartLink> : null}
          </div>
        </div>
      );
    case 'team':
      return (
        <div className="h-full text-center">
          {item.image ? <img src={item.image} alt="" loading="lazy" className="mx-auto aspect-square w-40 rounded-full object-cover" /> : <span className="mx-auto grid aspect-square w-40 place-items-center rounded-full bg-raised text-muted"><Icon name="user" className="h-10 w-10" /></span>}
          <H className="mt-4 text-h6">{item.title}</H>
          {item.role ? <p className="text-sm text-muted">{item.role}</p> : null}
          {item.body ? <p className="mt-2 text-sm">{item.body}</p> : null}
        </div>
      );
    case 'service':
    default:
      return (
        <Wrap item={item} className={`${box} p-6`}>
          <Badge text={item.badge} />
          {item.icon ? <span className="text-primary"><Icon name={item.icon} className="h-7 w-7" /></span> : null}
          <H className="mt-4 text-h5">{item.title}</H>
          {item.body ? <p className="mt-2">{item.body}</p> : null}
        </Wrap>
      );
  }
}

const escHtml = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Fills the owner's card template. Values are escaped; the template itself was cleaned on render. */
export function fillTemplate(template: string, item: CardItem): string {
  return template
    .replace(/\{\{\s*title\s*\}\}/g, escHtml(item.title))
    .replace(/\{\{\s*body\s*\}\}/g, escHtml(item.body))
    .replace(/\{\{\s*image\s*\}\}/g, escHtml(item.image))
    .replace(/\{\{\s*link\s*\}\}/g, escHtml(item.href))
    .replace(/\{\{\s*price\s*\}\}/g, escHtml(item.price));
}
