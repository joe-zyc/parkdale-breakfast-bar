import fs from 'node:fs';
import path from 'node:path';

const CRAWLER_ASSETS = new Set(['robots.txt', 'sitemap.xml', 'llms.txt', 'menu.json']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeXml(value) {
  return escapeAttribute(value).replaceAll("'", '&apos;');
}

function schemaId(value) {
  return `https://schema.org/${value}`;
}

function flattenMenuSections(menu) {
  return menu.sections.flatMap((section) => {
    if (section.subsections?.length) {
      return section.subsections.map((subsection) => ({
        id: `${section.id}-${subsection.id}`,
        name: `${section.title}: ${subsection.title}`,
        items: subsection.items ?? [],
      }));
    }

    return [{ id: section.id, name: section.title, items: section.items ?? [] }];
  });
}

function priceValue(price) {
  const value = Number.parseFloat(String(price).replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) ? value.toFixed(2) : undefined;
}

function buildMenuSchema(menu, canonicalUrl) {
  return {
    '@type': 'Menu',
    '@id': `${canonicalUrl}#menu-data`,
    name: 'Parkdale Breakfast Bar & Grill Menu',
    url: `${canonicalUrl}#menu`,
    hasMenuSection: flattenMenuSections(menu).map((section) => ({
      '@type': 'MenuSection',
      '@id': `${canonicalUrl}#menu-${section.id}`,
      name: section.name,
      hasMenuItem: section.items.map((item) => {
        const menuItem = {
          '@type': 'MenuItem',
          name: item.name,
          offers: {
            '@type': 'Offer',
            price: priceValue(item.price),
            priceCurrency: 'CAD',
          },
        };

        if (item.description) {
          menuItem.description = item.description;
        }
        if (item.image) {
          menuItem.image = new URL(item.image.replace(/^\/+/, ''), canonicalUrl).href;
        }
        return menuItem;
      }),
    })),
  };
}

function buildStructuredData(site, menu) {
  const canonicalUrl = site.canonicalUrl;
  const socialImage = new URL(site.socialImage.replace(/^\/+/, ''), canonicalUrl).href;
  const allPrices = flattenMenuSections(menu)
    .flatMap((section) => section.items)
    .map((item) => priceValue(item.price))
    .filter(Boolean)
    .map(Number);
  const priceRange = allPrices.length
    ? `$${Math.min(...allPrices).toFixed(2)}-$${Math.max(...allPrices).toFixed(2)} CAD`
    : undefined;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${canonicalUrl}#website`,
        url: canonicalUrl,
        name: site.name,
        inLanguage: site.language,
      },
      {
        '@type': 'WebPage',
        '@id': `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: `${site.name} | Toronto Restaurant & Bar`,
        description: site.metaDescription,
        inLanguage: site.language,
        isPartOf: { '@id': `${canonicalUrl}#website` },
        about: { '@id': `${canonicalUrl}#restaurant` },
        primaryImageOfPage: socialImage,
      },
      {
        '@type': 'Restaurant',
        '@id': `${canonicalUrl}#restaurant`,
        name: site.name,
        description: site.description,
        url: canonicalUrl,
        image: socialImage,
        telephone: site.phone,
        priceRange,
        servesCuisine: site.servesCuisine,
        address: {
          '@type': 'PostalAddress',
          ...site.addressDetails,
        },
        hasMap: site.mapUrl,
        menu: `${canonicalUrl}#menu`,
        hasMenu: { '@id': `${canonicalUrl}#menu-data` },
        openingHoursSpecification: site.hours.map((hours) => ({
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: hours.dayOfWeek.map(schemaId),
          opens: hours.opens,
          closes: hours.closes,
        })),
        potentialAction: {
          '@type': 'OrderAction',
          target: site.uberEatsUrl,
        },
      },
      buildMenuSchema(menu, canonicalUrl),
    ],
  };
}

function buildHeadHtml(site, structuredData) {
  const canonicalUrl = site.canonicalUrl;
  const title = `${site.name} | Toronto Restaurant & Bar`;
  const image = new URL(site.socialImage.replace(/^\/+/, ''), canonicalUrl).href;
  const llmsUrl = new URL('llms.txt', canonicalUrl).href;
  const menuJsonUrl = new URL('menu.json', canonicalUrl).href;
  const jsonLd = JSON.stringify(structuredData).replaceAll('<', '\\u003c');

  return `
    <title>${escapeAttribute(title)}</title>
    <meta name="description" content="${escapeAttribute(site.metaDescription)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <meta name="theme-color" content="#40322b" />
    <link rel="canonical" href="${escapeAttribute(canonicalUrl)}" />
    <link rel="alternate" type="text/plain" href="${escapeAttribute(llmsUrl)}" title="LLM-readable site summary" />
    <link rel="alternate" type="application/json" href="${escapeAttribute(menuJsonUrl)}" title="Machine-readable restaurant menu" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="${escapeAttribute(site.locale)}" />
    <meta property="og:site_name" content="${escapeAttribute(site.name)}" />
    <meta property="og:title" content="${escapeAttribute(title)}" />
    <meta property="og:description" content="${escapeAttribute(site.metaDescription)}" />
    <meta property="og:url" content="${escapeAttribute(canonicalUrl)}" />
    <meta property="og:image" content="${escapeAttribute(image)}" />
    <meta property="og:image:width" content="800" />
    <meta property="og:image:height" content="450" />
    <meta property="og:image:alt" content="Parkdale Breakfast House Special Breakfast" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttribute(title)}" />
    <meta name="twitter:description" content="${escapeAttribute(site.metaDescription)}" />
    <meta name="twitter:image" content="${escapeAttribute(image)}" />
    <meta name="twitter:image:alt" content="Parkdale Breakfast House Special Breakfast" />
    <script type="application/ld+json">${jsonLd}</script>`;
}

function buildLlmsText(site, menu) {
  const lines = [
    `# ${site.name}`,
    '',
    `> ${site.description}`,
    '',
    '## Official Resources',
    '',
    `- [Official website](${site.canonicalUrl})`,
    `- [Interactive menu](${site.canonicalUrl}#menu)`,
    `- [Machine-readable menu](${new URL('menu.json', site.canonicalUrl).href})`,
    `- [Map](${site.mapUrl})`,
    `- [Order on Uber Eats](${site.uberEatsUrl})`,
    '',
    '## Business Information',
    '',
    `- Address: ${site.address}`,
    `- Phone: ${site.phone}`,
    ...site.hours.map((hours) => `- Hours: ${hours.days}, ${hours.time}`),
    '',
    '## Menu',
    '',
  ];

  for (const section of flattenMenuSections(menu)) {
    lines.push(`### ${section.name}`, '');
    for (const item of section.items) {
      const description = item.description ? ` — ${item.description}` : '';
      lines.push(`- ${item.name}: ${item.price}${description}`);
    }
    lines.push('');
  }

  lines.push('Menu items, prices, and hours can change. The official website is the current source of truth.', '');
  return lines.join('\n');
}

export function createMetadata(rootDirectory, currentDate = new Date()) {
  const site = readJson(path.join(rootDirectory, 'src/data/site.json'));
  const menu = readJson(path.join(rootDirectory, 'src/data/menu.json'));
  const structuredData = buildStructuredData(site, menu);
  const sitemapUrl = new URL('sitemap.xml', site.canonicalUrl).href;
  const lastModified = currentDate.toISOString().slice(0, 10);

  return {
    site,
    menu,
    headHtml: buildHeadHtml(site, structuredData),
    assets: {
      'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`,
      'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${escapeXml(site.canonicalUrl)}</loc>\n    <lastmod>${lastModified}</lastmod>\n  </url>\n</urlset>\n`,
      'llms.txt': buildLlmsText(site, menu),
      'menu.json': `${JSON.stringify(menu, null, 2)}\n`,
    },
  };
}

export function seoMetadataPlugin({ rootDirectory = process.cwd() } = {}) {
  const sitePath = path.join(rootDirectory, 'src/data/site.json');
  const menuPath = path.join(rootDirectory, 'src/data/menu.json');

  return {
    name: 'parkdale-seo-metadata',
    buildStart() {
      this.addWatchFile(sitePath);
      this.addWatchFile(menuPath);
    },
    transformIndexHtml(html) {
      const { headHtml } = createMetadata(rootDirectory);
      const withoutTitle = html.replace(/\s*<title>[\s\S]*?<\/title>/i, '');
      return withoutTitle.replace('</head>', `${headHtml}\n  </head>`);
    },
    generateBundle() {
      const { assets } = createMetadata(rootDirectory);
      for (const [fileName, source] of Object.entries(assets)) {
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        const fileName = pathname.split('/').at(-1);
        if (!CRAWLER_ASSETS.has(fileName)) {
          next();
          return;
        }

        const { assets } = createMetadata(rootDirectory);
        response.statusCode = 200;
        response.setHeader(
          'Content-Type',
          fileName === 'sitemap.xml'
            ? 'application/xml; charset=utf-8'
            : fileName === 'menu.json'
              ? 'application/json; charset=utf-8'
              : 'text/plain; charset=utf-8',
        );
        response.end(assets[fileName]);
      });
    },
  };
}
