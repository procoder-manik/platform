import { describe, expect, it } from 'vitest';
import { presign } from '@/lib/adapters/storage/sigv4';
import { signParams } from '@/lib/adapters/storage/cloudinary';
import { sniff, svgProblem } from '@/lib/security/file-type';

describe('SigV4 presigning', () => {
  it('matches the example in the AWS documentation', () => {
    const url = presign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      expiresSeconds: 86400,
      now: new Date('2013-05-24T00:00:00Z'),
    });
    expect(url).toContain('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
  });
});

describe('Cloudinary signing', () => {
  it('signs sorted parameters with the secret appended', () => {
    // Example from Cloudinary's authentication documentation.
    expect(signParams({ timestamp: '1315060510', public_id: 'sample_image' }, 'abcd')).toBe('b4ad47fb4e25c7bf5f92a20089f9db59bc302313');
  });
});

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0x20)]);
const text = (s: string) => new TextEncoder().encode(s);

describe('file sniffing', () => {
  it('detects images, documents and fonts by their bytes', () => {
    expect(sniff(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe('image/jpeg');
    expect(sniff(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe('image/png');
    expect(sniff(text('%PDF-1.7 ...'))?.mime).toBe('application/pdf');
    expect(sniff(text('wOF2....'))?.kind).toBe('font');
    expect(sniff(text('RIFF\0\0\0\0WEBPVP8 '))?.mime).toBe('image/webp');
  });
  it('refuses executables, archives and HTML even with an image name', () => {
    expect(sniff(text('MZ\x90\0'), 'image/png')).toBeNull();
    expect(sniff(bytes(0x7f, 0x45, 0x4c, 0x46))).toBeNull();
    expect(sniff(text('PK\x03\x04zip'))).toBeNull();
    expect(sniff(text('<html><script>alert(1)</script>'), 'text/plain')).toBeNull();
  });
  it('accepts plain text and SVG', () => {
    expect(sniff(text('from,to\n/a,/b'), 'text/csv')?.mime).toBe('text/csv');
    expect(sniff(text('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'))?.kind).toBe('svg');
  });
  it('finds active content in SVG', () => {
    expect(svgProblem('<svg><script>x</script></svg>')).toMatch(/script/);
    expect(svgProblem('<svg onload="x()"></svg>')).toMatch(/event/);
    expect(svgProblem('<svg><a href="javascript:x"/></svg>')).toMatch(/script link/);
    expect(svgProblem('<svg><foreignObject/></svg>')).toBeTruthy();
    expect(svgProblem('<svg viewBox="0 0 10 10"><path d="M0 0h10"/></svg>')).toBeNull();
  });
});
