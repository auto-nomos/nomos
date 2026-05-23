terraform {
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
    azuread = { source = "hashicorp/azuread", version = "~> 3.0" }
  }
}

provider "azurerm" {
  features {}
  subscription_id = "da3388b9-1155-4b27-a430-4daae86db313"
}

module "nomos_azure" {
  source = "../azurerm-nomos-bootstrap"

  customer_id       = "ed539890-8bab-4d3d-804a-b1bfe8c90a9f"
  subscription_id   = "da3388b9-1155-4b27-a430-4daae86db313"
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
