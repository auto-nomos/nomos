import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface CustomOptions {
  controlPlaneUrl: string;
  pdpUrl: string;
  apiKey?: string;
  outDir: string;
}

const README = `# credential-broker — custom agent client

Drop-in config for any MCP-compatible client.

## Files

- .cb-mcp.json — bundle of URLs + (optional) API key
- README.md   — this file

## Wire-up

\`\`\`json
{
  "mcpServers": {
    "credential-broker": {
      "command": "npx",
      "args": ["-y", "@auto-nomos/mcp-server", "--config", "./.cb-mcp.json"]
    }
  }
}
\`\`\`

Or via env vars:

    CB_API_KEY=cb_<customer>_<secret>
    CB_PDP_URL=<pdp-url>
    CB_CONTROL_PLANE_URL=<control-plane-url>
`;

export function writeCustomBundle(opts: CustomOptions): { dir: string } {
  mkdirSync(opts.outDir, { recursive: true });
  writeFileSync(
    resolve(opts.outDir, '.cb-mcp.json'),
    JSON.stringify(
      {
        controlPlaneUrl: opts.controlPlaneUrl,
        pdpUrl: opts.pdpUrl,
        apiKey: opts.apiKey ?? null,
      },
      null,
      2,
    ) + '\n',
  );
  writeFileSync(resolve(opts.outDir, 'README.md'), README);
  return { dir: opts.outDir };
}
