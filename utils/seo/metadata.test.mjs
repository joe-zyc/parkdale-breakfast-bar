import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createMetadata } from './metadata.mjs';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const metadata = createMetadata(rootDirectory, new Date('2026-06-20T12:00:00Z'));

test('head metadata uses current business data', () => {
  assert.match(metadata.headHtml, /Parkdale Breakfast Bar &amp; Grill \| Toronto Restaurant &amp; Bar/);
  assert.match(metadata.headHtml, /rel="canonical"/);
  assert.match(metadata.headHtml, /application\/ld\+json/);
  assert.doesNotMatch(metadata.headHtml, /416-901-1858/);
});

test('structured data contains restaurant and menu items', () => {
  const script = metadata.headHtml.match(/<script type="application\/ld\+json">(.+)<\/script>/s);
  assert.ok(script);
  const data = JSON.parse(script[1]);
  const restaurant = data['@graph'].find((item) => item['@type'] === 'Restaurant');
  const menu = data['@graph'].find((item) => item['@type'] === 'Menu');
  assert.equal(restaurant.telephone, '+1 437-855-5571');
  assert.ok(menu.hasMenuSection.length >= 4);
  assert.ok(menu.hasMenuSection.flatMap((section) => section.hasMenuItem).length >= 30);
});

test('crawler assets use canonical URLs and current content', () => {
  assert.match(metadata.assets['robots.txt'], /Sitemap: https:\/\/joe-zyc\.github\.io\/parkdale-breakfast-bar\/sitemap\.xml/);
  assert.match(metadata.assets['sitemap.xml'], /<lastmod>2026-06-20<\/lastmod>/);
  assert.match(metadata.assets['llms.txt'], /\+1 437-855-5571/);
  assert.match(metadata.assets['llms.txt'], /Fish Curry with Rice/);
  assert.deepEqual(JSON.parse(metadata.assets['menu.json']), metadata.menu);
});
