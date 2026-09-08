//! The `nexis-atlas://` deep-link grammar.
//!
//! Atlas is the family's map of your repos, so the useful thing to be able to
//! say from outside is "show me *this* repo". Two verbs, one argument:
//!
//! ```text
//! nexis-atlas://focus?path=C:\Users\me\Dev\thing    select it in the list
//! nexis-atlas://map?path=/home/me/dev/thing         open its city on the map
//! ```
//!
//! Parsing lives here, in Rust, rather than in the webview, because this is the
//! one part of the flow with a test harness — and because a URL arriving from
//! another process is untrusted input that should be validated before anything
//! acts on it. The webview receives an already-checked `{action, path}`.

use serde::Serialize;
use url::Url;

/// What an incoming link asked for. `path` is whatever the sender wrote; it is
/// matched against the scanned repo list on the frontend rather than being
/// touched here, so a link can never make Atlas read a directory it would not
/// otherwise have scanned.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DeepLink {
    pub action: Action,
    pub path: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    /// Select the repo in the list view.
    Focus,
    /// Open the repo's city on the map.
    Map,
}

pub const SCHEME: &str = "nexis-atlas";

/// Parse one incoming URL. Returns `None` for anything that is not a link this
/// app understands — a wrong scheme, an unknown verb, or a missing/empty path.
pub fn parse(url: &Url) -> Option<DeepLink> {
    if !url.scheme().eq_ignore_ascii_case(SCHEME) {
        return None;
    }

    // For `nexis-atlas://focus?path=…` the verb lands in the host position.
    // Some senders (and every hand-typed link with three slashes) put it in the
    // path instead, so accept either rather than failing on a cosmetic detail.
    let verb = url
        .host_str()
        .map(str::to_owned)
        .filter(|h| !h.is_empty())
        .or_else(|| {
            let p = url.path().trim_matches('/');
            (!p.is_empty()).then(|| p.to_owned())
        })?;

    let action = match verb.to_ascii_lowercase().as_str() {
        "focus" | "open" => Action::Focus,
        "map" | "city" => Action::Map,
        _ => return None,
    };

    let path = url
        .query_pairs()
        .find(|(k, _)| k == "path")
        .map(|(_, v)| v.into_owned())?;
    let path = path.trim().to_owned();
    if path.is_empty() {
        return None;
    }

    Some(DeepLink { action, path })
}

/// Parse a batch, keeping only the links that mean something. The plugin hands
/// over a `Vec` because macOS can deliver several at once.
pub fn parse_all(urls: &[Url]) -> Vec<DeepLink> {
    urls.iter().filter_map(parse).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(s: &str) -> Option<DeepLink> {
        parse(&Url::parse(s).expect("valid url"))
    }

    #[test]
    fn parses_both_verbs() {
        assert_eq!(
            p("nexis-atlas://focus?path=/home/me/dev/thing"),
            Some(DeepLink {
                action: Action::Focus,
                path: "/home/me/dev/thing".into()
            })
        );
        assert_eq!(
            p("nexis-atlas://map?path=/home/me/dev/thing").map(|l| l.action),
            Some(Action::Map)
        );
    }

    #[test]
    fn accepts_aliases_and_odd_casing() {
        assert_eq!(
            p("nexis-atlas://open?path=/x").map(|l| l.action),
            Some(Action::Focus)
        );
        assert_eq!(
            p("nexis-atlas://city?path=/x").map(|l| l.action),
            Some(Action::Map)
        );
        assert_eq!(
            p("NEXIS-ATLAS://FOCUS?path=/x").map(|l| l.action),
            Some(Action::Focus)
        );
    }

    /// A hand-typed link often gains a third slash, which moves the verb out of
    /// the host position and into the path. Both spellings mean the same thing.
    #[test]
    fn accepts_the_verb_in_the_path_position() {
        assert_eq!(
            p("nexis-atlas:///map?path=/x").map(|l| l.action),
            Some(Action::Map)
        );
    }

    #[test]
    fn windows_paths_survive_intact() {
        assert_eq!(
            p(r"nexis-atlas://focus?path=C:\Users\me\Dev\thing").map(|l| l.path),
            Some(r"C:\Users\me\Dev\thing".to_string())
        );
        // Percent-encoded, which is what a correct sender emits for a path
        // containing spaces.
        assert_eq!(
            p("nexis-atlas://focus?path=C%3A%5CDev%5Cmy%20repo").map(|l| l.path),
            Some(r"C:\Dev\my repo".to_string())
        );
    }

    #[test]
    fn rejects_what_it_does_not_understand() {
        assert_eq!(p("nexis://open?path=/x"), None, "wrong scheme");
        assert_eq!(p("nexis-atlas://delete?path=/x"), None, "unknown verb");
        assert_eq!(p("nexis-atlas://focus"), None, "no path");
        assert_eq!(p("nexis-atlas://focus?path="), None, "empty path");
        assert_eq!(
            p("nexis-atlas://focus?path=%20%20"),
            None,
            "whitespace path"
        );
        assert_eq!(p("nexis-atlas://?path=/x"), None, "no verb");
    }

    #[test]
    fn parse_all_drops_the_bad_ones() {
        let urls: Vec<Url> = [
            "nexis-atlas://focus?path=/a",
            "https://example.com/",
            "nexis-atlas://map?path=/b",
        ]
        .iter()
        .map(|s| Url::parse(s).unwrap())
        .collect();
        let got = parse_all(&urls);
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].path, "/a");
        assert_eq!(got[1].action, Action::Map);
    }
}
