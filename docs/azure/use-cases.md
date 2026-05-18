# Use cases

Concrete scenarios that map cleanly to Nomos + Azure. Each one lists the
agent identity, the cloud connection profile, the Cedar policy shape, and
the commands used.

---

## 1. Cost analysis bot (FinOps)

**Goal:** an agent that wakes daily, computes month-to-date spend, flags
anomalies, and posts a Slack digest.

**Cloud connection profile**

| | |
|---|---|
| Azure role | `Cost Management Reader` + `Monitoring Reader` |
| Scope | Subscription |
| Display name | `prod-finops-readonly` |

**Cedar policy** (`/app/policies` → new)

```cedar
@id("finops_bot")
permit (
  principal == Agent::"finops-bot",
  action in [
    Action::"/azure/cost_management/list_budgets",
    Action::"/azure/cost_management/forecast",
    Action::"/azure/cost_management/query",
    Action::"/azure/monitor/list_alerts",
    Action::"/azure/monitor/list_metric_definitions"
  ],
  resource
);
```

**SDK example**

```ts
import { NomosClient } from '@auto-nomos/sdk';

const nomos = new NomosClient({
  apiKey: process.env.NOMOS_API_KEY,
  cloudConnectionId: 'prod-finops-readonly',
});

const forecast = await nomos.azure.cost_management.forecast({
  subscription_id: SUB,
  timeframe: 'MonthToDate',
  type: 'ActualCost',
});

const monthOverMonth = await nomos.azure.cost_management.query({
  subscription_id: SUB,
  body: {
    type: 'ActualCost',
    timeframe: 'TheLastBillingMonth',
    dataset: { granularity: 'Daily', aggregation: { totalCost: { name: 'PreTaxCost', function: 'Sum' } } },
  },
});
```

**What's gated**
- All reads → Cedar allows, broker forwards.
- Nothing destructive in the action list — gate never fires.

---

## 2. Incident response agent (read-only forensics)

**Goal:** when PagerDuty pages, an agent gathers diagnostics from the
affected resource group and posts to the incident channel.

**Cloud connection profile**

| | |
|---|---|
| Azure role | `Reader` + `Log Analytics Reader` |
| Scope | Subscription |
| Display name | `prod-incident-response` |

**Cedar policy**

```cedar
@id("ir_bot")
permit (
  principal == Agent::"ir-bot",
  action in [
    Action::"/azure/vm/get",
    Action::"/azure/vm/get_instance_view",
    Action::"/azure/vm/list_extensions",
    Action::"/azure/resource_health/get",
    Action::"/azure/resource_health/list_events",
    Action::"/azure/monitor/list_activity_logs",
    Action::"/azure/monitor/list_alerts",
    Action::"/azure/log_analytics/kql",
    Action::"/azure/metrics/get"
  ],
  resource
);
```

**Run-command on VM (escalation path)**

If the agent needs `vm/run_command`:

```cedar
permit (
  principal == Agent::"ir-bot",
  action == Action::"/azure/vm/run_command",
  resource
) when {
  context.cosigner == true
};
```

The destructive-verb risk gate already forces cosigner for `run_command`.
Adding the policy clause makes the requirement explicit and audit-visible.

---

## 3. Secret rotation pipeline

**Goal:** a scheduled job rotates Key Vault secrets and stamps Postgres
connection strings into App Service settings.

**Cloud connection profile**

| | |
|---|---|
| Azure role | `Key Vault Secrets Officer` (on one vault) + `Website Contributor` (on one App Service plan) |
| Scope | Resource-group-scoped |
| Display name | `prod-secret-rotator` |

**UCAN constraint**

The agent's UCAN should be constrained to the specific RG so a bug
can't write secrets into the wrong vault:

```ts
const nomos = new NomosClient({
  cloudConnectionId: 'prod-secret-rotator',
  resourceConstraint: {
    provider: 'azure',
    subscription_id: SUB,
    resource_group: 'prod-app-eus',
  },
});
```

**Cedar policy**

```cedar
@id("rotator")
permit (
  principal == Agent::"secret-rotator",
  action in [
    Action::"/azure/key_vaults/get_secret",
    Action::"/azure/key_vaults/set_secret",
    Action::"/azure/key_vaults/rotate_secret",
    Action::"/azure/app_services/update_app_settings"
  ],
  resource
) when {
  // rotate_secret is destructive; require cosigner if not in a known
  // automation window (Sundays 02:00–04:00 UTC).
  action != Action::"/azure/key_vaults/rotate_secret"
  ||
  context.cosigner == true
  ||
  (context.now_dow == 0 && context.now_hour >= 2 && context.now_hour < 4)
};
```

The policy mixes time-windowed automation with operator step-up
otherwise — pure unattended rotation only when the maintenance window
is open.

---

## 4. Dev/test sandbox provisioner

**Goal:** developers describe a desired sandbox in Slack ("give me a Linux
VM with two attached disks"); the agent provisions it inside a dedicated RG.

**Cloud connection profile**

| | |
|---|---|
| Azure role | `Contributor` |
| Scope | One RG: `dev-sandbox-rg` |
| Display name | `dev-sandbox-provisioner` |

**Cedar policy** (note: writes allowed, but only inside the sandbox RG
because UCAN constraint pins it)

```cedar
@id("dev_sandbox")
permit (
  principal,
  action in [
    Action::"/azure/vm/create",
    Action::"/azure/vm/list",
    Action::"/azure/vm/get",
    Action::"/azure/disks/create",
    Action::"/azure/vm/attach_disk",
    Action::"/azure/vnets/create",
    Action::"/azure/subnets/create",
    Action::"/azure/nsgs/create",
    Action::"/azure/nsgs/add_rule",
    Action::"/azure/public_ips/create",
    Action::"/azure/resource_groups/get"
  ],
  resource
);
```

**Cleanup agent** (separate agent, separate API key, runs nightly)

```cedar
@id("dev_sandbox_cleanup")
permit (
  principal == Agent::"dev-sandbox-cleanup",
  action in [
    Action::"/azure/vm/delete",
    Action::"/azure/disks/delete",
    Action::"/azure/public_ips/delete",
    Action::"/azure/nsgs/delete"
  ],
  resource
) when {
  context.cosigner == true
};
```

A human approves the cleanup once per night; the cosigner UCAN burns
the entire deletion sweep.

---

## 5. AKS cluster ops

**Goal:** on-call agents can cordon/drain nodes for emergency
maintenance.

**Cloud connection profile**

| | |
|---|---|
| Azure role | `Azure Kubernetes Service RBAC Cluster Admin` |
| Scope | One cluster |
| Display name | `prod-aks-emergency` |

**Cedar policy**

```cedar
@id("aks_oncall")
permit (
  principal in Group::"oncall-engineers",
  action in [
    Action::"/azure/aks/get",
    Action::"/azure/aks/list_node_pools",
    Action::"/azure/aks/get_kubeconfig",
    Action::"/azure/aks/cordon_node"
  ],
  resource
);

permit (
  principal in Group::"oncall-engineers",
  action in [
    Action::"/azure/aks/drain_node",
    Action::"/azure/aks/rotate_certificates"
  ],
  resource
) when {
  context.cosigner == true
};
```

`drain_node` and `rotate_certificates` are in the destructive list, so
the policy clause and the risk gate redundantly require cosigner.

---

## 6. Blue-green deploy

**Goal:** push a new revision to a green slot, run smoke tests, swap to prod.

**Cloud connection profile**

| | |
|---|---|
| Azure role | `Website Contributor` |
| Scope | One App Service plan |
| Display name | `prod-deploy-bluegreen` |

**Sequence**

```ts
// 1. Deploy build to green slot — no cosigner.
await nomos.azure.app_services.update_app_settings({
  subscription_id: SUB,
  resource_group: RG,
  name: 'my-app',
  slot: 'green',
  body: { properties: { /* new env */ } },
});
await nomos.azure.app_services.redeploy({  // destructive: cosigner step-up
  subscription_id: SUB, resource_group: RG, name: 'my-app', slot: 'green',
});
// → operator approves via /approve/<id>

// 2. Smoke against green slot — out of band.

// 3. Swap green ↔ production — destructive: cosigner step-up.
await nomos.azure.app_services.slot_swap({
  subscription_id: SUB, resource_group: RG, name: 'my-app',
  body: { targetSlot: 'production', preserveVnet: true },
});
```

Two cosigner approvals per deploy — one for the redeploy, one for the
slot swap. Both are recorded in the audit chain with the deploying
agent's DID.

---

## 7. Security posture scanner

**Goal:** weekly scan reporting on NSG rules wider than `Any:*:Any:*`,
public IPs without WAF, secrets older than 90 days.

**Cloud connection profile**

| | |
|---|---|
| Azure role | `Reader` + `Key Vault Reader` |
| Scope | Subscription |
| Display name | `prod-secscan` |

**Cedar policy**

```cedar
@id("secscan")
permit (
  principal == Agent::"secscan",
  action in [
    Action::"/azure/nsgs/list",
    Action::"/azure/nsgs/get",
    Action::"/azure/public_ips/list",
    Action::"/azure/key_vaults/list",
    Action::"/azure/key_vaults/list_secrets",
    Action::"/azure/rbac/list_role_assignments",
    Action::"/azure/policy/list_compliance_states",
    Action::"/azure/monitor/list_diagnostic_settings",
    Action::"/azure/log_analytics/kql"
  ],
  resource
);
```

Pure read agent — no risk gate fires. Output is consumed by the
security team's posture dashboard.

---

## 8. Auto-tag enforcer

**Goal:** every resource without a `cost-center` tag gets one inferred
from its parent RG.

**Cloud connection profile**

| | |
|---|---|
| Azure role | Custom: `Microsoft.Resources/tags/write` |
| Scope | Subscription |
| Display name | `prod-tag-enforcer` |

**Cedar policy**

```cedar
@id("tag_enforcer")
permit (
  principal == Agent::"tag-enforcer",
  action in [
    Action::"/azure/resources/list",
    Action::"/azure/tags/get",
    Action::"/azure/tags/set",
    Action::"/azure/resources/tag"
  ],
  resource
);
```

The agent doesn't need read access to resource contents — only their
metadata. The custom role is much narrower than `Reader`.

---

## 9. Infrastructure-as-code from prompts (with safety rails)

**Goal:** a Slack agent that turns natural-language requests into ARM
templates and deploys them via `deployments/create`.

**Cloud connection profile**

| | |
|---|---|
| Azure role | `Contributor` |
| Scope | One RG: `chat-iac-rg` |
| Display name | `chat-iac-sandbox` |

**Cedar policy**

```cedar
@id("chat_iac")
permit (
  principal == Agent::"chat-iac",
  action in [
    Action::"/azure/deployments/validate",
    Action::"/azure/deployments/what_if"
  ],
  resource
);

permit (
  principal == Agent::"chat-iac",
  action == Action::"/azure/deployments/create",
  resource
) when {
  context.cosigner == true
};
```

`validate` and `what_if` are read-only; the actual `deployments/create`
requires cosigner. The dashboard step-up screen surfaces the rendered
ARM template diff so the operator approves a specific shape, not a
generic deploy permission.

---

## 10. Multi-tenant SaaS — per-customer agent isolation

**Goal:** a SaaS product where each end-customer gets their own agent
talking to their own Azure subscription.

**Pattern**

- One cloud connection per customer.
- One agent per customer, bound to that cloud connection via
  `cloudConnectionId`.
- One Cedar policy per customer (or one shared policy that's parameterized
  on `principal == Agent::"customer-<id>"`).
- UCAN `resource_constraint.subscription_id` pins to the customer's sub.

Cross-tenant access becomes impossible by construction:

1. The customer's UCAN can only be minted for the customer's
   `cloudConnectionId`.
2. The cloud connection's App Registration only has RBAC on the
   customer's subscription.
3. The UCAN constraint pins subscription/RG.
4. Cedar policy filters by principal id.

Even if Cedar is misconfigured, the UCAN constraint and ARM RBAC both
have to fail to leak — both belt and suspenders.

---

## What's not (yet) a use case

These are deliberately out of scope:

| Scenario | Why not |
|---|---|
| Agent that can create role assignments | Possible (`/azure/rbac/create_role_assignment` exists), but defaults to denying via the destructive-style policy clause. The `User Access Administrator` role on the App Reg is required and rarely granted. |
| Agent acting on Entra ID directory objects | Out of scope — Nomos brokers ARM, not Microsoft Graph. Use the existing OAuth bridge for Graph. |
| Agent managing Azure DevOps | Use the OAuth connector for ADO — that's not ARM. |
| Long-running ARM operations | The proxy is synchronous. For asynchronous ARM ops, the agent polls `Location` headers itself via repeated `/v1/proxy` calls. |
| Cross-cloud federation (Azure SP → AWS IAM) | Out of scope for now. Each cloud has its own connection. |
