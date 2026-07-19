// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

//! Repair `tauri-plugin-window-state`'s saved geometry before it is restored.
//!
//! The plugin stores window size in **device pixels** and records nothing about
//! which monitor — or which scale factor — produced them. It validates the
//! saved *position* against the connected monitors on restore, but never the
//! *size* (see `restore_state` upstream). Two consequences, both of which bite
//! on a mixed-DPI multi-monitor session:
//!
//! 1. A size captured on a HiDPI output is restored onto a 1x output verbatim,
//!    where the same device-pixel count is physically twice as large — the
//!    window opens larger than the screen with its bottom edge, status bar
//!    included, below the desktop.
//! 2. A saved position can land on no monitor at all (observed: `(0, 0)` on a
//!    layout whose outputs start at `x=3840` and `y=410`), leaving the
//!    compositor to place the window wherever it likes.
//!
//! Fixing this *after* the window exists does not work: the window's scale
//! factor is stale and unstable during the corrective resize, so the size you
//! set is converted by the wrong factor. Instead this runs before any window is
//! created and rewrites the state file, letting the plugin restore values that
//! were already sane. No GTK geometry, no scale conversion, no races.
//!
//! Everything here is in device pixels — `Monitor::size`/`work_area` and the
//! plugin's stored size are the same space, which is what makes the comparison
//! valid.

use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

/// The plugin's default filename. Kept in sync with `StateFlags`-era defaults;
/// if the plugin is ever configured with a custom filename this must follow.
const STATE_FILE: &str = ".window-state.json";

/// A rectangle in device pixels — a monitor work area or a saved window.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

impl Rect {
    fn area(self) -> u64 {
        u64::from(self.w) * u64::from(self.h)
    }

    fn contains(self, x: i32, y: i32) -> bool {
        x >= self.x
            && y >= self.y
            && x < self.x.saturating_add_unsigned(self.w)
            && y < self.y.saturating_add_unsigned(self.h)
    }

    fn overlap(self, o: Rect) -> u64 {
        let x1 = self.x.max(o.x);
        let y1 = self.y.max(o.y);
        let x2 = self
            .x
            .saturating_add_unsigned(self.w)
            .min(o.x.saturating_add_unsigned(o.w));
        let y2 = self
            .y
            .saturating_add_unsigned(self.h)
            .min(o.y.saturating_add_unsigned(o.h));
        if x2 <= x1 || y2 <= y1 {
            return 0;
        }
        u64::from((x2 - x1) as u32) * u64::from((y2 - y1) as u32)
    }
}

/// Choose the monitor a saved window belongs to, then shrink and shift it to
/// fit that monitor's work area.
///
/// Target selection, in precedence order: the monitor containing the window's
/// top-left corner, else the monitor it overlaps most, else the largest one
/// (the fully-off-screen case, where the window is also moved onto it). Picking
/// by overlap rather than always taking the largest monitor matters — a big
/// window legitimately sized for a 4K display must not be shrunk to a 1080p
/// one just because it is briefly ambiguous which screen it is on.
///
/// Returns `None` when nothing needs to change, so a healthy state file is
/// never rewritten.
#[must_use]
pub fn sanitize(saved: Rect, monitors: &[Rect]) -> Option<Rect> {
    let target = monitors
        .iter()
        .find(|m| m.contains(saved.x, saved.y))
        .or_else(|| {
            monitors
                .iter()
                .filter(|m| m.overlap(saved) > 0)
                .max_by_key(|m| m.overlap(saved))
        })
        .or_else(|| monitors.iter().max_by_key(|m| m.area()))?;

    // Fully off-screen: re-home the window onto the chosen monitor rather than
    // clamping from a meaningless coordinate.
    let off_screen = monitors.iter().all(|m| m.overlap(saved) == 0);
    let (base_x, base_y) = if off_screen {
        (target.x, target.y)
    } else {
        (saved.x, saved.y)
    };

    let w = saved.w.min(target.w);
    let h = saved.h.min(target.h);
    // `w <= target.w` by construction, so these bounds are always ordered.
    let x = base_x.clamp(target.x, target.x.saturating_add_unsigned(target.w - w));
    let y = base_y.clamp(target.y, target.y.saturating_add_unsigned(target.h - h));

    let fixed = Rect { x, y, w, h };
    (fixed != saved).then_some(fixed)
}

fn state_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(STATE_FILE))
}

/// Read the state file, sanitize every window entry against the connected
/// monitors, and write it back if anything changed.
///
/// Every failure path is a silent no-op: a missing, unreadable, or malformed
/// state file just means the plugin falls back to the configured defaults,
/// which is the correct outcome and not worth surfacing to the user.
pub fn sanitize_saved_state<R: Runtime>(app: &AppHandle<R>) {
    let Some(path) = state_path(app) else { return };
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return;
    };
    let Ok(mut root) = serde_json::from_str::<Value>(&raw) else {
        return;
    };
    let Ok(monitors) = app.available_monitors() else {
        return;
    };
    let monitors: Vec<Rect> = monitors
        .iter()
        .map(|m| {
            let a = m.work_area();
            Rect {
                x: a.position.x,
                y: a.position.y,
                w: a.size.width,
                h: a.size.height,
            }
        })
        .collect();
    if monitors.is_empty() {
        return;
    }

    let Some(windows) = root.as_object_mut() else {
        return;
    };
    let mut changed = false;
    for (label, entry) in windows.iter_mut() {
        let Some(obj) = entry.as_object_mut() else {
            continue;
        };
        // A maximized or fullscreen window is legitimately screen-sized and the
        // plugin restores those flags separately — leave its geometry alone.
        let flagged = |k: &str| obj.get(k).and_then(Value::as_bool).unwrap_or(false);
        if flagged("maximized") || flagged("fullscreen") {
            continue;
        }
        let num = |k: &str| obj.get(k).and_then(Value::as_i64);
        let (Some(w), Some(h), Some(x), Some(y)) =
            (num("width"), num("height"), num("x"), num("y"))
        else {
            continue;
        };
        let (Ok(w), Ok(h)) = (u32::try_from(w), u32::try_from(h)) else {
            continue;
        };
        let (Ok(x), Ok(y)) = (i32::try_from(x), i32::try_from(y)) else {
            continue;
        };

        let saved = Rect { x, y, w, h };
        let Some(fixed) = sanitize(saved, &monitors) else {
            continue;
        };
        eprintln!(
            "[nexis] window '{label}' saved as {}x{} @ ({},{}) does not fit the \
             current displays — restoring as {}x{} @ ({},{})",
            saved.w, saved.h, saved.x, saved.y, fixed.w, fixed.h, fixed.x, fixed.y
        );
        obj.insert("width".into(), fixed.w.into());
        obj.insert("height".into(), fixed.h.into());
        obj.insert("x".into(), fixed.x.into());
        obj.insert("y".into(), fixed.y.into());
        changed = true;
    }

    if changed {
        if let Ok(out) = serde_json::to_string_pretty(&root) {
            let _ = std::fs::write(&path, out);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The reporter's actual layout, as GDK reports it (device pixels):
    /// a 4K panel at scale 2 beside a 1080p panel at scale 1.
    const BIG: Rect = Rect {
        x: 3840,
        y: 0,
        w: 5296,
        h: 2980,
    };
    const SMALL: Rect = Rect {
        x: 0,
        y: 410,
        w: 1920,
        h: 1080,
    };

    fn layout() -> Vec<Rect> {
        vec![BIG, SMALL]
    }

    #[test]
    fn repairs_the_reported_state() {
        // Saved 3714x1814 @ (0,0): larger than the small monitor in both axes,
        // and its origin sits on no monitor at all.
        let got = sanitize(
            Rect {
                x: 0,
                y: 0,
                w: 3714,
                h: 1814,
            },
            &layout(),
        )
        .expect("oversized state must be repaired");
        assert!(got.w <= SMALL.w && got.h <= SMALL.h, "must fit its monitor");
        assert!(SMALL.contains(got.x, got.y), "must land on a real monitor");
        // And the whole window, not just its corner, is on-screen.
        assert!(got.x + got.w as i32 <= SMALL.x + SMALL.w as i32);
        assert!(got.y + got.h as i32 <= SMALL.y + SMALL.h as i32);
    }

    #[test]
    fn leaves_a_window_that_already_fits_alone() {
        let ok = Rect {
            x: 4000,
            y: 100,
            w: 2400,
            h: 1400,
        };
        assert_eq!(sanitize(ok, &layout()), None);
    }

    #[test]
    fn does_not_shrink_a_large_window_to_the_small_monitor() {
        // Regression guard: a window legitimately sized for the 4K panel must
        // keep its size, even though a smaller monitor exists in the layout.
        let big_window = Rect {
            x: 3900,
            y: 50,
            w: 5000,
            h: 2800,
        };
        assert_eq!(sanitize(big_window, &layout()), None);
    }

    #[test]
    fn rehomes_a_fully_offscreen_window() {
        let ghost = Rect {
            x: -9000,
            y: -9000,
            w: 800,
            h: 600,
        };
        let got = sanitize(ghost, &layout()).expect("off-screen state must move");
        // Largest monitor wins when nothing overlaps.
        assert_eq!(
            got,
            Rect {
                x: BIG.x,
                y: BIG.y,
                w: 800,
                h: 600
            }
        );
    }

    #[test]
    fn clamps_a_window_hanging_off_the_right_edge() {
        let hanging = Rect {
            x: 1500,
            y: 500,
            w: 900,
            h: 400,
        };
        let got = sanitize(hanging, &layout()).expect("must be pulled back");
        assert_eq!(got.w, 900, "size fits, only the position was wrong");
        assert_eq!(got.x, SMALL.x + SMALL.w as i32 - 900);
    }

    #[test]
    fn no_monitors_is_a_no_op() {
        assert_eq!(
            sanitize(
                Rect {
                    x: 0,
                    y: 0,
                    w: 9999,
                    h: 9999
                },
                &[]
            ),
            None
        );
    }

    #[test]
    fn single_monitor_session_still_clamps() {
        let got = sanitize(
            Rect {
                x: 0,
                y: 0,
                w: 4000,
                h: 3000,
            },
            &[SMALL],
        )
        .expect("must clamp to the only monitor");
        assert_eq!(
            got,
            Rect {
                x: SMALL.x,
                y: SMALL.y,
                w: SMALL.w,
                h: SMALL.h
            }
        );
    }
}
