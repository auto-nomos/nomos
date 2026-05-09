import type { AuthGuard } from '@credential-broker/sdk';
import type { ZodRawShape } from 'zod';
import type { ToolResultJson } from '../run-guarded.js';

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: ZodRawShape;
  handler: (guard: AuthGuard, input: unknown) => Promise<ToolResultJson>;
}
