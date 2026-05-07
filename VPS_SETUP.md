# VPS Setup Guide — Hostinger Ubuntu 22.04

This guide preps your Hostinger VPS (`82.25.91.197`, KVM 2, 8 GB / 100 GB / Ubuntu 22.04) to host the volleyball stats API at `api.titoscourts.com`.

**You can do this in parallel with building Phase 1 locally.** The VPS doesn't need to be ready until you're at Session 10 (the deploy session) of the runbook.

---

## Pre-wipe: back up anything you want to keep

Before clicking reinstall, SSH in and grab anything from OpenClaw or other previous work that you want to preserve:

```bash
# From your laptop:
ssh root@82.25.91.197
# Inside the VPS: tar up things you care about
tar czf openclaw-backup.tar.gz /opt/openclaw /etc/wireguard /root/.ssh
# From your laptop:
scp root@82.25.91.197:openclaw-backup.tar.gz ~/Backups/
```

Once you're confident, proceed.

---

## Step 1 — Reinstall Ubuntu 22.04 from Hostinger panel

1. Go to your Hostinger VPS dashboard
2. **OS & Panel** → **Operating System** → choose **Ubuntu 22.04 LTS**
3. Click **Change OS** and confirm
4. Wait ~5–10 minutes for reinstall
5. Hostinger will email you a fresh root password

After reinstall, the IP stays the same (`82.25.91.197`).

---

## Step 2 — Initial SSH + change root password

From your laptop:
```bash
ssh root@82.25.91.197
# Use the password from Hostinger's email
```

Change the root password to something only you have:
```bash
passwd
```

Update the system:
```bash
apt update && apt upgrade -y
apt install -y curl wget git ufw fail2ban unattended-upgrades vim htop
```

---

## Step 3 — Create a non-root user

Running everything as root is bad practice. Create a deploy user:

```bash
adduser tej
usermod -aG sudo tej
# Set a strong password when prompted
```

Test it:
```bash
exit
ssh tej@82.25.91.197
sudo whoami    # should print "root"
```

---

## Step 4 — SSH key auth, disable password login

On your **laptop** (not the VPS), if you don't already have an SSH key:
```bash
ssh-keygen -t ed25519 -C "tej-titos-vps"
# Accept default location (~/.ssh/id_ed25519)
```

Copy your public key to the VPS:
```bash
ssh-copy-id tej@82.25.91.197
```

Test logging in without a password:
```bash
ssh tej@82.25.91.197    # should NOT prompt for password
```

Now harden SSH on the VPS:
```bash
sudo vim /etc/ssh/sshd_config
```

Set / change these lines:
```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Restart SSH:
```bash
sudo systemctl restart ssh
```

**Test from a NEW terminal before closing your current session** — if SSH is broken you want to recover, not get locked out:
```bash
ssh tej@82.25.91.197    # should work
ssh root@82.25.91.197   # should be denied
```

---

## Step 5 — Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp     # HTTP for Let's Encrypt challenges
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
sudo ufw status verbose
```

You should see ports 22, 80, 443 open.

---

## Step 6 — fail2ban + unattended security upgrades

These are set-it-and-forget-it protections.

```bash
# fail2ban: bans IPs that fail SSH login repeatedly
sudo systemctl enable --now fail2ban

# unattended-upgrades: applies security patches automatically
sudo dpkg-reconfigure -plow unattended-upgrades   # answer yes when prompted
```

Verify both are running:
```bash
sudo systemctl status fail2ban
sudo systemctl status unattended-upgrades
```

---

## Step 7 — Install Docker + Docker Compose

```bash
# Official Docker install script
curl -fsSL https://get.docker.com | sudo sh

# Add tej to the docker group so you don't need sudo
sudo usermod -aG docker tej

# Log out and back in for the group change to take effect
exit
ssh tej@82.25.91.197

# Verify
docker --version
docker compose version    # should be v2 (built into the docker CLI now)
docker run --rm hello-world
```

---

## Step 8 — DNS records at your registrar

Whatever hosts the DNS for `titoscourts.com` (Cloudflare, Namecheap, Hostinger itself, etc.), add this record:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `api` | `82.25.91.197` | 300 (or default) |

If you're using Cloudflare DNS, **set the proxy to "DNS only" (grey cloud)** for the `api` record. Caddy needs to handle TLS itself for Let's Encrypt to work cleanly. You can flip it to "proxied" later if you want, with extra config.

Verify the record propagates (can take 1–60 minutes):
```bash
dig api.titoscourts.com +short
# Should return: 82.25.91.197
```

---

## Step 9 — Project directory on the VPS

This is where the deployed app will live. Create it now so it's ready:

```bash
sudo mkdir -p /srv/titos-stats
sudo chown tej:tej /srv/titos-stats
cd /srv/titos-stats
```

The actual deploy (cloning the repo, populating `.env`, starting Docker Compose) happens in Session 10 of the runbook, not here.

---

## Step 10 — Sanity checklist

Before you call this VPS "ready," confirm:

- [ ] SSH login works as `tej` with key, fails as `root`, fails with password
- [ ] `sudo ufw status` shows ports 22, 80, 443 open and nothing else
- [ ] `docker run --rm hello-world` works without `sudo`
- [ ] `dig api.titoscourts.com +short` returns `82.25.91.197`
- [ ] `fail2ban` and `unattended-upgrades` are active
- [ ] `/srv/titos-stats` exists and is owned by `tej`

When all six are checked, the VPS is deploy-ready. You can come back to this whenever — it doesn't block local Phase 1 development.

---

## Optional but recommended: Tailscale

If you want secure private access to the VPS without exposing SSH to the internet at all:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
# Follow the auth URL on your laptop
```

Then in the UFW step, you can drop `OpenSSH` from the public allow list and only allow SSH over Tailscale. This is overkill for now — fine to skip until you have shared access patterns.

---

## Notes

- **Boston datacenter latency from Mississauga**: ~25–35ms. Fine.
- **8 GB RAM is plenty** for Postgres + FastAPI + Caddy. Phase 3 ML jobs will use more during processing but that's a single-job-at-a-time concern.
- **100 GB disk** holds ~25 raw match videos before filling up. Hence R2 for video — keep the VPS slim.
- **Auto-renewal on Hostinger is on through 2027** — verify in the panel; cancel anytime if you ever migrate.
- **If the IP changes** (Hostinger generally keeps it stable but anything is possible), update the `api` A record and Caddy refetches certs automatically.
