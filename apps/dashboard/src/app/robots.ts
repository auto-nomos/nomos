import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://auto-nomos.com';

const AI_AND_SEARCH_BOTS = [
  // Anthropic
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'Claude-User',
  'Claude-SearchBot',
  // OpenAI
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  // Google / Gemini
  'Googlebot',
  'Googlebot-Image',
  'Googlebot-News',
  'Googlebot-Video',
  'Google-Extended',
  'GoogleOther',
  'APIs-Google',
  'AdsBot-Google',
  // Microsoft / Bing / Copilot
  'Bingbot',
  'msnbot',
  'BingPreview',
  // Perplexity
  'PerplexityBot',
  'Perplexity-User',
  // Meta
  'FacebookBot',
  'Meta-ExternalAgent',
  'Meta-ExternalFetcher',
  'facebookexternalhit',
  // Apple
  'Applebot',
  'Applebot-Extended',
  // Amazon
  'Amazonbot',
  // Yandex
  'YandexBot',
  // DuckDuckGo
  'DuckDuckBot',
  // Yahoo
  'Slurp',
  // ByteDance / TikTok
  'Bytespider',
  // You.com
  'YouBot',
  // Cohere
  'cohere-ai',
  'cohere-training-data-crawler',
  // Mistral
  'MistralAI-User',
  // xAI / Grok
  'xAI-Bot',
  // Diffbot, Common Crawl, etc.
  'Diffbot',
  'CCBot',
  'Omgilibot',
  'Timpibot',
  'Webzio-Extended',
  'ImagesiftBot',
  'PetalBot',
  'Kagibot',
  'Neevabot',
  'phindbot',
  'SemrushBot',
  'AhrefsBot',
  // Twitter / X
  'Twitterbot',
  // LinkedIn
  'LinkedInBot',
  // Slack / Discord / Telegram unfurlers
  'Slackbot',
  'Discordbot',
  'TelegramBot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...AI_AND_SEARCH_BOTS.map((agent) => ({
        userAgent: agent,
        allow: '/',
      })),
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/app/', '/api/', '/sign-in', '/sign-up', '/recover', '/approve'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
