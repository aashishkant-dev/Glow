/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: 'https://ca.glow.app',
  generateRobotsTxt: false,
  changefreq: 'weekly',
  priority: 0.7,
  sitemapSize: 5000,
  exclude: [
    '/api/*', '/admin', '/admin/*',
    // Asset/meta routes Next exposes as "pages" — junk entries dilute the sitemap.
    '/icon.png', '/apple-icon.png', '/opengraph-image',
    '/sitemap.xml', '/sitemap-0.xml', '/robots.txt',
  ],
  additionalPaths: async (config) => [
    await config.transform(config, '/'),
    await config.transform(config, '/blog'),
  ],
}
