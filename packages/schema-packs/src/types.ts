/**
 * Schema pack public surface.
 *
 * Sprint 7 ships the `templates` half so the dashboard's policy-creation
 * wizard can offer 20 starter policies. Sprint 10 fills in `resources`,
 * `actions`, `defaultPolicies`, and `connector` so the PDP can validate
 * authorize requests against per-integration vocab.
 */
export type IntegrationId = 'github' | 'slack' | 'google' | 'notion';

export interface PolicyTemplate {
  /** Stable id, namespaced on integration: `github:read-only`. */
  id: string;
  integrationId: IntegrationId;
  /** User-visible name. */
  name: string;
  /** One-sentence description shown next to the name in the picker. */
  description: string;
  /** Valid Cedar text — must parse via @credential-broker/cedar.parsePolicy. */
  cedarText: string;
  /**
   * `true` when the visual builder can render the template losslessly.
   * `false` means the template uses shapes outside the IR — the visual
   * tab will show an "edit in Cedar" banner.
   */
  visualReady: boolean;
}

export interface IntegrationPack {
  id: IntegrationId;
  name: string;
  templates: PolicyTemplate[];
}
