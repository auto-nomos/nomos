# Permissions and scopes

Azure RBAC and Nomos UCAN constraints are two independent control planes
that compose. Azure RBAC says **what the App Registration can do at the
Azure level**. Nomos UCAN constraints say **what the agent can ask the
broker to do**. The effective permission is the intersection.

## TL;DR

| Question | Answer |
|---|---|
| Can an agent do something the App Reg can't? | **No.** ARM rejects with 403. |
| Can an agent do something Cedar policy doesn't allow? | **No.** PDP denies. |
| Can an agent delete a resource the policy allows? | **Not without cosigner.** Risk gate fires. |
| Can the App Reg do something no agent has scope for? | Yes — but nothing happens because no UCAN gets minted. |

## Azure RBAC strategy

Pick the **narrowest role + scope** that still lets agents do their job.
The cosigner gate is defense in depth; it does not replace least-privilege.

### Recommended tier table

| Use case | Role | Scope | Cloud connection display name |
|---|---|---|---|
| Read-only observability, cost ops | `Reader` | Subscription | `prod-readonly` |
| Tag management + run-command on VMs | `Reader` + custom (tags + run-command on VMs) | Subscription | `prod-tags-runcmd` |
| Dev/test infrastructure | `Contributor` | Sandbox RG only | `dev-sandbox` |
| Production deploys | Custom role (no delete-RG, no delete-storage) | Subscription | `prod-deploy` |
| Key Vault rotation | `Key Vault Secrets Officer` | Specific Key Vault | `prod-kv-rotation` |
| Storage data plane | `Storage Blob Data Contributor` | Specific storage account | `prod-blob-rw` |
| Cluster ops on AKS | `Azure Kubernetes Service Cluster User Role` | Specific cluster | `prod-aks-ops` |
| Break-glass | `Owner` + dashboard step-up policy | Subscription, audit-flagged | `prod-break-glass` |

### Multiple cloud connections per subscription

One subscription can have several Nomos cloud connections — one per App
Registration with a different role/scope. Agents bind to one connection
at mint time via `cloudConnectionId`. This lets you ship one agent with
Reader and another with Contributor without sharing principals.

### Built-in Azure roles cheat sheet

| Role | Grants | Typical agent class |
|---|---|---|
| `Reader` | GET on everything in scope | Observability, FinOps, security review |
| `Contributor` | All except role assignment | Dev/test, infra automation |
| `Owner` | Everything | Break-glass only |
| `User Access Administrator` | Manage role assignments | RBAC-administration agents |
| `Reader and Data Access` | Reader + storage list-keys | Storage forensics |
| `Storage Blob Data Reader` | Read blobs (data plane) | Content indexer |
| `Storage Blob Data Contributor` | RW blobs (data plane) | Pipeline writer |
| `Key Vault Secrets User` | Get secrets (data plane) | Config loader |
| `Key Vault Secrets Officer` | RW secrets | Secret rotation |
| `Key Vault Crypto Officer` | RW keys | KMS automation |
| `Network Contributor` | All network mgmt | Network ops |
| `Cost Management Reader` | Read budgets, exports, forecasts | FinOps |
| `Monitoring Reader` | Read alerts, metrics, logs | SRE |
| `Monitoring Contributor` | Write alerts | Alert authoring |
| `Azure Kubernetes Service Cluster Admin Role` | Cluster admin | AKS lifecycle |
| `Log Analytics Reader` | Run KQL | Log analysis |

### Custom roles

Use custom roles when a built-in doesn't carve cleanly. Example: an agent
that should be able to **tag** anything and **run-command** on specific VMs
only, with no other write capability.

```json
{
  "Name": "Nomos Tag and RunCmd",
  "Description": "Nomos agent — tags + run-command",
  "Actions": [
    "Microsoft.Resources/tags/write",
    "Microsoft.Compute/virtualMachines/runCommand/action"
  ],
  "DataActions": [],
  "NotActions": [],
  "AssignableScopes": ["/subscriptions/<sub-id>"]
}
```

Assign via Terraform:

```hcl
resource "azurerm_role_definition" "tag_runcmd" {
  name        = "Nomos Tag and RunCmd"
  scope       = "/subscriptions/<sub-id>"
  permissions {
    actions = [
      "Microsoft.Resources/tags/write",
      "Microsoft.Compute/virtualMachines/runCommand/action",
    ]
  }
  assignable_scopes = ["/subscriptions/<sub-id>"]
}
```

## UCAN `AzureConstraint` reference

When a UCAN is minted with a constraint, the PDP enforces the constraint
on every call regardless of Cedar policy.

```ts
{
  provider: 'azure',
  tenant_id?:        string,    // pin to one Entra tenant
  subscription_id?:  string,    // pin to one subscription
  resource_group?:   string,    // pin to one RG
  resource_type?:    string,    // pin to one ARM namespace (e.g. "Microsoft.Compute/virtualMachines")
  name?:             string,    // pin to one specific resource
}
```

### Subset rule

In chain attenuation (parent UCAN → child UCAN) and in the PDP
constraint→resource check, **child must be a refinement of parent**.
Every field present in parent must be present and equal in child;
parent can omit fields the child sets.

| Parent | Child | Result |
|---|---|---|
| `{provider, subscription_id: A}` | `{provider, subscription_id: A, resource_group: R}` | ✅ cover (child narrower) |
| `{provider, subscription_id: A}` | `{provider, subscription_id: B}` | ❌ deny (different sub) |
| `{provider, subscription_id: A, resource_group: R}` | `{provider, subscription_id: A}` | ❌ deny (child wider) |
| `{provider, subscription_id: A, resource_type: T1}` | `{provider, subscription_id: A, resource_type: T2}` | ❌ deny (different type) |

Cross-provider always denies — an Azure constraint cannot delegate AWS.

### Example: filesystem operator scoped to one RG

```ts
import { NomosClient } from '@auto-nomos/sdk';

const nomos = new NomosClient({
  apiKey: process.env.NOMOS_API_KEY,
  cloudConnectionId: '<conn>',
  resourceConstraint: {
    provider: 'azure',
    subscription_id: '<sub>',
    resource_group: 'prod-app-eus',
  },
});

// This works.
await nomos.azure.vm.list({ subscription_id: '<sub>', resource_group: 'prod-app-eus' });

// This denies with resource_mismatch — different RG.
await nomos.azure.vm.list({ subscription_id: '<sub>', resource_group: 'finance' });
```

## Cedar policy strategy

Cedar is the customer-controlled allow-list. Recommended pattern:

### Pattern 1 — explicit action allow-list

```cedar
permit (
  principal,
  action in [
    Action::"/azure/vm/list",
    Action::"/azure/vm/get",
    Action::"/azure/vm/get_instance_view",
    Action::"/azure/monitor/list_alerts"
  ],
  resource
);
```

Mirror the agent's job description. New action needs require a policy
update — auditable.

### Pattern 2 — service-prefix wildcards (use sparingly)

Cedar doesn't have a native wildcard on action ids, but you can group via
an `ActionGroup`:

```cedar
@id("observability_actions")
action_group ObservabilityActions = [
  Action::"/azure/vm/list",
  Action::"/azure/vm/get",
  Action::"/azure/monitor/list_alerts",
  Action::"/azure/monitor/list_metric_definitions",
  Action::"/azure/log_analytics/kql"
];

permit (principal, action in ObservabilityActions, resource);
```

### Pattern 3 — require step-up for high-risk

```cedar
permit (
  principal,
  action == Action::"/azure/key_vaults/get_secret",
  resource
) when {
  context.cosigner == true
};
```

This forces the same UI as a destructive verb, even for reads of
sensitive data. The risk gate alone won't catch reads — you need the
policy clause.

### Pattern 4 — restrict by resource group

```cedar
permit (
  principal,
  action in DevOpsActions,
  resource
) when {
  resource.resource_group == "dev-sandbox" ||
  resource.resource_group == "qa-sandbox"
};
```

The PDP populates `resource.resource_group` from the request's
`resource` claim.

## Effective permission matrix

The intersection of all gates:

```
Effective(agent, command, resource) =
    Azure_RBAC(App_Reg, ARM_action_for_command, resource_arm_id)
  ∩ Cedar_policy(agent, command, resource)
  ∩ UCAN_constraint(meta.resource_constraint, resource)
  ∩ Risk_rules(command, context.cosigner)
```

If any gate denies, the call denies.

## Cookbook — common scoping mistakes

### Mistake 1 — Reader at subscription but agent expects Contributor

Symptom: `arm.status=403 AuthorizationFailed` in audit row.
Fix: Either widen Azure RBAC or narrow the agent to read-only actions.

### Mistake 2 — Two agents share an App Reg, both with FICs, but Azure RBAC is RG-scoped to different RGs

Symptom: Agent A's calls land in Agent B's RG and fail 403 RBAC even
though their FICs are correct.
Fix: One App Registration per RBAC scope. Two cloud connections in
Nomos, each pinned to its own App Reg.

### Mistake 3 — Wildcard subject in FIC

Symptom: `AADSTS70021 No matching federated identity record found`.
Fix: Azure does not support claimsMatchingExpression for custom OIDC
issuers. You must register one FIC per agent. Use Terraform's
`additional_agent_ids` list and rerun apply.

### Mistake 4 — `permit (principal, action, resource);` shipped to prod

Symptom: agents can do anything Cedar would allow.
Mitigation: Risk gate still blocks all destructive verbs, but everything
else is wide open. **Use the visual policy builder** at `/app/policies`
to author tight policies; never paste open-wildcard policies into a
prod customer.

### Mistake 5 — `resource_constraint` set on UCAN but not on `request.resource`

Symptom: every call denies with `resource_mismatch`.
Fix: The SDK populates `request.resource` from your `apiCall.path`.
If you're using raw curl, you must pass `request.resource` with the same
shape the UCAN was constrained to.

## Audit trail

Every authorization decision shows the resolved permission set. In the
dashboard `/app/audit/<receipt-id>`:

```
Command         /azure/vm/delete
Agent           prod-ops-vm-001 (54a94a01-…)
Cloud conn      prod-deploy (Contributor on /subscriptions/b0afe1…)
Cedar policy    prod-ops-policy v17 (id: e2e-az…)
Cedar decision  allow
Risk rule       cosigner_required (destructive verb: delete)
Constraint      {provider: azure, subscription_id: b0afe1…, resource_group: prod-app-eus}
Outcome         403 cosigner_required → /approve/8856011e-…
```

This row alone is enough to answer "why did this fail?" and "could it
have succeeded with different inputs?" without grepping logs.
