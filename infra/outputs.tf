output "website_origin" {
  value = "https://${cloudflare_pages_project.website.subdomain}"
}
