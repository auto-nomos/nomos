terraform {
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
    azuread = { source = "hashicorp/azuread", version = "~> 3.0" }
  }
}

provider "azurerm" {
  features {}
  subscription_id = "3ba95802-7e7c-46b3-975f-cf8508c41100"
}

module "nomos_azure" {
  source = "../azurerm-nomos-bootstrap"

  customer_id       = "bdad3568-ba4f-43b2-bb64-9ac3d13b5e78"
  subscription_id   = "3ba95802-7e7c-46b3-975f-cf8508c41100"
  nomos_oidc_issuer = "https://id.auto-nomos.com"
}

output "paste_into_nomos_dashboard" {
  value = {
    app_object_id   = module.nomos_azure.app_object_id
    app_client_id   = module.nomos_azure.app_client_id
    tenant_id       = module.nomos_azure.tenant_id
    subscription_id = module.nomos_azure.subscription_id
  }
}
