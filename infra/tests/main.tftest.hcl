mock_provider "cloudflare" {}
variables {
  cloudflare_account_id = "11111111111111111111111111111111"
}
run "website_only" {
  command = plan
  assert {
    condition     = cloudflare_pages_project.website.production_branch == "main"
    error_message = "The website must deploy main."
  }
  assert {
    condition     = cloudflare_pages_project.website.build_config.destination_dir == "apps/portfolio/dist" && cloudflare_pages_project.website.build_config.root_dir == "/"
    error_message = "Build from the root lockfile and publish the portfolio output."
  }
  assert {
    condition     = cloudflare_pages_project.website.source.config.repo_name == var.github_repo && cloudflare_pages_project.website.source.config.owner == var.github_owner
    error_message = "Use the configured GitHub repository."
  }
}
