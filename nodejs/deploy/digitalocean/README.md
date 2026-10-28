# Deploying on a DigitalOcean droplet

This folder deploys the kys-cpp web edition on a DigitalOcean droplet:

- the game server (the `kys-cpp-web` Docker image built from `nodejs/`),
- [Caddy](https://caddyserver.com) in front of it, serving HTTPS with an automatic Let's Encrypt certificate when a domain name is configured, or plain HTTP on the droplet's IP otherwise,
- password protection (HTTP basic authentication), on by default,
- a firewall that only lets SSH, HTTP and HTTPS in.

| File | Purpose |
| --- | --- |
| `setup.sh` | installs Docker, writes the settings, starts everything; run it again to update |
| `docker-compose.yml` | the game server and Caddy |
| `Caddyfile` | the Caddy configuration |
| `kys.env.example` | the settings that `setup.sh` writes to `/opt/kys/kys.env` |
| `cloud-init.yml` | user data that runs the setup when the droplet is created |

## 1. Create the droplet

- Image: **Ubuntu 24.04 LTS** (22.04 also works).
- Size: 1 GB of memory is enough to play (`setup.sh` adds a swap file on droplets with less than 2 GB so that the image can be built). Choose a disk with room for the game resources and the rendered music.
- Authentication: an SSH key.
- Optional: paste `cloud-init.yml` (edited) into **Advanced options → Add initialized data** to install everything on the first boot, then skip to step 3.

With [doctl](https://docs.digitalocean.com/reference/doctl/):

```bash
doctl compute droplet create kys --image ubuntu-24-04-x64 --size s-1vcpu-1gb --region sgp1 --ssh-keys <key-id> --user-data-file nodejs/deploy/digitalocean/cloud-init.yml --wait
```

If you want HTTPS, create a DNS **A record** for your domain pointing to the droplet's IP address now, before running the setup, so that the certificate can be issued.

## 2. Install the server

Log in as root and run the setup script from the repository:

```bash
ssh root@<droplet-ip>
```

```bash
apt-get update && apt-get install -y git
```

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/yeokiwi/kys-cpp.git /opt/kys/src && git -C /opt/kys/src sparse-checkout set nodejs
```

```bash
KYS_DOMAIN=kys.example.com bash /opt/kys/src/nodejs/deploy/digitalocean/setup.sh
```

Leave out `KYS_DOMAIN` to use plain HTTP on the droplet's IP address. At the end the script prints the address of the game and the generated password (also kept in `/opt/kys/kys.env`). Use `KYS_BRANCH=<branch>` to deploy another branch than `master`, and `KYS_REPO=<url>` for another repository. For a private repository, clone it with a deploy key or an access token instead of the public URL.

Settings accepted by `setup.sh`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `KYS_DOMAIN` | empty | domain name; enables HTTPS |
| `KYS_AUTH_USER` | `player` | user name for the password protection |
| `KYS_AUTH_PASSWORD` | generated | password; `none` turns the protection off |
| `KYS_HOME` | `/opt/kys` | installation folder |
| `KYS_FIREWALL` | `1` | `0` leaves the firewall (ufw) alone |

Values given once are remembered in `/opt/kys/kys.env`.

## 3. Upload the game resources

The game resources are not in the repository. Copy the game directory (the one that contains `resource/`, `save/`, `config/`, `music/`, `font/`, ...) from your computer to `/opt/kys/game`, then give it to the server's user (uid 1000):

```bash
rsync -az --info=progress2 /path/to/game/ root@<droplet-ip>:/opt/kys/game/
```

```bash
ssh root@<droplet-ip> chown -R 1000:1000 /opt/kys/game
```

Reload the page in the browser; no restart is needed.

## Everyday operations

All commands run on the droplet as root.

Update to the latest code (the game data, saves and settings are kept):

```bash
bash /opt/kys/src/nodejs/deploy/digitalocean/setup.sh
```

Change the domain or the password: edit `/opt/kys/kys.env`, or pass the new value to `setup.sh`, and run `setup.sh` again.

Logs and status:

```bash
docker compose --env-file /opt/kys/kys.env -f /opt/kys/src/nodejs/deploy/digitalocean/docker-compose.yml logs -f
```

```bash
docker compose --env-file /opt/kys/kys.env -f /opt/kys/src/nodejs/deploy/digitalocean/docker-compose.yml ps
```

Back up the saves and settings:

```bash
tar czf /root/kys-saves-$(date +%F).tar.gz -C /opt/kys/game save config
```

DigitalOcean's droplet backups or snapshots also cover everything in `/opt/kys`.

## Notes

- Everybody who can open the game shares the same save slots and settings, as on a single computer. Keep the password protection on when the server is reachable from the internet.
- Browsers only allow gamepads on HTTPS pages, so use a domain name if you play with a controller.
- The services restart automatically after a reboot or a crash.
- Docker publishes ports past ufw; only Caddy publishes ports (80 and 443), the game server is reachable only through Caddy.
