# Сервисы определения IP и геолокации

## Основные GeoIP-провайдеры

| Сервис | URL | API | Бесплатный лимит | Описание |
|--------|-----|-----|------------------|----------|
| **ipapi.is** | https://ipapi.is | `https://api.ipapi.is/?ip={ip}` | 1000/день | Основной источник. GeoIP + hosting/proxy/VPN/Tor/datacenter сигналы |
| **iplocate.io** | https://iplocate.io | `https://www.iplocate.io/api/lookup/{ip}` | 1000/день | Fallback-источник. GeoIP + `privacy.is_hosting` |
| **ip-api.com** | https://ip-api.com | `http://ip-api.com/json/{ip}` | 45/мин (без key) | GeoIP, ISP, organization, ASN |
| **ipinfo.io** | https://ipinfo.io | `https://ipinfo.io/{ip}/json` | 50K/месяц | GeoIP, ASN, hostname,公司 |
| **ipgeolocation.io** | https://ipgeolocation.io | `https://api.ipgeolocation.io/ipgeo/{ip}` | 1K/день | GeoIP, timezone, ISP |
| **abstractapi.com** | https://www.abstractapi.com | `https://ipgeolocation.abstractapi.com/v1/?api_key={key}&ip_address={ip}` | 20K/месяц | GeoIP, timezone, security |
| **ipwhois.io** | https://ipwhois.io | `https://ipwhois.io/{ip}` | 10K/месяц | GeoIP, ASN, connection type |
| **coordinates.com** | https://www.coordinates.com | `https://api.coordinates.com/ip/lookup?key={key}&ip={ip}` | — | GeoIP с точными координатами |
| **ipstack.com** | https://ipstack.com | `http://api.ipstack.com/{ip}?access_key={key}` | 100/месяц | GeoIP, timezone, hostname |

## Определение публичного IP (RU и не-RU чекеры)

### RU-сервисы (используются в RKNHardering для IpComparisonChecker)

| Сервис | URL | Формат |
|--------|-----|--------|
| **Yandex IPv4** | https://yandex.ru/internet/verify | Текст |
| **Yandex IPv6** | https://yandex.ru/internet/verify | Текст |
| **2ip.ru** | https://2ip.ru | Текст/JSON |
| **ipinfo.io** (RU endpoint) | https://ipinfo.io | JSON |

### Не-RU сервисы

| Сервис | URL | Формат |
|--------|-----|--------|
| **ifconfig.me** | https://ifconfig.me | Текст |
| **checkip.amazonaws.com** | https://checkip.amazonaws.com | Текст |
| **api.ipify.org** | https://api.ipify.org | Текст/JSON |
| **ip.sb** | https://ip.sb | Текст |
| **icanhazip.com** | https://icanhazip.com | Текст |
| **api.ip.sb** | https://api.ip.sb/ip | Текст |
| **ident.me** | https://ident.me | Текст |
| **wtfismyip.com** | https://wtfismyip.com | Текст/JSON |
| **myexternalip.com** | https://myexternalip.com | Текст |
| **checkip.dyndns.org** | http://checkip.dyndns.org | Текст |
| **ipinfo.io/ip** | https://ipinfo.io/ip | Текст |
| **seeip.org** | https://seeip.org | Текст |
| **ipecho.net** | https://ipecho.net/plain | Текст |
| **jsonip.com** | https://jsonip.com | JSON |

## Детекция VPN/Proxy/Hosting

| Сервис | URL | Описание |
|--------|-----|----------|
| **ipapi.is** | https://ipapi.is | `proxy`, `vpn`, `tor`, `hosting`, `datacenter` флаги |
| **iplocate.io** | https://iplocate.io | `privacy.is_hosting` флаг |
| **vpnapi.io** | https://vpnapi.io | API для детекции VPN |
| **iphub.info** | https://iphub.info | Классификация IP (residential/datacenter/proxy) |
| **ipregistry.co** | https://ipregistry.co | VPN/proxy/bot/threat детекция |
| **abstractapi.com** | https://abstractapi.com | Security API: VPN/proxy/threat |
| **ipqualityscore.com** | https://www.ipqualityscore.com | Fraud scoring, VPN/proxy detection |
| **maxmind.com** | https://www.maxmind.com | GeoIP2 + ASN + анонимность |
| **spur.us** | https://spur.us | VPN/proxy/datacenter детекция |
| **ip2location.com** | https://www.ip2location.com | Proxy detection database |

## ASN / BGP / Whois

| Сервис | URL | API | Описание |
|--------|-----|-----|----------|
| **bgp.tools** | https://bgp.tools | — | BGP toolkit |
| **bgpview.io** | https://bgpview.io | `https://api.bgpview.io/ip/{ip}` | ASN, BGP routes, prefixes |
| **bgp.he.net** | https://bgp.he.net | — | BGP/ASN lookup |
| **whois.domaintools.com** | https://whois.domaintools.com | Платный | Whois lookup, historical data |
| **who.is** | https://who.is | — | Whois информация |
| **lookup.icann.org** | https://lookup.icann.org | — | Официальный Whois |
| **whois.arin.net** | https://whois.arin.net | — | ARIN Whois |
| **ripe.net** | https://www.ripe.net | `https://stat.ripe.net/data/whois/data.json?resource={ip}` | RIPE Whois |
| **ipinfo.io ASN** | https://ipinfo.io | `https://ipinfo.io/{ip}/json` | ASN информация |
| **asrank.caida.org** | https://asrank.caida.org | GraphQL API | Рейтинг ASN |

## Геолокация по cell/Wi-Fi (для мобильных устройств)

| Сервис | URL | API | Описание |
|--------|-----|-----|----------|
| **BeaconDB** | https://beacondb.net | `https://api.beacondb.net/v1/geolocate` | Cell/Wi-Fi геолокация (used in RKNHardering) |
| **unwiredlabs.com** | https://unwiredlabs.com | `https://eu1.unwiredlabs.com/v2/terminals` | Cell geolocation API |
| **opencellid.org** | https://opencellid.org | `https://opencellid.org/gsm.cell/get` | Open database cell IDs |
| **mozilla.com** | https://location.services.mozilla.com | `https://www.mozilla.org/en-US/firefox/geolocation/` | Mozilla Location Service |
| **apple.com** | https://developer.apple.com | Core Location API | Apple geolocation |

## CDN / Redirector (для определения реального IP)

| Сервис | URL | Используется в |
|--------|-----|----------------|
| **Google Video** | `https://redirector.googlevideo.com/generate_204` | CdnPullingChecker |
| **Cloudflare** | `https://www.cloudflare.com/cdn-cgi/trace` | CdnPullingChecker |
| **Meduza** | `https://check.meduza.io` | CdnPullingChecker |
| **YouTube** | `https://youtube.com/generate_204` | CdnPullingChecker |
| **Netflix** | `https://netflix.com/title/80018499` | Определение region |

## DNS-серверы

| Сервис | IP | Описание |
|--------|----|----------|
| **Google Public DNS** | `8.8.8.8`, `8.8.4.4` | Публичный DNS |
| **Cloudflare** | `1.1.1.1`, `1.0.0.1` | Публичный DNS |
| **Quad9** | `9.9.9.9` | DNS с фильтрацией |
| **Yandex DNS** | `77.88.8.8`, `77.88.8.1` | RU DNS |
| **AdGuard DNS** | `94.140.14.14` | DNS с фильтрацией |
| **OpenDNS** | `208.67.222.222` | Cisco DNS |
| **Comodo DNS** | `8.26.56.26` | Безопасный DNS |

## Reputation / Threat Intelligence

| Сервис | URL | API | Описание |
|--------|-----|-----|----------|
| **VirusTotal** | https://www.virustotal.com | `https://www.virustotal.com/api/v3/ip_addresses/{ip}` | Анализ IP/доменов |
| **AbuseIPDB** | https://www.abuseipdb.com | `https://api.abuseipdb.com/api/v2/check?ipAddress={ip}` | Жалобы на IP |
| **GreyNoise** | https://viz.greynoise.io | `https://api.greynoise.io/v3/community/{ip}` | Публичные IP, вредоносные адреса |
| **Shodan** | https://www.shodan.io | `https://api.shodan.io/shodan/host/{ip}?key={key}` | IoT/хосты |
| **Censys** | https://search.censys.io | `https://search.censys.io/api/v2/hosts/{ip}` | Мониторинг устройств |
| **Criminal IP** | https://www.criminalip.io | `https://api.criminalip.io/v1/banner/{ip}` | CTI и ASM |
| **Pulsedive** | https://pulsedive.com | `https://pulsedive.io/api/v3/ip/{ip}` | Threat Intelligence |
| **URLhaus** | https://urlhaus.abuse.ch | — | Вредоносные URL |
| **PhishStats** | https://phishstats.info | — | Фишинг статистика |

## Специализированные поисковые движки

| Сервис | URL | Описание |
|--------|-----|----------|
| **Shodan** | https://www.shodan.io | Поиск IoT/устройств |
| **Censys** | https://search.censys.io | Мониторинг хостов |
| **ZoomEye** | https://www.zoomeye.ai | Киберпространственный поиск |
| **FOFA** | https://en.fofa.info | Поиск активов |
| **Netlas.io** | https://app.netlas.io | Разведка и сканирование |
| **Hunter** | https://hunter.how | Поиск публичных активов |

## TLS/SSL Certificate Transparency

| Сервис | URL | Описание |
|--------|-----|----------|
| **crt.sh** | https://crt.sh | Поиск сертификатов через CT-логи |
| **censys.io/certificates** | https://search.censys.io/certificates | SSL/TLS сертификаты |
| **certspotter.com** | https://certspotter.com | Мониторинг сертификатов |

---

*Источники: [RKNHardering](https://github.com/xtclovver/RKNHardering), [awesome-osint](https://github.com/jivoi/awesome-osint), документация сервисов.*
