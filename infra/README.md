# Cloudflare Pages infrastructure (OpenTofu)

The website stays on Cloudflare Pages. The terminal app is published to npm and runs on the visitor's computer with `npx austindelic`. There is no application server, container deployment, public SSH endpoint or server hosting charge in this configuration.

OpenTofu manages only the Pages project and its GitHub build integration. Existing domain bindings and DNS records remain managed in Cloudflare; this configuration does not change them.

## Setup

Install OpenTofu 1.11.5 (`mise install` in this directory). Supply `CLOUDFLARE_API_TOKEN` locally with permission to manage Pages in the intended account. Copy `terraform.tfvars.example` to `terraform.tfvars` and fill in the account ID and existing project/repository details. Authorize Cloudflare's GitHub integration for the repository before applying.

Discover and import the existing Pages project before managing it. Do not create a duplicate:

```sh
cd infra
tofu init
tofu import cloudflare_pages_project.website ACCOUNT_ID/PROJECT_NAME
tofu plan
tofu apply
```

Review the plan to ensure only the intended Pages project settings change. Main-branch builds install from the root Bun lockfile and publish `apps/portfolio/dist`. `tofu output website_origin` shows the computed Pages URL. Website updates deploy through the connected GitHub repository.

No server resources were provisioned during implementation. If using a separate state that does contain resources from the former server configuration, review and reconcile it before applying; removing resource definitions can otherwise propose their destruction.

## Validation and state

```sh
tofu fmt -check -recursive
tofu init -backend=false -lockfile=readonly
tofu validate
tofu test
```

The test uses a mocked provider and a plan-only run, with no remote changes. Use `tofu init -reconfigure` before real state operations after backend-disabled checks. Provider versions/checksums are pinned in the dependency lockfile.

After a deliberate provider version update, regenerate the lockfile for both GitHub's Linux AMD64 runner and Apple Silicon macOS. From the repository root:

```sh
tofu -chdir=infra providers lock \
  -platform=linux_amd64 \
  -platform=darwin_arm64
```

Commit the generated lockfile. Verify initialization with `-lockfile=readonly`, validation and mocked tests on both platforms, and confirm the checks leave the lockfile unchanged. Keep CI's read-only lockfile check enabled; a lockfile generated for only one platform can fail provider validation on another.

State lives at `infra/state/terraform.tfstate` and is excluded from Git, alongside local variables and provider downloads. Back up the entire state directory to access-controlled encrypted storage after imports and applies. Avoid concurrent operations from separate copies of local state. Credentials belong in environment variables, never variable files or version control.

After a website deployment, verify home, blog, articles, socials, assets, resume PDF, missing-page status and browser errors at the Pages URL and the existing public domain. Website changes can be rolled back through Cloudflare's deployment history. npm releases are independent of website infrastructure; see `apps/tui/npm/README.md` for publishing setup.
