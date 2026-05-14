import { z } from 'zod';
import { Did } from './did.js';

export const COMMAND_REGEX = /^\/[a-z0-9_-]+(\/[a-z0-9_-]+)*$/;

export const Command = z
  .string()
  .regex(COMMAND_REGEX, 'invalid command — must match /^\\/[a-z0-9_-]+(\\/[a-z0-9_-]+)*$/');

export const PolicyPredicate = z.tuple([z.string(), z.string(), z.unknown()]);

/**
 * Issuer-vouched bound on what an agent may access for the lifetime of a
 * UCAN. Carried under `meta.resource_constraint`. Provider-tagged union;
 * each variant declares the structural shape the data-plane proxy enforces.
 *
 * Filesystem is the first slice. Other providers follow as additional
 * variants; chain attenuation requires `provider` equality between parent
 * and child constraints.
 */
export const FilesystemConstraint = z.object({
  provider: z.literal('filesystem'),
  path_prefix: z.string().min(1),
  host: z.string().optional(),
});

/**
 * GitHub variant. `owner` is required (we never grant org-wildcard).
 * Optional fields narrow further: omitting `repo` permits org-wide reads;
 * setting `pr_number` / `issue_number` pins to a single PR/issue;
 * `path_prefix` scopes to a directory inside a repo's tree; `ref` pins
 * to a branch / tag / sha. Chain attenuation only allows narrowing.
 */
export const GithubConstraint = z.object({
  provider: z.literal('github'),
  owner: z.string().min(1),
  repo: z.string().min(1).optional(),
  ref: z.string().min(1).optional(),
  path_prefix: z.string().min(1).optional(),
  issue_number: z.number().int().positive().optional(),
  pr_number: z.number().int().positive().optional(),
});

/**
 * Slack variant. `team_id` (T…) is the workspace; `channel_id` (C…)
 * pins to a specific channel; `user_id` (U…) pins DMs / membership ops;
 * `thread_ts` narrows replies to a single thread.
 */
export const SlackConstraint = z.object({
  provider: z.literal('slack'),
  team_id: z.string().min(1).optional(),
  channel_id: z
    .string()
    .regex(/^[CDG][A-Z0-9]+$/, 'expected slack channel id')
    .optional(),
  user_id: z
    .string()
    .regex(/^[UW][A-Z0-9]+$/, 'expected slack user id')
    .optional(),
  thread_ts: z
    .string()
    .regex(/^\d+\.\d+$/, 'expected slack ts')
    .optional(),
});

/**
 * Stripe variant. `account_id` (acct_) scopes to a Connect account;
 * `customer_id` (cus_), `payment_intent` (pi_), `charge_id` (ch_),
 * `subscription_id` (sub_), `invoice_id` (in_) each pin a specific
 * Stripe object. `path_prefix` narrows to one API namespace.
 */
export const StripeConstraint = z.object({
  provider: z.literal('stripe'),
  account_id: z
    .string()
    .regex(/^acct_[A-Za-z0-9]+$/)
    .optional(),
  customer_id: z
    .string()
    .regex(/^cus_[A-Za-z0-9]+$/)
    .optional(),
  payment_intent: z
    .string()
    .regex(/^pi_[A-Za-z0-9]+$/)
    .optional(),
  charge_id: z
    .string()
    .regex(/^ch_[A-Za-z0-9]+$/)
    .optional(),
  subscription_id: z
    .string()
    .regex(/^sub_[A-Za-z0-9]+$/)
    .optional(),
  invoice_id: z
    .string()
    .regex(/^in_[A-Za-z0-9]+$/)
    .optional(),
  path_prefix: z.string().min(1).optional(),
});

/**
 * Linear variant. Linear is GraphQL — the validator inspects
 * `body.query` (operation-name allowlist) and `body.variables`. Ids are
 * Linear UUIDs.
 */
export const LinearConstraint = z.object({
  provider: z.literal('linear'),
  workspace_id: z.string().min(1).optional(),
  team_id: z.string().min(1).optional(),
  project_id: z.string().min(1).optional(),
  issue_id: z.string().min(1).optional(),
});

/**
 * Notion variant. UUIDs are accepted with or without hyphens; the
 * validator normalizes by stripping `-` before equality.
 */
export const NotionConstraint = z.object({
  provider: z.literal('notion'),
  workspace_id: z.string().min(1).optional(),
  database_id: z.string().min(1).optional(),
  page_id: z.string().min(1).optional(),
  block_id: z.string().min(1).optional(),
});

/**
 * Google Drive variant. `file_id` pins one file; `folder_id` scopes to a
 * folder (parents check); `drive_id` scopes to a shared drive;
 * `path_prefix` is reserved for future tree-walk scopes (currently unused
 * since Drive uses ids, not paths).
 */
export const GoogleDriveConstraint = z.object({
  provider: z.literal('google_drive'),
  file_id: z.string().min(1).optional(),
  folder_id: z.string().min(1).optional(),
  drive_id: z.string().min(1).optional(),
  path_prefix: z.string().min(1).optional(),
});

export const GoogleGmailConstraint = z.object({
  provider: z.literal('google_gmail'),
  user_id: z.string().min(1).optional(),
  message_id: z.string().min(1).optional(),
  thread_id: z.string().min(1).optional(),
  label_id: z.string().min(1).optional(),
});

export const GoogleCalendarConstraint = z.object({
  provider: z.literal('google_calendar'),
  calendar_id: z.string().min(1).optional(),
  event_id: z.string().min(1).optional(),
});

export const GoogleDocsConstraint = z.object({
  provider: z.literal('google_docs'),
  document_id: z.string().min(1).optional(),
});

export const GoogleSheetsConstraint = z.object({
  provider: z.literal('google_sheets'),
  spreadsheet_id: z.string().min(1).optional(),
  sheet_id: z.string().min(1).optional(),
  range: z.string().min(1).optional(),
});

export const GoogleTasksConstraint = z.object({
  provider: z.literal('google_tasks'),
  tasklist_id: z.string().min(1).optional(),
  task_id: z.string().min(1).optional(),
});

export const GoogleContactsConstraint = z.object({
  provider: z.literal('google_contacts'),
  resource_name: z.string().min(1).optional(),
});

export const ResourceConstraint = z.discriminatedUnion('provider', [
  FilesystemConstraint,
  GithubConstraint,
  SlackConstraint,
  StripeConstraint,
  LinearConstraint,
  NotionConstraint,
  GoogleDriveConstraint,
  GoogleGmailConstraint,
  GoogleCalendarConstraint,
  GoogleDocsConstraint,
  GoogleSheetsConstraint,
  GoogleTasksConstraint,
  GoogleContactsConstraint,
]);

export type FilesystemConstraint = z.infer<typeof FilesystemConstraint>;
export type GithubConstraint = z.infer<typeof GithubConstraint>;
export type SlackConstraint = z.infer<typeof SlackConstraint>;
export type StripeConstraint = z.infer<typeof StripeConstraint>;
export type LinearConstraint = z.infer<typeof LinearConstraint>;
export type NotionConstraint = z.infer<typeof NotionConstraint>;
export type GoogleDriveConstraint = z.infer<typeof GoogleDriveConstraint>;
export type GoogleGmailConstraint = z.infer<typeof GoogleGmailConstraint>;
export type GoogleCalendarConstraint = z.infer<typeof GoogleCalendarConstraint>;
export type GoogleDocsConstraint = z.infer<typeof GoogleDocsConstraint>;
export type GoogleSheetsConstraint = z.infer<typeof GoogleSheetsConstraint>;
export type GoogleTasksConstraint = z.infer<typeof GoogleTasksConstraint>;
export type GoogleContactsConstraint = z.infer<typeof GoogleContactsConstraint>;
export type ResourceConstraint = z.infer<typeof ResourceConstraint>;

export const UcanPayload = z
  .object({
    iss: Did,
    aud: Did,
    cmd: Command,
    sub: z.string().optional(),
    pol: z.array(PolicyPredicate),
    nonce: z.string().min(1),
    meta: z.record(z.string(), z.unknown()).optional(),
    nbf: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
    prf: z.array(z.string()).optional(),
  })
  .refine((d) => d.exp > d.nbf, {
    message: 'exp must be greater than nbf',
    path: ['exp'],
  });

export const UcanIssue = z.object({
  cid: z.string().min(1),
  jwt: z.string().min(1),
  payload: UcanPayload,
});

export type Command = z.infer<typeof Command>;
export type PolicyPredicate = z.infer<typeof PolicyPredicate>;
export type UcanPayload = z.infer<typeof UcanPayload>;
export type UcanIssue = z.infer<typeof UcanIssue>;
