import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface ChatgptOptions {
  controlPlaneUrl: string;
  pdpUrl: string;
  apiKey?: string;
  outDir: string;
}

/**
 * ChatGPT Custom GPTs talk via "Actions" — an OpenAPI 3 manifest pointing at
 * an HTTPS endpoint. The dashboard at {controlPlaneUrl}/v1/intent (the
 * dynamic-scope endpoint) is the entry point. We emit a minimal OpenAPI
 * spec the user uploads in the GPT Editor under Actions.
 */
export function renderChatgptManifest(opts: ChatgptOptions): string {
  return JSON.stringify(
    {
      openapi: '3.1.0',
      info: {
        title: 'Credential Broker',
        version: '0.0.0',
        description:
          'Authorize SaaS tool calls without raw API keys. Use the proxy endpoint to invoke any registered integration.',
      },
      servers: [{ url: opts.pdpUrl }],
      paths: {
        '/v1/proxy/{integration}/{action}': {
          post: {
            operationId: 'proxyCall',
            summary: 'Invoke an integration action via the broker.',
            parameters: [
              {
                name: 'integration',
                in: 'path',
                required: true,
                schema: { type: 'string' },
                description: 'Integration id (e.g. github, slack, google_gmail).',
              },
              {
                name: 'action',
                in: 'path',
                required: true,
                schema: { type: 'string' },
                description: 'Action id within the integration (e.g. list_issues).',
              },
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { type: 'object', additionalProperties: true },
                },
              },
            },
            responses: {
              '200': { description: 'Allowed; result body returned.' },
              '403': { description: 'Denied or step-up required.' },
            },
          },
        },
      },
      components: {
        securitySchemes: {
          ApiKey: { type: 'apiKey', in: 'header', name: 'Authorization' },
        },
      },
      security: [{ ApiKey: [] }],
    },
    null,
    2,
  );
}

export function writeChatgptManifest(opts: ChatgptOptions): { path: string } {
  mkdirSync(opts.outDir, { recursive: true });
  const path = resolve(opts.outDir, 'credential-broker.openapi.json');
  writeFileSync(path, renderChatgptManifest(opts));
  return { path };
}

export { dirname };
