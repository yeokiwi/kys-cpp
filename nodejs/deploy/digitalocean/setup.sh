#!/usr/bin/env bash
# Installs or updates the kys-cpp web server on a DigitalOcean droplet
# (Ubuntu 22.04 or 24.04). Run it as root; running it again updates the code
# and restarts the services, keeping the game data, saves and settings.
#
#   KYS_DOMAIN=kys.example.com bash setup.sh
#
# Variables (all optional):
#   KYS_DOMAIN         domain name pointing to the droplet; enables HTTPS
#   KYS_AUTH_USER      user name for the password protection (default: player)
#   KYS_AUTH_PASSWORD  password; generated on the first run if not given,
#                      "none" disables the protection
#   KYS_HOME           installation folder (default: /opt/kys)
#   KYS_REPO           git repository (default: https://github.com/yeokiwi/kys-cpp.git)
#   KYS_BRANCH         branch to deploy (default: master)
#   KYS_FIREWALL       set to 0 to leave the firewall (ufw) alone
#   KYS_SWAP_MB        size of the swap file created on small droplets (default: 2048)
set -euo pipefail

KYS_HOME=${KYS_HOME:-/opt/kys}
KYS_REPO=${KYS_REPO:-https://github.com/yeokiwi/kys-cpp.git}
KYS_BRANCH=${KYS_BRANCH:-master}
KYS_FIREWALL=${KYS_FIREWALL:-1}
KYS_SWAP_MB=${KYS_SWAP_MB:-2048}
ENV_FILE="$KYS_HOME/kys.env"
GAME_DIR="$KYS_HOME/game"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

log() {
    printf '\n==> %s\n' "$*"
}

if [ "$(id -u)" -ne 0 ]; then
    echo "Please run this script as root (sudo bash $0)." >&2
    exit 1
fi
export DEBIAN_FRONTEND=noninteractive

log "Installing Docker and tools"
apt-get update -q
apt-get install -y -q ca-certificates curl git rsync ufw openssl
if ! command -v docker >/dev/null 2>&1; then
    apt-get install -y -q docker.io || true
fi
if ! docker compose version >/dev/null 2>&1; then
    apt-get install -y -q docker-compose-v2 || true
fi
if ! docker compose version >/dev/null 2>&1; then
    # Docker's own packages, when the Ubuntu ones are missing or too old
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    . /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -q
    apt-get remove -y -q docker.io docker-compose-v2 >/dev/null 2>&1 || true
    apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

# building the image needs more memory than the smallest droplets have
mem_mb=$(awk '/MemTotal/ { print int($2 / 1024) }' /proc/meminfo)
if [ "$mem_mb" -lt 2000 ] && [ "$(swapon --show --noheadings | wc -l)" -eq 0 ] && [ ! -e /swapfile ]; then
    log "Creating a ${KYS_SWAP_MB} MB swap file (the droplet has ${mem_mb} MB of memory)"
    fallocate -l "${KYS_SWAP_MB}M" /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "Getting the code"
mkdir -p "$KYS_HOME"
if [ -f "$SCRIPT_DIR/../../package.json" ] && [ -f "$SCRIPT_DIR/../../Dockerfile" ]; then
    # the script runs from a checkout: deploy that checkout
    APP_DIR=$(cd "$SCRIPT_DIR/../.." && pwd)
    if git -C "$APP_DIR" rev-parse --git-dir >/dev/null 2>&1 && [ -z "${KYS_NO_PULL:-}" ]; then
        git -C "$APP_DIR" pull --ff-only || echo "Could not update $APP_DIR from git, deploying it as it is."
    fi
else
    SRC_DIR="$KYS_HOME/src"
    if [ ! -d "$SRC_DIR/.git" ]; then
        # only the nodejs folder of the repository is needed
        git clone --depth 1 --filter=blob:none --sparse --branch "$KYS_BRANCH" "$KYS_REPO" "$SRC_DIR"
        git -C "$SRC_DIR" sparse-checkout set nodejs
    else
        git -C "$SRC_DIR" fetch --depth 1 origin "$KYS_BRANCH"
        git -C "$SRC_DIR" checkout -q -B "$KYS_BRANCH" FETCH_HEAD
    fi
    APP_DIR="$SRC_DIR/nodejs"
fi
DEPLOY_DIR="$APP_DIR/deploy/digitalocean"

log "Writing the settings ($ENV_FILE)"
quote() {
    # single quotes keep the value literal in compose env files
    case "$1" in
    *"'"*)
        echo "Values cannot contain single quotes: $1" >&2
        exit 1
        ;;
    esac
    printf "'%s'" "$1"
}
get_setting() {
    [ -f "$ENV_FILE" ] && sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | sed "s/^'\(.*\)'$/\1/" || true
}
domain=${KYS_DOMAIN-$(get_setting KYS_DOMAIN)}
user=${KYS_AUTH_USER-$(get_setting KYS_AUTH_USER)}
user=${user:-player}
password=${KYS_AUTH_PASSWORD-$(get_setting KYS_AUTH_PASSWORD)}
new_password=""
if [ -z "$password" ] && [ ! -f "$ENV_FILE" ]; then
    password=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 16)
    new_password=1
fi
if [ "$password" = "none" ]; then
    password=""
fi
umask 077
cat > "$ENV_FILE" <<EOF
# kys-cpp web server settings, see $DEPLOY_DIR/kys.env.example
KYS_DOMAIN=$(quote "$domain")
KYS_AUTH_USER=$(quote "$user")
KYS_AUTH_PASSWORD=$(quote "$password")
KYS_GAME_DIR=$(quote "$GAME_DIR")
EOF
umask 022

log "Preparing the game folder ($GAME_DIR)"
mkdir -p "$GAME_DIR/save" "$GAME_DIR/config"
chown -R 1000:1000 "$GAME_DIR"
if [ ! -d "$GAME_DIR/resource" ]; then
    echo "WARNING: $GAME_DIR/resource not found. Upload the game resources, for example:"
    echo "  rsync -az --info=progress2 /path/to/game/ root@<droplet-ip>:$GAME_DIR/"
    echo "  ssh root@<droplet-ip> chown -R 1000:1000 $GAME_DIR"
fi

if [ "$KYS_FIREWALL" != "0" ]; then
    log "Configuring the firewall (SSH, HTTP, HTTPS)"
    ufw allow OpenSSH >/dev/null
    ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
    ufw allow 443/udp >/dev/null
    ufw --force enable >/dev/null
fi

log "Building and starting the services"
docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml" up -d --build --remove-orphans
docker image prune -f >/dev/null

ip=$(curl -fsS --max-time 3 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null \
    || hostname -I | awk '{ print $1 }')
log "Done"
if [ -n "$domain" ]; then
    echo "The game is at https://$domain (the certificate is issued on the first visit; the DNS record must point to $ip)."
else
    echo "The game is at http://$ip"
fi
if [ -n "$password" ]; then
    if [ -n "$new_password" ]; then
        echo "Log in as \"$user\" with the generated password: $password"
    else
        echo "Log in as \"$user\" with the password in $ENV_FILE."
    fi
else
    echo "Password protection is off."
fi
echo "Logs: docker compose --env-file $ENV_FILE -f $DEPLOY_DIR/docker-compose.yml logs -f"
