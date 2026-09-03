// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Panic-lint gate (IDEAS A1): this is the AI's HTTP egress / SSRF guard — a
// reachable production panic here is a denial-of-service vector. Forbid
// `.unwrap()`/`.expect()` in non-test code; CI's `clippy -D warnings` enforces it.
#![warn(clippy::unwrap_used, clippy::expect_used)]

use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

use bytes::Bytes;
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

const HEADER_BLOCKLIST: &[&str] = &[
    "host",
    "content-length",
    "connection",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "transfer-encoding",
    "upgrade",
    "trailer",
    "expect",
];

fn is_blocked_host_name(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    matches!(
        host.as_str(),
        "metadata.google.internal" | "metadata" | "metadata.azure.com"
    )
}

fn ip_kind(ip: IpAddr) -> IpKind {
    match ip {
        IpAddr::V4(v) => {
            let o = v.octets();
            // Cloud metadata IPv4: 169.254.169.254
            if v.is_link_local() {
                return IpKind::BlockedMetadata;
            }
            if v.is_loopback() || v.is_unspecified() || v.is_broadcast() || v.is_multicast() {
                return IpKind::Loopback;
            }
            // RFC1918 + CGNAT + benchmarking + IETF
            if o[0] == 10
                || (o[0] == 172 && (16..=31).contains(&o[1]))
                || (o[0] == 192 && o[1] == 168)
                || (o[0] == 100 && (64..=127).contains(&o[1]))
                || (o[0] == 198 && (o[1] == 18 || o[1] == 19))
            {
                return IpKind::Private;
            }
            IpKind::Public
        }
        IpAddr::V6(v) => {
            if v.is_loopback() || v.is_unspecified() || v.is_multicast() {
                return IpKind::Loopback;
            }
            // Cloud metadata IPv6 (AWS): fd00:ec2::254
            let segs = v.segments();
            if segs[0] == 0xfd00 && segs[1] == 0xec2 {
                return IpKind::BlockedMetadata;
            }
            // fe80::/10 link-local
            if segs[0] & 0xffc0 == 0xfe80 {
                return IpKind::BlockedMetadata;
            }
            // fc00::/7 unique-local (private)
            if segs[0] & 0xfe00 == 0xfc00 {
                return IpKind::Private;
            }
            IpKind::Public
        }
    }
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
enum IpKind {
    Public,
    Private,
    Loopback,
    BlockedMetadata,
}

/// Resolve `host` once and return both its safety classification and the
/// concrete IPs we resolved. Callers can pin reqwest to these IPs to defeat
/// DNS rebinding (where a second lookup returns a different address).
async fn resolve_and_classify(host: &str) -> Result<(IpKind, Vec<IpAddr>), String> {
    // Direct literal? Skip DNS.
    if let Ok(ip) = host.parse::<IpAddr>() {
        return Ok((ip_kind(ip), vec![ip]));
    }
    let host_owned = host.to_string();
    let lookup = tokio::task::spawn_blocking(move || {
        (host_owned.as_str(), 0u16)
            .to_socket_addrs()
            .map(|it| it.map(|a| a.ip()).collect::<Vec<_>>())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("dns: {e}"))?;
    if lookup.is_empty() {
        return Err("dns: no addresses".into());
    }
    let mut worst = IpKind::Public;
    for ip in &lookup {
        let k = ip_kind(*ip);
        worst = match (worst, k) {
            (_, IpKind::BlockedMetadata) => IpKind::BlockedMetadata,
            (IpKind::BlockedMetadata, _) => IpKind::BlockedMetadata,
            (IpKind::Public, x) => x,
            (x, IpKind::Public) => x,
            (a, _) => a,
        };
    }
    Ok((worst, lookup))
}

use std::net::ToSocketAddrs;

fn validate_url(url: &str, allow_private: bool) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("invalid url: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => {}
        s => return Err(format!("scheme not allowed: {s}")),
    }
    if parsed.username() != "" || parsed.password().is_some() {
        return Err("userinfo in url is not allowed".into());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "missing host".to_string())?;
    if is_blocked_host_name(host) {
        return Err(format!("host not allowed: {host}"));
    }
    // The actual IP classification has to be async — caller does it.
    let _ = allow_private;
    Ok(parsed)
}

/// Classify the host AND return safe IPs to pin reqwest's resolver to.
/// Defeats DNS rebinding (second-lookup-returns-different-IP) by reusing
/// exactly the addresses that passed `ip_kind`.
async fn classify_and_collect_safe_ips(
    host: &str,
    allow_private: bool,
) -> Result<Vec<IpAddr>, String> {
    let (worst, ips) = resolve_and_classify(host).await?;
    match worst {
        IpKind::BlockedMetadata => return Err(format!("host not allowed: {host}")),
        IpKind::Loopback | IpKind::Private if !allow_private => {
            return Err(format!(
                "host {host} resolves to a private/loopback address; this endpoint requires explicit opt-in",
            ));
        }
        _ => {}
    }
    let safe: Vec<IpAddr> = ips
        .into_iter()
        .filter(|ip| match ip_kind(*ip) {
            IpKind::BlockedMetadata => false,
            IpKind::Loopback | IpKind::Private => allow_private,
            IpKind::Public => true,
        })
        .collect();
    if safe.is_empty() {
        return Err(format!("host {host}: no safe IPs"));
    }
    Ok(safe)
}

fn sanitize_headers(headers: Option<HashMap<String, String>>) -> Result<HeaderMap, String> {
    let mut map = HeaderMap::new();
    let Some(h) = headers else { return Ok(map) };
    for (k, v) in h {
        let lower = k.to_ascii_lowercase();
        if HEADER_BLOCKLIST.contains(&lower.as_str()) {
            return Err(format!("header not allowed: {k}"));
        }
        // CRLF injection: header value must not contain CR / LF / NUL.
        if v.as_bytes().iter().any(|b| matches!(b, 0 | b'\r' | b'\n')) {
            return Err(format!("header value contains control bytes: {k}"));
        }
        let name = HeaderName::from_bytes(k.as_bytes()).map_err(|e| e.to_string())?;
        let value = HeaderValue::from_str(&v).map_err(|e| e.to_string())?;
        map.insert(name, value);
    }
    Ok(map)
}

#[tauri::command]
pub async fn lm_ping(base_url: String) -> Result<u16, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("empty base url".into());
    }
    let probe = format!("{trimmed}/models");
    let parsed = validate_url(&probe, true)?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "missing host".to_string())?
        .to_string();
    let safe_ips = classify_and_collect_safe_ips(&host, true).await?;

    let mut builder = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none());
    let addrs: Vec<SocketAddr> = safe_ips.iter().map(|ip| SocketAddr::new(*ip, 0)).collect();
    builder = builder.resolve_to_addrs(&host, &addrs);
    let client = builder.build().map_err(|e| e.to_string())?;
    client
        .get(parsed)
        .send()
        .await
        .map(|r| r.status().as_u16())
        .map_err(|e| e.to_string())
}
// AI HTTP proxy — bypasses webview CORS / Mixed-Content / PNA so local-network
// model servers (LM Studio, Ollama, vLLM) work in the production bundle.

#[derive(Debug, Serialize)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

fn build_request(
    client: &reqwest::Client,
    method: &str,
    url: reqwest::Url,
    headers: Option<HashMap<String, String>>,
    body: Option<Vec<u8>>,
) -> Result<reqwest::RequestBuilder, String> {
    let method = Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
    let mut req = client.request(method, url);
    let map = sanitize_headers(headers)?;
    req = req.headers(map);
    if let Some(b) = body {
        req = req.body(b);
    }
    Ok(req)
}

fn build_safe_client(
    allow_private: bool,
    pinned: &[(String, Vec<IpAddr>)],
) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder().connect_timeout(Duration::from_secs(10));
    // Pin reqwest's resolver to the IPs we just classified. Without this,
    // reqwest's own DNS lookup could return a different (private/metadata) IP
    // for the same hostname between classify and connect — classic DNS
    // rebinding attack. We pin port 0 because reqwest fills in the actual
    // port from the URL when wiring up the override map.
    for (host, ips) in pinned {
        let addrs: Vec<SocketAddr> = ips.iter().map(|ip| SocketAddr::new(*ip, 0)).collect();
        if !addrs.is_empty() {
            builder = builder.resolve_to_addrs(host, &addrs);
        }
    }
    builder
        .redirect(reqwest::redirect::Policy::custom(move |attempt| {
            if attempt.previous().len() > 10 {
                return attempt.error("too many redirects");
            }
            let next = attempt.url();
            match next.scheme() {
                "http" | "https" => {}
                _ => return attempt.stop(),
            }
            if next.username() != "" || next.password().is_some() {
                return attempt.stop();
            }
            let Some(host) = next.host_str() else {
                return attempt.stop();
            };
            if is_blocked_host_name(host) {
                return attempt.stop();
            }
            if let Ok(ip) = host.parse::<IpAddr>() {
                let k = ip_kind(ip);
                if k == IpKind::BlockedMetadata {
                    return attempt.stop();
                }
                if !allow_private && matches!(k, IpKind::Loopback | IpKind::Private) {
                    return attempt.stop();
                }
            } else if !allow_private {
                if let Some(prev) = attempt.previous().last() {
                    if prev.host_str() != Some(host) {
                        return attempt.stop();
                    }
                }
            }
            attempt.follow()
        }))
        .build()
        .map_err(|e| e.to_string())
}

fn header_map_to_strings(headers: &HeaderMap) -> HashMap<String, String> {
    let mut out = HashMap::with_capacity(headers.len());
    for (k, v) in headers {
        if let Ok(s) = v.to_str() {
            out.insert(k.as_str().to_ascii_lowercase(), s.to_string());
        }
    }
    out
}

#[tauri::command]
pub async fn ai_http_request(
    url: String,
    method: String,
    headers: Option<HashMap<String, String>>,
    body: Option<Vec<u8>>,
    allow_private_network: Option<bool>,
) -> Result<HttpResponse, String> {
    let allow_private = allow_private_network.unwrap_or(false);
    let parsed = validate_url(&url, allow_private)?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "missing host".to_string())?
        .to_string();
    let safe_ips = classify_and_collect_safe_ips(&host, allow_private).await?;

    let client = build_safe_client(allow_private, &[(host, safe_ips)])?;

    let req = build_request(&client, &method, parsed, headers, body)?;
    let resp = req.send().await.map_err(|e| e.to_string())?;

    let status = resp.status().as_u16();
    let headers = header_map_to_strings(resp.headers());
    let body = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();
    Ok(HttpResponse {
        status,
        headers,
        body,
    })
}

/// A user-driven HTTP response: `HttpResponse` plus what a REST client shows
/// next to it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientHttpResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
    /// Wall-clock time for the whole exchange, which is the number a REST
    /// client is actually asked for.
    pub elapsed_ms: u64,
    /// Final URL after redirects, so a surprising response can be traced to a
    /// redirect rather than to the request that was typed.
    pub final_url: String,
}

/// The Web Dev pack's REST client.
///
/// Deliberately a separate command from `ai_http_request` even though the two
/// share every validation helper below. They have different threat models and
/// must be able to diverge without dragging each other along: `ai_http_*` is
/// the *agent's* egress, where the URL can originate in model output or in a
/// tool result, and `allow_private_network` defaults off for exactly that
/// reason. This one is driven by a URL a human typed into a request bar, and
/// reaching `localhost:3000` is the entire point of it -- so private and
/// loopback destinations are allowed by default here.
///
/// What does **not** relax: `IpKind::BlockedMetadata` is refused regardless of
/// `allow_private`, so 169.254.169.254, `fd00:ec2::254`, IPv6 link-local and
/// the metadata hostnames stay unreachable from both paths. Nor does the
/// header blocklist, the userinfo rejection, the scheme allow-list, or the
/// DNS pinning that defeats rebinding between classification and connect.
#[tauri::command]
pub async fn http_send(
    url: String,
    method: String,
    headers: Option<HashMap<String, String>>,
    body: Option<Vec<u8>>,
    timeout_ms: Option<u64>,
) -> Result<ClientHttpResponse, String> {
    // A REST client that cannot reach a dev server is not a REST client.
    let allow_private = true;
    let parsed = validate_url(&url, allow_private)?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "missing host".to_string())?
        .to_string();
    let safe_ips = classify_and_collect_safe_ips(&host, allow_private).await?;

    let client = build_safe_client(allow_private, &[(host, safe_ips)])?;
    let req = build_request(&client, &method, parsed, headers, body)?;

    // Bounded so a hung endpoint cannot leave the panel waiting forever;
    // clamped so a hand-edited value cannot disable the bound entirely.
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(30_000).clamp(1_000, 120_000));

    let started = std::time::Instant::now();
    let resp = tokio::time::timeout(timeout, req.send())
        .await
        .map_err(|_| format!("timed out after {} ms", timeout.as_millis()))?
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    let status_text = status.canonical_reason().unwrap_or("").to_string();
    let final_url = resp.url().to_string();
    let headers = header_map_to_strings(resp.headers());
    let body = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();
    let elapsed_ms = started.elapsed().as_millis() as u64;

    Ok(ClientHttpResponse {
        status: status.as_u16(),
        status_text,
        headers,
        body,
        elapsed_ms,
        final_url,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AiStreamEvent {
    Headers {
        status: u16,
        headers: HashMap<String, String>,
    },
    Chunk {
        bytes: Vec<u8>,
    },
    End,
    Error {
        message: String,
    },
}

#[tauri::command]
pub async fn ai_http_stream(
    url: String,
    method: String,
    headers: Option<HashMap<String, String>>,
    body: Option<Vec<u8>>,
    allow_private_network: Option<bool>,
    on_event: Channel<AiStreamEvent>,
) -> Result<(), String> {
    let allow_private = allow_private_network.unwrap_or(false);
    let parsed = match validate_url(&url, allow_private) {
        Ok(p) => p,
        Err(e) => {
            let _ = on_event.send(AiStreamEvent::Error { message: e.clone() });
            return Err(e);
        }
    };
    let host = match parsed.host_str() {
        Some(h) => h.to_string(),
        None => {
            let e = "missing host".to_string();
            let _ = on_event.send(AiStreamEvent::Error { message: e.clone() });
            return Err(e);
        }
    };
    let safe_ips = match classify_and_collect_safe_ips(&host, allow_private).await {
        Ok(v) => v,
        Err(e) => {
            let _ = on_event.send(AiStreamEvent::Error { message: e.clone() });
            return Err(e);
        }
    };

    let client = build_safe_client(allow_private, &[(host, safe_ips)])?;

    let req = build_request(&client, &method, parsed, headers, body)?;
    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            let _ = on_event.send(AiStreamEvent::Error {
                message: e.to_string(),
            });
            return Err(e.to_string());
        }
    };

    let status = resp.status().as_u16();
    let headers = header_map_to_strings(resp.headers());
    let _ = on_event.send(AiStreamEvent::Headers { status, headers });

    let mut stream = resp.bytes_stream();
    while let Some(item) = stream.next().await {
        match item {
            Ok(chunk) => {
                let bytes: Bytes = chunk;
                if on_event
                    .send(AiStreamEvent::Chunk {
                        bytes: bytes.to_vec(),
                    })
                    .is_err()
                {
                    // Channel dropped (frontend aborted) — stop streaming.
                    return Ok(());
                }
            }
            Err(e) => {
                let _ = on_event.send(AiStreamEvent::Error {
                    message: e.to_string(),
                });
                return Err(e.to_string());
            }
        }
    }

    let _ = on_event.send(AiStreamEvent::End);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    #[test]
    fn metadata_ips_classified_as_blocked() {
        // AWS / Google / Azure all share the IPv4 169.254.169.254 link-local.
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(169, 254, 169, 254))),
            IpKind::BlockedMetadata
        );
        // AWS IPv6 metadata
        assert_eq!(
            ip_kind("fd00:ec2::254".parse().unwrap()),
            IpKind::BlockedMetadata
        );
        // Any link-local IPv4 (169.254/16) — same network range, still blocked.
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(169, 254, 1, 1))),
            IpKind::BlockedMetadata
        );
        // IPv6 link-local fe80::/10
        assert_eq!(ip_kind("fe80::1".parse().unwrap()), IpKind::BlockedMetadata);
    }

    #[test]
    fn private_ips_classified_correctly() {
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1))),
            IpKind::Private
        );
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(172, 16, 0, 1))),
            IpKind::Private
        );
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 1))),
            IpKind::Private
        );
        // CGNAT 100.64/10
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(100, 64, 0, 1))),
            IpKind::Private
        );
    }

    #[test]
    fn loopback_classified_as_loopback() {
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1))),
            IpKind::Loopback
        );
        assert_eq!(ip_kind("::1".parse().unwrap()), IpKind::Loopback);
    }

    #[test]
    fn public_ips_classified_as_public() {
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8))),
            IpKind::Public
        );
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1))),
            IpKind::Public
        );
    }

    fn is_cgnat(o: [u8; 4]) -> bool {
        o[0] == 100 && (64..=127).contains(&o[1])
    }

    fn is_benchmarking(o: [u8; 4]) -> bool {
        o[0] == 198 && (o[1] == 18 || o[1] == 19)
    }

    /// SSRF safety invariant: an IPv4 in any reserved / internal range must
    /// NEVER be classified `Public` (fetchable). The dangerous direction is an
    /// internal address slipping through as Public; the reverse is only a
    /// false positive. Cross-checked against std's own range predicates so this
    /// is an independent oracle, not a restatement of `ip_kind`'s bit math.
    #[test]
    fn ip_kind_never_marks_reserved_ipv4_as_public() {
        // Deterministic xorshift sweep over the 32-bit address space.
        let mut state: u64 = 0xDEAD_BEEF_CAFE_F00D;
        for _ in 0..1_000_000 {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            let ip = Ipv4Addr::from(state as u32);
            let o = ip.octets();
            let reserved = ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_broadcast()
                || ip.is_multicast()
                || ip.is_unspecified()
                || is_cgnat(o)
                || is_benchmarking(o);
            if reserved {
                assert_ne!(
                    ip_kind(IpAddr::V4(ip)),
                    IpKind::Public,
                    "reserved IPv4 {ip} was classified Public — SSRF hole"
                );
            }
        }
    }

    /// Off-by-one guard on the range boundaries: the address just outside a
    /// private block must be Public, and the edges of the block must be Private.
    #[test]
    fn ip_kind_private_range_boundaries() {
        let v4 = |a, b, c, d| ip_kind(IpAddr::V4(Ipv4Addr::new(a, b, c, d)));
        // 172.16.0.0 – 172.31.255.255 (RFC1918 /12).
        assert_eq!(v4(172, 15, 255, 255), IpKind::Public);
        assert_eq!(v4(172, 16, 0, 0), IpKind::Private);
        assert_eq!(v4(172, 31, 255, 255), IpKind::Private);
        assert_eq!(v4(172, 32, 0, 0), IpKind::Public);
        // 100.64.0.0 – 100.127.255.255 (CGNAT /10).
        assert_eq!(v4(100, 63, 255, 255), IpKind::Public);
        assert_eq!(v4(100, 64, 0, 0), IpKind::Private);
        assert_eq!(v4(100, 127, 255, 255), IpKind::Private);
        assert_eq!(v4(100, 128, 0, 0), IpKind::Public);
    }

    #[test]
    fn validate_url_blocks_userinfo_and_metadata_hostnames() {
        // URLs with userinfo can confuse browsers / leak creds in redirects.
        assert!(validate_url("http://user:pass@example.com/", true).is_err());
        // Cloud metadata-by-name.
        assert!(validate_url("http://metadata.google.internal/", true).is_err());
        assert!(validate_url("http://metadata/", true).is_err());
        assert!(validate_url("http://metadata.azure.com/", true).is_err());
    }

    /// Build a runtime by hand: tokio here is `default-features = false`
    /// with only "rt", so the `#[tokio::test]` macro is not available.
    fn block_on<F: std::future::Future>(f: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(f)
    }

    #[test]
    fn allow_private_never_unblocks_cloud_metadata() {
        // `http_send` (the Web Dev REST client) passes allow_private = true so
        // it can reach a dev server on localhost. That flag must relax private
        // and loopback ONLY -- if it ever also unblocked metadata, the REST
        // client would become a one-click SSRF against 169.254.169.254 on any
        // cloud host, and the AI egress path shares this very function.
        for host in ["169.254.169.254", "fd00:ec2::254", "fe80::1"] {
            let got = block_on(classify_and_collect_safe_ips(host, true));
            assert!(
                got.is_err(),
                "metadata address {host} must stay blocked even with allow_private",
            );
        }
    }

    #[test]
    fn allow_private_is_what_permits_a_dev_server() {
        // The other half of the contract: with the flag off, loopback is
        // refused (the AI path); with it on, it resolves (the REST client).
        assert!(block_on(classify_and_collect_safe_ips("127.0.0.1", false)).is_err());
        assert!(block_on(classify_and_collect_safe_ips("127.0.0.1", true)).is_ok());
    }

    #[test]
    fn validate_url_rejects_non_http_schemes() {
        assert!(validate_url("ftp://example.com/", true).is_err());
        assert!(validate_url("file:///etc/passwd", true).is_err());
        assert!(validate_url("javascript:alert(1)", true).is_err());
    }

    #[test]
    fn sanitize_headers_blocks_crlf_injection() {
        let mut h = HashMap::new();
        h.insert("X-Foo".to_string(), "bar\r\nX-Evil: yes".to_string());
        assert!(sanitize_headers(Some(h)).is_err());
    }

    #[test]
    fn sanitize_headers_blocks_hop_by_hop_headers() {
        for hop in [
            "host",
            "content-length",
            "connection",
            "proxy-authorization",
        ] {
            let mut h = HashMap::new();
            h.insert(hop.to_string(), "value".to_string());
            assert!(
                sanitize_headers(Some(h)).is_err(),
                "expected {hop} to be rejected"
            );
        }
    }

    struct R(u64);
    impl R {
        fn next_u64(&mut self) -> u64 {
            let mut x = self.0;
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            self.0 = x;
            x
        }
    }

    /// `validate_url` is the front door of the AI's HTTP egress. Over random
    /// URL-ish input it must never panic, and any URL it ACCEPTS must satisfy
    /// every security precondition: an http(s) scheme, no embedded userinfo,
    /// and a non-blocked host name. (IP-level checks happen later, async.)
    #[test]
    fn fuzz_validate_url_only_accepts_safe_urls() {
        const PIECES: &[&str] = &[
            "http://",
            "https://",
            "ftp://",
            "file://",
            "javascript:",
            "data:",
            "gopher://",
            "//",
            "user",
            ":pass",
            "@",
            "host.com",
            "127.0.0.1",
            "metadata",
            "metadata.google.internal",
            "[::1]",
            ":8080",
            "/p",
            "?q=1",
            "#f",
            " ",
            "..",
            "%2e",
            "evil",
            "",
            "\n",
            "\t",
        ];
        let mut rng = R(0x00C0_FFEE_1234_5678);
        for _ in 0..50_000 {
            let n = (rng.next_u64() as usize) % 7;
            let mut url = String::new();
            for _ in 0..n {
                url.push_str(PIECES[(rng.next_u64() as usize) % PIECES.len()]);
            }
            for allow_private in [false, true] {
                if let Ok(parsed) = validate_url(&url, allow_private) {
                    let scheme = parsed.scheme();
                    assert!(
                        scheme == "http" || scheme == "https",
                        "accepted bad scheme {scheme} for {url:?}"
                    );
                    assert_eq!(parsed.username(), "", "accepted userinfo for {url:?}");
                    assert!(parsed.password().is_none(), "accepted password for {url:?}");
                    assert!(
                        !is_blocked_host_name(parsed.host_str().unwrap_or("")),
                        "accepted blocked host for {url:?}"
                    );
                }
            }
        }
    }

    /// `sanitize_headers` must never let a blocklisted header or a value
    /// carrying CR/LF/NUL (the header-injection vector) through. Fuzz the
    /// guarantee: anything accepted is free of both.
    #[test]
    fn fuzz_sanitize_headers_rejects_injection_and_blocklist() {
        const KEYS: &[&str] = &[
            "x-custom",
            "authorization",
            "host",
            "content-length",
            "connection",
            "te",
            "X-Test",
            "accept",
            "user-agent",
            "transfer-encoding",
        ];
        const VALS: &[&str] = &[
            "value",
            "ok",
            "line1\r\nline2",
            "nul\0byte",
            "tab\tok",
            "",
            "Bearer x",
            "trailing\n",
            "\rlead",
            "normal-value",
        ];
        let mut rng = R(0x0BAD_C0DE_9999_0001);
        for _ in 0..30_000 {
            let n = (rng.next_u64() as usize) % 5;
            let mut h = HashMap::new();
            for _ in 0..n {
                let k = KEYS[(rng.next_u64() as usize) % KEYS.len()].to_string();
                let v = VALS[(rng.next_u64() as usize) % VALS.len()].to_string();
                h.insert(k, v);
            }
            let has_offender = h.iter().any(|(k, v)| {
                HEADER_BLOCKLIST.contains(&k.to_ascii_lowercase().as_str())
                    || v.as_bytes().iter().any(|b| matches!(b, 0 | b'\r' | b'\n'))
            });
            if let Ok(map) = sanitize_headers(Some(h)) {
                assert!(!has_offender, "accepted a blocklisted or injection header");
                for val in map.values() {
                    assert!(
                        !val.as_bytes()
                            .iter()
                            .any(|b| matches!(b, 0 | b'\r' | b'\n')),
                        "accepted a header value with control bytes"
                    );
                }
            }
        }
    }
}
