#!/bin/sh
# Decrypt /etc/floodwatch/secrets/<name>.age -> /run/floodwatch/<name>.
# /run is tmpfs on Ubuntu, so plaintext never touches disk.
# Run by floodwatch-secrets.service before docker.service.
#
# Permissions: dir 0700 root:root (no host user can traverse it); files
# 0440 root:1000. Compose (non-swarm) bind-mounts the file keeping host
# ownership, so inside the containers:
#   - postgres: the entrypoint reads POSTGRES_PASSWORD_FILE as root, exports
#     the value and only then drops to the postgres user (uid 70 on alpine,
#     999 on Debian) -- that uid never opens the file, root ownership is enough.
#   - backend: runs as appuser uid/gid 1000 -> needs the group read bit.
set -eu

SRC=/etc/floodwatch/secrets
DST=/run/floodwatch
KEY=/etc/age/tencent.key
READER_GID=1000

umask 077
install -d -m 0700 -o root -g root "$DST"

for f in "$SRC"/*.age; do
	[ -e "$f" ] || { echo "no secrets in $SRC" >&2; exit 1; }
	name=$(basename "$f" .age)
	tmp=$(mktemp "$DST/.$name.XXXXXX")
	age -d -i "$KEY" -o "$tmp" "$f"
	chown root:"$READER_GID" "$tmp"
	chmod 0440 "$tmp"
	mv -f "$tmp" "$DST/$name"
done

# Optional secrets: compose needs the source file to exist, so create an empty
# one when there is no .age for it (the app treats empty as "not configured").
for name in owm_api_key; do
	if [ ! -e "$DST/$name" ]; then
		install -m 0440 -o root -g "$READER_GID" /dev/null "$DST/$name"
	fi
done
