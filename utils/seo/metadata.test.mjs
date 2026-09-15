import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createMetadata, seoMetadataPlugin } from './metadata.mjs';

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
  assert.equal(menu.hasMenuSection.flatMap((section) => section.hasMenuItem).length, 25);
});

test('every menu item uses its ID-named image and burger add-ons stay in its description', () => {
  for (const section of metadata.menu.sections) {
    const groups = section.subsections ?? [section];
    for (const group of groups) {
      const items = group.items ?? [];
      for (const item of items) {
        assert.equal(item.image, `/images/menu/${item.id}.webp`);
      }
    }
  }

  const lunch = metadata.menu.sections.find((section) => section.id === 'lunch');
  const hamburger = lunch.subsections[0].items.find((item) => item.name === 'Hamburger');
  assert.match(hamburger.description, /Add cheese \$1\.50\. Add bacon \$1\.50/);
  assert.equal(lunch.subsections[0].items.some((item) => item.name.startsWith('Add ')), false);
});

test('crawler assets use canonical URLs and current content', () => {
  assert.match(metadata.assets['robots.txt'], /Sitemap: https:\/\/joe-zyc\.github\.io\/parkdale-breakfast-bar\/sitemap\.xml/);
  assert.match(metadata.assets['sitemap.xml'], /<lastmod>2026-06-20<\/lastmod>/);
  assert.match(metadata.assets['llms.txt'], /\+1 437-855-5571/);
  assert.match(metadata.assets['llms.txt'], /House Breakfast Special/);
  assert.match(metadata.assets['llms.txt'], /Moosehead/);
  assert.deepEqual(JSON.parse(metadata.assets['menu.json']), metadata.menu);
});

test('development middleware does not intercept source JSON imports', () => {
  let middleware;
  const plugin = seoMetadataPlugin({ rootDirectory });
  plugin.configureServer({
    config: { base: '/parkdale-breakfast-bar/' },
    middlewares: { use(callback) { middleware = callback; } },
  });

  let calledNext = false;
  middleware(
    { url: '/parkdale-breakfast-bar/src/data/menu.json?import' },
    {},
    () => { calledNext = true; },
  );

  assert.equal(calledNext, true);
});
