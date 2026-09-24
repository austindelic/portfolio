terraform {
  required_version = ">= 1.11.5, < 2.0.0"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.25.0"
    }
  }
  backend "local" {
    path = "state/terraform.tfstate"
  }
}
