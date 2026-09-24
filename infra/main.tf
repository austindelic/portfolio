resource "cloudflare_pages_project" "website" {
  account_id        = var.cloudflare_account_id
  name              = var.pages_project_name
  production_branch = var.production_branch
  build_config = {
    build_command   = "bun install --frozen-lockfile && bun run --cwd apps/portfolio build"
    destination_dir = "apps/portfolio/dist"
    root_dir        = "/"
  }
  source = {
    type = "github"
    config = {
      owner                          = var.github_owner
      repo_name                      = var.github_repo
      production_branch              = var.production_branch
      production_deployments_enabled = true
      preview_deployment_setting     = "none"
    }
  }
  deployment_configs = {
    production = {
      env_vars = {
        NODE_VERSION = { type = "plain_text", value = "22" }
        BUN_VERSION  = { type = "plain_text", value = "1.3.5" }
      }
    }
  }
  lifecycle {
    prevent_destroy = true
  }
}
