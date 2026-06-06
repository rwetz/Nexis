#!/usr/bin/env bash

# ╔══════════════════════════════════════╗
# ║  Ryan Wetzstein                      ║
# ║  Nexis                               ║
# ║  2026                                ║
# ╚══════════════════════════════════════╝

# Test Bash script — Nexis editor playground
# Exercises: arrays, associative arrays, functions, traps, process substitution,
#            here-strings, parameter expansion, getopts, regex, coprocs

set -euo pipefail
IFS=$'\n\t'

# ── Constants ─────────────────────────────────────────────────────────────────

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_NAME="${0##*/}"
readonly VERSION="1.3.0"
readonly LOG_FILE="${TMPDIR:-/tmp}/nexis-test-$$.log"

# ANSI colours
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ── Logging ───────────────────────────────────────────────────────────────────

log() {
    local level="$1"; shift
    local ts; ts="$(date '+%Y-%m-%d %H:%M:%S')"
    local colour
    case "$level" in
        INFO)  colour="$GREEN" ;;
        WARN)  colour="$YELLOW" ;;
        ERROR) colour="$RED" ;;
        *)     colour="$RESET" ;;
    esac
    printf '%b[%s]%b [%s] %s\n' "$colour" "$level" "$RESET" "$ts" "$*" | tee -a "$LOG_FILE"
}

die() { log ERROR "$*"; exit 1; }

# ── Cleanup / traps ───────────────────────────────────────────────────────────

cleanup() {
    local exit_code=$?
    log INFO "Cleaning up (exit=$exit_code)"
    rm -f "$LOG_FILE"
    exit "$exit_code"
}

trap cleanup EXIT
trap 'die "Caught SIGINT"'  INT
trap 'die "Caught SIGTERM"' TERM
trap 'log WARN "ERR on line $LINENO: $BASH_COMMAND"' ERR

# ── Parameter expansion examples ──────────────────────────────────────────────

demo_parameter_expansion() {
    local path="/usr/local/share/nexis/config.toml"

    echo "Full path:       $path"
    echo "Directory:       ${path%/*}"             # strip last /component
    echo "Filename:        ${path##*/}"            # strip up to last /
    echo "Extension:       ${path##*.}"            # strip up to last .
    echo "No extension:    ${path%.*}"             # strip .toml
    echo "Uppercase:       ${path^^}"
    echo "Lowercase:       ${PATH,,}"

    local unset_var
    echo "Default value:   ${unset_var:-'default'}"
    echo "Assign default:  ${unset_var:=assigned}"
    echo "After assign:    $unset_var"

    local ver="1.3.0-beta.2"
    echo "Substitution:    ${ver/-beta/}" # 1.3.0.2

    # Substring
    echo "Substr(2,5):     ${path:2:5}"
    echo "Trim prefix:     ${path#/usr/}"
    echo "Trim suffix:     ${path%.toml}"

    # Indirect variable reference
    local var_name="PATH"
    echo "Indirect ref:    ${!var_name:0:40}..."
}

# ── Arrays ────────────────────────────────────────────────────────────────────

demo_arrays() {
    # Indexed array
    local -a fruits=("apple" "banana" "cherry" "date" "elderberry")

    echo "All:      ${fruits[*]}"
    echo "Length:   ${#fruits[@]}"
    echo "Index 2:  ${fruits[2]}"
    echo "Slice 1,3:${fruits[@]:1:3}"

    # Append / remove
    fruits+=("fig")
    unset 'fruits[1]'
    echo "After:    ${fruits[@]}"
    echo "Indices:  ${!fruits[@]}"  # sparse

    # Associative array
    local -A scores
    scores=([alice]=95 [bob]=78 [carol]=88 [dave]=92)
    scores[eve]=100

    echo "Keys:   ${!scores[@]}"
    echo "Values: ${scores[@]}"

    for name in "${!scores[@]}"; do
        printf "  %-10s %d\n" "$name" "${scores[$name]}"
    done | sort -k2 -nr

    # Mapfile (readarray)
    local -a lines
    mapfile -t lines < <(printf '%s\n' "one" "two" "three")
    echo "mapfile: ${lines[*]}"
}

# ── String manipulation ───────────────────────────────────────────────────────

demo_strings() {
    local str="  Hello, World!  "

    # Trim whitespace (bash 4.2+ compatible)
    str="${str#"${str%%[![:space:]]*}"}"
    str="${str%"${str##*[![:space:]]}"}"
    echo "Trimmed: '$str'"

    # Repeat a string
    local sep; sep="$(printf '─%.0s' {1..40})"
    echo "$sep"

    # Split on delimiter
    local csv="alpha,beta,gamma,delta"
    IFS=',' read -ra parts <<< "$csv"
    printf '  Part: %s\n' "${parts[@]}"

    # Regex match
    local version="v2.14.3-beta"
    if [[ $version =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)(-(.+))?$ ]]; then
        echo "Major: ${BASH_REMATCH[1]}"
        echo "Minor: ${BASH_REMATCH[2]}"
        echo "Patch: ${BASH_REMATCH[3]}"
        echo "Pre:   ${BASH_REMATCH[5]:-stable}"
    fi
}

# ── Process substitution & heredocs ──────────────────────────────────────────

demo_process_sub() {
    # diff two command outputs
    diff <(echo -e "a\nb\nc") <(echo -e "a\nd\nc") || true

    # feed sorted output to array
    local -a sorted
    mapfile -t sorted < <(printf '%s\n' "zebra" "apple" "mango" | sort)
    echo "Sorted: ${sorted[*]}"

    # Here-string
    local count
    count=$(wc -w <<< "count the words in this string")
    echo "Word count: $count"

    # Here-document with variable interpolation
    cat <<EOF
  Script: $SCRIPT_NAME
  Version: $VERSION
  PID: $$
  Args: $#
EOF

    # Here-document without substitution (note the quoted delimiter)
    cat <<'NOEXPAND'
  Literal: $HOME not expanded
  Backslash: \n not a newline
NOEXPAND
}

# ── getopts argument parsing ──────────────────────────────────────────────────

parse_args() {
    local verbose=0
    local output=""
    local dry_run=0

    while getopts ":vo:nh" opt; do
        case $opt in
            v) verbose=1 ;;
            o) output="$OPTARG" ;;
            n) dry_run=1 ;;
            h) usage; exit 0 ;;
            :) die "Option -$OPTARG requires an argument" ;;
            \?) die "Unknown option: -$OPTARG" ;;
        esac
    done
    shift $((OPTIND - 1))

    [[ $verbose -eq 1 ]] && log INFO "Verbose mode enabled"
    [[ -n "$output" ]] && log INFO "Output: $output"
    [[ $dry_run -eq 1 ]] && log WARN "Dry-run mode — no changes will be made"
    log INFO "Remaining args: $*"
}

usage() {
    cat <<USAGE
Usage: $SCRIPT_NAME [-v] [-o FILE] [-n] [ARGS...]
  -v        Verbose
  -o FILE   Output file
  -n        Dry run
  -h        Help
USAGE
}

# ── Coproc ────────────────────────────────────────────────────────────────────

demo_coproc() {
    # Launch a coproc that acts as a simple key-value store
    coproc KV {
        while IFS= read -r line; do
            case "$line" in
                SET\ *)  eval "${line#SET }";;
                GET\ *)  key="${line#GET }"; echo "${!key:-<unset>}";;
                QUIT)    break;;
            esac
        done
    }

    echo "SET myvar=hello"  >&"${KV[1]}"
    echo "GET myvar"        >&"${KV[1]}"
    read -r reply           <&"${KV[0]}"
    echo "KV reply: $reply"
    echo "QUIT"             >&"${KV[1]}"
    wait "$KV_PID" 2>/dev/null || true
}

# ── Arithmetic ────────────────────────────────────────────────────────────────

demo_arithmetic() {
    local -i n=15
    echo "Factorial($n): $(
        local -i f=1 i
        for ((i=2; i<=n; i++)); do ((f *= i)); done
        echo $f
    )"

    # Bitwise ops
    printf "AND: %d  OR: %d  XOR: %d  NOT: %d  LSHIFT: %d  RSHIFT: %d\n" \
        $(( 0xFF & 0x0F )) \
        $(( 0xF0 | 0x0F )) \
        $(( 0xFF ^ 0xAA )) \
        $(( ~42 ))         \
        $(( 1 << 10 ))     \
        $(( 1024 >> 3 ))
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
    log INFO "Starting $SCRIPT_NAME v$VERSION"

    echo -e "\n${BOLD}── Parameter Expansion ──${RESET}"
    demo_parameter_expansion

    echo -e "\n${BOLD}── Arrays ──${RESET}"
    demo_arrays

    echo -e "\n${BOLD}── Strings ──${RESET}"
    demo_strings

    echo -e "\n${BOLD}── Process Substitution ──${RESET}"
    demo_process_sub

    echo -e "\n${BOLD}── Arithmetic ──${RESET}"
    demo_arithmetic

    log INFO "Done."
}

main "$@"
