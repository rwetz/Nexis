# ╔══════════════════════════════════════╗
# ║  Ryan Wetzstein                      ║
# ║  Nexis                               ║
# ║  2026                                ║
# ╚══════════════════════════════════════╝

# nexis-shell-integration (zprofile)
#
# See zshenv.zsh for the rationale on the trailing `:`.
{
  _nexis_user_zdotdir="${NEXIS_USER_ZDOTDIR:-$HOME}"
  [ -f "$_nexis_user_zdotdir/.zprofile" ] && source "$_nexis_user_zdotdir/.zprofile"
  unset _nexis_user_zdotdir
}
:
