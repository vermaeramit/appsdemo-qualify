# Deploying AppsDemo Qualify

One Ubuntu server runs everything with Docker Compose (ARCHITECTURE §12): Caddy (TLS, the
dashboard, `/api` proxy), api, worker, Postgres, Redis, and optionally Uptime Kuma. Images are
built by GitHub Actions and pulled from GHCR. Files: [`Dockerfile`](../Dockerfile),
[`deploy/prod/`](../deploy/prod), [`.github/workflows/release.yml`](../.github/workflows/release.yml).

## 1. What you need

- A VPS with Ubuntu 24.04 LTS, 4 vCPU / 8 GB RAM / 80 GB disk (enough for the first ~20 workspaces).
- DNS: an `A` record for the production domain (e.g. `qualify.appsdemo.in`) pointing to the
  server, and one for staging if you run it (`qualify-staging.appsdemo.in`).
- A GitHub token with `read:packages` for the server to pull the private images.
- The Meta app values (`docs/META_SETUP.md`) and an OpenAI API key.
- For scheduled e-mail reports: an SMTP account at a transactional e-mail provider (Brevo,
  ZeptoMail or Amazon SES) with the sender domain verified (SPF and DKIM records in DNS). Put its
  URL in `SMTP_URL` and the sender in `MAIL_FROM`, or enter the server on the platform admin page (Email (SMTP), D-095), which takes precedence. Without them reports are kept but not sent, and
  the Integrations page says so.

## 2. Prepare the server (once)

```sh
# as root
adduser --disabled-password deploy && usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/ && chown -R deploy: /home/deploy/.ssh
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/; s/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh
apt update && apt install -y ufw fail2ban unattended-upgrades rclone
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
dpkg-reconfigure -f noninteractive unattended-upgrades
curl -fsSL https://get.docker.com | sh && usermod -aG docker deploy
```

Docker publishes ports past ufw; the compose file only publishes 80/443 (Uptime Kuma is bound to
127.0.0.1), so Postgres and Redis stay on the internal network.

## 3. First deploy

```sh
# as deploy
sudo mkdir -p /opt/qualify && sudo chown deploy: /opt/qualify
git clone https://github.com/<owner>/appsdemo-qualify.git /opt/qualify
cd /opt/qualify/deploy/prod
cp .env.example .env && chmod 600 .env   # fill in every value (see comments in the file)
echo "<github-token>" | docker login ghcr.io -u <github-user> --password-stdin
docker compose pull
docker compose up -d postgres redis
docker compose run --rm migrate            # creates/updates the schema (owner connection)
docker compose up -d
docker compose ps                          # api "healthy", caddy up
curl -fsS https://<APP_DOMAIN>/api/health
```

Images come from **Actions → Release → Run workflow** (or pushing a tag `v1.0.0`). The run
prints the tag (`<branch-or-tag>-<sha>`); `latest` points to the newest build.

Keep a copy of `ENCRYPTION_MASTER_KEY` outside the server (password manager): without it the
stored Meta tokens and webhook secrets can't be decrypted, even from a backup.

## 3b. Shared server (another product already owns 80/443)

When the server already runs another product whose Caddy owns ports 80/443 (our first server
runs `appsdemo-dine` in `/opt/appsdemo-dine`), run Qualify next to it without publishing any
port (D-093):

- `.env` gets `COMPOSE_FILE=compose.yaml:compose.behind-proxy.yaml`. The override removes our
  Caddy's ports, mounts [`Caddyfile.behind-proxy`](../deploy/prod/Caddyfile.behind-proxy) (plain
  HTTP on :80, trusts the forwarding proxy for the visitor's IP and scheme), puts it on the
  external Docker network `qualify-edge` as `qualify-web`, and caps memory/CPU per service
  (about 3 GB RAM in total) so this stack can't starve the other one.
- Once: `docker network create qualify-edge`.
- The other product's Caddy forwards our domain. Connect it to the network without a restart and
  add one site block to its Caddyfile, edited in place (it is a single-file bind mount), then
  validate and reload gracefully:

  ```sh
  docker network connect qualify-edge appsdemo-dine-caddy-1
  cat >> /opt/appsdemo-dine/deploy/caddy/Caddyfile <<'CADDY'

  # AppsDemo Qualify (/opt/qualify), reached over the qualify-edge network (D-093).
  qualify.appsdemo.in {
  	reverse_proxy qualify-web:80 {
  		import upstream
  	}
  }
  CADDY
  docker exec appsdemo-dine-caddy-1 caddy validate --config /etc/caddy/Caddyfile
  docker exec appsdemo-dine-caddy-1 caddy reload --config /etc/caddy/Caddyfile
  ```

  Put the same two changes in the other product's own repository (its compose: the caddy service
  joins the external `qualify-edge` network; its Caddyfile: the block above), or its next deploy
  removes them and only Qualify goes offline.
- Without a registry token, build the images locally (the web image with the website's
  settings: `--build-arg VITE_SITE_URL=https://<APP_DOMAIN> --build-arg VITE_SITE_WHATSAPP_NUMBER=<digits>`,
  D-101; optionally `VITE_SITE_COMPANY_NAME` and `VITE_SITE_SOCIAL_LINKS` for search engines, D-103) and load them over SSH:
  `docker save qualify/api:<tag> qualify/worker:<tag> qualify/web:<tag> | gzip | ssh <server> 'gunzip | sudo docker load'`
  (`IMAGE_PREFIX=qualify`, `IMAGE_TAG=<tag>`; skip `docker compose pull`).

## 4. Connect Meta

1. Meta app → WhatsApp → Configuration → Webhook: callback
   `https://<APP_DOMAIN>/api/webhooks/meta`, verify token = `META_WEBHOOK_VERIFY_TOKEN`; subscribe
   `messages` (and `smb_message_echoes` for Coexistence numbers). Pages → Webhooks: `leadgen`.
   Or run the script inside the worker image:
   `docker compose run --rm worker node dist/scripts/set-dev-webhook.js https://<APP_DOMAIN>`
   (needs `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` in `.env`).
2. Sign up at `https://<APP_DOMAIN>`, create the client's workspace (pick its business type).
3. Connect the number. With Embedded Signup configured (`META_APP_ID`, `META_APP_SECRET`,
   `META_ES_CONFIG_ID`: a Facebook Login for Business configuration for WhatsApp Embedded Signup
   v4, with the app's domain allowed), the client's owner opens Settings → WhatsApp number →
   **Connect WhatsApp** and picks "My WhatsApp Business app number" (Coexistence) or "A number
   only for the API" (PIN). Coexistence numbers must finish within 24 h for the contacts/history
   sync. Requires Tech Provider access on the Meta app.
   Without it, connect the client's number and Page with the scripts in the
   worker image, with the client's system-user token in `.env` (`WHATSAPP_DEV_WABA_ID`,
   `WHATSAPP_DEV_PHONE_NUMBER_ID`, `WHATSAPP_SYSTEM_USER_TOKEN`, `META_PAGES_TOKEN`):
   `docker compose run --rm worker node dist/scripts/connect-dev-number.js <workspace-slug>` and
   `docker compose run --rm worker node dist/scripts/connect-dev-page.js <workspace-slug> <page-id>`.
4. AI agent page: install the right template, review questions, publish; submit the opening and
   follow-up templates to Meta and activate them once approved. An agent prepared as JSON (or
   exported from another environment) can be installed with
   `docker compose exec -T worker node dist/scripts/import-agent.js <workspace-slug> - --name="<name>" [--default] < agent.json`.

Production always messages every lead (`DEV_ALLOWED_NUMBERS` only applies in development).

## 5. Updates and rollback

```sh
cd /opt/qualify/deploy/prod
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=<new-tag>/' .env
docker compose pull && docker compose run --rm migrate && docker compose up -d
```

Or run the Release workflow with **deploy** ticked (secrets `DEPLOY_HOST`, `DEPLOY_USER`,
`DEPLOY_SSH_KEY` in a `production` environment; repository variables `SITE_URL`,
`SITE_WHATSAPP_NUMBER`, `SITE_PRODUCT_NAME` for the website, D-101).
The Caddyfile is mounted from the server (`deploy/prod/Caddyfile*`): copy the new one there when
it changes (D-101 added the website routes) before `up -d`. Rollback = set the previous tag and `up -d`.
Migrations only add (no destructive changes without a decision entry), so an older image runs on
a newer schema.

## 6. Backups and restore drill

```sh
chmod +x backup.sh restore.sh
crontab -e   # add:
15 2 * * * cd /opt/qualify/deploy/prod && ./backup.sh >> backups/backup.log 2>&1
```

`backup.sh` writes a verified `pg_dump` to `deploy/prod/backups`, keeps `BACKUP_KEEP_DAYS` days,
and copies it off-site when `BACKUP_RCLONE_REMOTE` is set (`rclone config` once, e.g. Cloudflare
R2 or S3). Monthly drill: `./restore.sh backups/<latest>.dump qualify_restore_test` and check the
counts it prints; then drop the scratch database.

## 7. Operations

- Logs: `docker compose logs -f --tail=200 api worker` (JSON, rotated at 5 × 20 MB per service).
- Health: `https://<APP_DOMAIN>/api/health`; optional Uptime Kuma:
  `docker compose --profile monitoring up -d`, then `ssh -L 3001:127.0.0.1:3001 deploy@<server>`
  and open http://localhost:3001 to add the health check and alerts.
- Queues live in Redis (append-only file on the `redisdata` volume); jobs survive restarts.
- Staging: the same steps in a second directory or server with its own `.env`, domain and Meta
  test app.
