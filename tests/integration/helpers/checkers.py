import socket
import time

import requests


def check_tcp_through_proxy(
    socks_host: str = "127.0.0.1",
    socks_port: int = 10801,
    target_url: str = "http://test-server/",
    timeout: int = 10,
) -> bool:
    """Check TCP connectivity through a SOCKS5 proxy."""
    try:
        proxies = {
            "http": f"socks5h://{socks_host}:{socks_port}",
            "https": f"socks5h://{socks_host}:{socks_port}",
        }
        resp = requests.get(target_url, proxies=proxies, timeout=timeout)
        return resp.status_code == 200
    except (requests.RequestException, ConnectionError, OSError):
        return False


def check_udp_through_proxy(
    socks_host: str = "127.0.0.1",
    socks_port: int = 10801,
    timeout: int = 10,
) -> bool:
    """Check UDP connectivity through a SOCKS5 proxy via DNS query."""
    try:
        import socks
        import socket

        s = socks.socksocket(socket.AF_INET, socket.SOCK_DGRAM)
        s.set_proxy(socks.SOCKS5, socks_host, socks_port)
        s.settimeout(timeout)
        dns_query = bytes([
            0x00, 0x01,
            0x01, 0x00,
            0x00, 0x01,
            0x00, 0x00,
            0x00, 0x00,
            0x00, 0x00,
            7, ord('e'), ord('x'), ord('a'), ord('m'), ord('p'), ord('l'), ord('e'),
            3, ord('c'), ord('o'), ord('m'),
            0x00,
            0x00, 0x01,
            0x00, 0x01,
        ])
        s.sendto(dns_query, ("8.8.8.8", 53))
        data, _ = s.recvfrom(512)
        s.close()
        return len(data) > 0
    except (socket.timeout, OSError, ImportError):
        return False


def wait_for_proxy(
    checker_fn,
    timeout: int = 30,
    interval: float = 1.0,
    **kwargs,
) -> bool:
    """Poll a checker function until it succeeds or timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if checker_fn(**kwargs):
            return True
        time.sleep(interval)
    return False
