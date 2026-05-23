/**
 * Single source of truth for community + open-source URLs.
 * Placeholders today — swap to real URLs in one diff.
 * Every marketing surface (hero, footer, /community, /open-source) reads
 * from here, so a single string change propagates everywhere.
 */

export const GITHUB_ORG_URL = 'https://github.com/varendra007';
export const GITHUB_REPO_URL = 'https://github.com/varendra007/nomos';
export const GITHUB_STAR_URL = `${GITHUB_REPO_URL}/stargazers`;
export const GITHUB_DISCUSSIONS_URL = `${GITHUB_REPO_URL}/discussions`;
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;
export const GITHUB_CONTRIBUTING_URL = `${GITHUB_REPO_URL}/blob/main/CONTRIBUTING.md`;

export const DISCORD_INVITE_URL = 'https://discord.gg/cKkWQV7B';

export const NPM_ORG_URL = 'https://www.npmjs.com/org/auto-nomos';
export const TWITTER_URL = 'https://twitter.com/autonomos';

export const COMMUNITY_LINKS = {
  github: GITHUB_REPO_URL,
  githubStar: GITHUB_STAR_URL,
  githubDiscussions: GITHUB_DISCUSSIONS_URL,
  githubReleases: GITHUB_RELEASES_URL,
  githubContributing: GITHUB_CONTRIBUTING_URL,
  discord: DISCORD_INVITE_URL,
  npm: NPM_ORG_URL,
  twitter: TWITTER_URL,
} as const;
