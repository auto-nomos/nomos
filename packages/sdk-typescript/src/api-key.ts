const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ParsedApiKey {
  customerId: string;
  secret: string;
}

export function parseApiKey(apiKey: string): ParsedApiKey {
  if (!apiKey?.startsWith('cb_')) {
    throw new Error('invalid api key: expected format cb_<customerId>_<secret>');
  }
  const rest = apiKey.slice(3);
  const sep = rest.indexOf('_');
  if (sep <= 0) {
    throw new Error('invalid api key: missing customer segment');
  }
  const customerId = rest.slice(0, sep);
  const secret = rest.slice(sep + 1);
  if (!UUID_RE.test(customerId)) {
    throw new Error('invalid api key: customerId must be a uuid');
  }
  if (secret.length === 0) {
    throw new Error('invalid api key: secret missing');
  }
  return { customerId, secret };
}
