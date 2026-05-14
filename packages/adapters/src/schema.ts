import { z } from 'zod';

export const RiskCategorySchema = z.enum(['read', 'search', 'write', 'delete']);
export type RiskCategory = z.infer<typeof RiskCategorySchema>;

export const RiskSensitivitySchema = z.enum(['low', 'medium', 'high']);
export type RiskSensitivity = z.infer<typeof RiskSensitivitySchema>;

export const AuthSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('oauth2'),
    authorize_url: z.string().url(),
    token_url: z.string().url(),
    refresh_url: z.string().url().optional(),
    default_scopes: z.array(z.string()).default([]),
    pkce: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal('api_key'),
    header_name: z.string().default('Authorization'),
    header_prefix: z.string().default('Bearer '),
    setup_url: z.string().url().optional(),
  }),
  z.object({
    kind: z.literal('basic'),
    setup_url: z.string().url().optional(),
  }),
  z.object({
    kind: z.literal('bot_token'),
    header_name: z.string().default('Authorization'),
    header_prefix: z.string().default('Bot '),
    setup_url: z.string().url().optional(),
  }),
  z.object({
    kind: z.literal('dsn'),
    fields: z.array(z.string()).default(['host', 'port', 'database', 'user', 'password']),
  }),
  z.object({
    kind: z.literal('local'),
  }),
  z.object({
    kind: z.literal('ssh_key'),
    key_env_var: z.string().default('SSH_PRIVATE_KEY'),
    passphrase_env_var: z.string().optional(),
    known_hosts_env_var: z.string().optional(),
  }),
]);
export type AuthConfig = z.infer<typeof AuthSchema>;

export const ParamSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/),
  in: z.enum(['path', 'query', 'header', 'body', 'form']),
  required: z.boolean().default(false),
  type: z.enum(['string', 'integer', 'number', 'boolean', 'array', 'object']).default('string'),
  default: z.unknown().optional(),
  default_expr: z.string().optional(),
  enum: z.array(z.string()).optional(),
  description: z.string().optional(),
  transform: z.string().optional(),
  sensitive: z.boolean().default(false),
});
export type Param = z.infer<typeof ParamSchema>;

export const SanitizeRuleSchema = z.object({
  field: z.string(),
  redact: z.boolean().default(false),
  truncate: z.number().int().positive().optional(),
  hash: z.boolean().default(false),
});
export type SanitizeRule = z.infer<typeof SanitizeRuleSchema>;

export const ResponseSchema = z.object({
  type: z.enum(['object', 'array', 'string', 'binary']).default('object'),
  sanitize: z.array(SanitizeRuleSchema).default([]),
});
export type ResponseConfig = z.infer<typeof ResponseSchema>;

export const ActionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  description: z.string(),
  risk: z.object({
    category: RiskCategorySchema,
    sensitivity: RiskSensitivitySchema,
  }),
  expected_use: z.string(),
  auto_execute: z.boolean().default(true),
  required_scopes: z.array(z.string()).default([]),
  http: z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    path: z.string().min(1),
    base_url_override: z.string().url().optional(),
  }),
  params: z.array(ParamSchema).default([]),
  response: ResponseSchema.default({ type: 'object', sanitize: [] }),
  rate_limit: z
    .object({
      per_minute: z.number().int().positive(),
    })
    .optional(),
});
export type Action = z.infer<typeof ActionSchema>;

export const AdapterSpecSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string(),
  version: z.string().default('1.0.0'),
  description: z.string().optional(),
  homepage: z.string().url().optional(),
  api_base: z.string().url().optional(),
  auth: AuthSchema,
  actions: z.array(ActionSchema).min(1),
  notes: z.string().optional(),
});
export type AdapterSpec = z.infer<typeof AdapterSpecSchema>;
