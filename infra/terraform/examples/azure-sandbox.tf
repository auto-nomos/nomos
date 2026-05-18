# Example: Nomos Azure sandbox with Contributor scope on one RG.
#
# Use this to set up a second cloud connection on top of your existing
# Reader-only Nomos Azure connection so the prod-azure-mutate.mts
# benchmark can exercise real create/tag/delete cycles end-to-end
# through the broker.
#
# What this provisions in your Azure tenant:
#   - A dedicated resource group `nomos-sandbox-rg` (cheap, no resources
#     by default).
#   - A separate App Registration `nomos-sandbox-contrib` (distinct from
#     your main `nomos-agent-broker` app so the blast radius stays
#     scoped).
#   - One FIC for `verify-poll` + one per additional_agent_ids entry.
#   - Contributor role scoped ONLY to `nomos-sandbox-rg` — no access to
#     anything outside the RG.
#
# After `terraform apply`:
#   1. terraform output paste_into_nomos_dashboard
#   2. Dashboard /app/cloud/connect/azure → paste the four values; pick a
#      display name like `azure-sandbox`. This creates a NEW cloud_connection
#      row (separate from the Reader one).
#   3. Note the new connection_id from /app/cloud after creation. Export
#      as NOMOS_SANDBOX_CLOUD_CONN_ID before running scripts/prod-azure-mutate.mts.
#   4. Register a FIC for each test agent: the new app detail page surfaces
#      the exact az command pre-filled.

terraform {
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
    azuread = { source = "hashicorp/azuread", version = "~> 3.0" }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

variable "subscription_id" {
  description = "Same subscription as your main Nomos connection — sandbox RG lives here."
  type        = string
}

variable "customer_id" {
  description = "Nomos customer id — from /app/settings/workspace."
  type        = string
}

variable "sandbox_rg_name" {
  type    = string
  default = "nomos-sandbox-rg"
}

variable "sandbox_location" {
  type    = string
  default = "eastus2"
}

variable "additional_agent_ids" {
  description = "Agent ids that should have FICs on the sandbox app. Add as you create test agents in Nomos."
  type        = list(string)
  default     = []
}

resource "azurerm_resource_group" "sandbox" {
  name     = var.sandbox_rg_name
  location = var.sandbox_location

  tags = {
    purpose = "nomos-sandbox-mutation-tests"
    owner   = "nomos-broker"
  }
}

module "nomos_sandbox" {
  source = "../azurerm-nomos-bootstrap"

  customer_id          = var.customer_id
  subscription_id      = var.subscription_id
  app_display_name     = "nomos-sandbox-contrib"
  role_definition_name = "Contributor"
  resource_group_name  = azurerm_resource_group.sandbox.name
  additional_agent_ids = var.additional_agent_ids

  depends_on = [azurerm_resource_group.sandbox]
}

output "paste_into_nomos_dashboard" {
  description = "Paste these four values into /app/cloud/connect/azure to create the sandbox cloud connection."
  value = {
    app_object_id   = module.nomos_sandbox.app_object_id
    app_client_id   = module.nomos_sandbox.app_client_id
    tenant_id       = module.nomos_sandbox.tenant_id
    subscription_id = module.nomos_sandbox.subscription_id
  }
}

output "sandbox_rg_id" {
  description = "ARM id of the sandbox resource group — agents in this connection only see this RG."
  value       = azurerm_resource_group.sandbox.id
}

output "role_scope" {
  description = "Contributor scope (should match sandbox_rg_id)."
  value       = module.nomos_sandbox.role_scope
}
