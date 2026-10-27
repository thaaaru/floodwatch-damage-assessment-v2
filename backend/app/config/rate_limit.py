"""Shared client identity and SlowAPI limiter."""
from functools import lru_cache
from ipaddress import ip_address, ip_network

from fastapi import Request
from slowapi import Limiter


@lru_cache(maxsize=32)
def _networks(value: str):
    networks = []
    for item in value.split(","):
        item = item.strip()
        if item:
            try:
                networks.append(ip_network(item, strict=False))
            except ValueError:
                continue
    return tuple(networks)


def get_client_identity(request: Request, trusted_proxy_cidrs: str = "") -> str:
    """Use forwarded identity only when the immediate network peer is trusted."""
    peer = request.client.host if request.client else "unknown"
    try:
        peer_ip = ip_address(peer)
    except ValueError:
        return peer
    if not any(peer_ip in network for network in _networks(trusted_proxy_cidrs)):
        return peer
    forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
    try:
        return str(ip_address(forwarded))
    except ValueError:
        return peer


def _client_key(request: Request) -> str:
    from . import get_settings

    return get_client_identity(request, get_settings().trusted_proxy_cidrs)


limiter = Limiter(key_func=_client_key)
