#!/bin/sh
# Installs t3-dashboard for macOS and Linux: curl -fsSL <url>/install.sh | sh
# Env: T3_DASHBOARD_REPO, T3_DASHBOARD_VERSION, T3_DASHBOARD_INSTALL_DIR, T3_DASHBOARD_NO_SERVICE=1.
set -eu

fail() {
  echo "install.sh: $*" >&2
  exit 1
}

detect_asset() {
  os=$(printf '%s' "${T3_DASHBOARD_UNAME_S:-$(uname -s)}" | tr '[:upper:]' '[:lower:]')
  cpu=${T3_DASHBOARD_UNAME_M:-$(uname -m)}
  case "$os" in
    darwin | linux) ;;
    *) fail "$os is not supported. On Windows, use install.ps1." ;;
  esac
  case "$cpu" in
    x86_64 | amd64) cpu=x64 ;;
    arm64 | aarch64) cpu=arm64 ;;
    *) fail "$cpu is not supported." ;;
  esac
  # A shell running under Rosetta reports x86_64 on an Apple Silicon Mac.
  if [ "$os" = darwin ] && [ "$cpu" = x64 ] && [ -z "${T3_DASHBOARD_UNAME_M:-}" ] &&
    [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" = 1 ]; then
    cpu=arm64
  fi
  echo "t3-dashboard-$os-$cpu"
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d ' ' -f 1
  else
    shasum -a 256 "$1" | cut -d ' ' -f 1
  fi
}

main() {
  repo=${T3_DASHBOARD_REPO:-simonzsh/t3-dashboard}
  asset=$(detect_asset)
  if [ -n "${T3_DASHBOARD_VERSION:-}" ]; then
    base="https://github.com/$repo/releases/download/v${T3_DASHBOARD_VERSION#v}"
  else
    base="https://github.com/$repo/releases/latest/download"
  fi

  if [ "${T3_DASHBOARD_DRY_RUN:-}" = 1 ]; then
    echo "$base/$asset"
    return 0
  fi

  command -v curl >/dev/null 2>&1 || fail "curl is required."
  dir=${T3_DASHBOARD_INSTALL_DIR:-$HOME/.local/bin}
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT

  echo "Downloading $asset"
  curl -fsSL "$base/$asset" -o "$tmp/$asset" || fail "download failed: $base/$asset"
  curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS" || fail "download failed: $base/SHA256SUMS"
  expected=$(awk -v name="$asset" '$2 == name { print $1 }' "$tmp/SHA256SUMS")
  [ -n "$expected" ] || fail "no checksum for $asset in SHA256SUMS."
  [ "$(sha256_of "$tmp/$asset")" = "$expected" ] || fail "checksum mismatch for $asset."

  mkdir -p "$dir"
  chmod 755 "$tmp/$asset"
  # Move last: replacing a running binary is safe, and a half copy never lands in place.
  cp "$tmp/$asset" "$dir/.t3-dashboard.new"
  mv -f "$dir/.t3-dashboard.new" "$dir/t3-dashboard"
  echo "Installed $dir/t3-dashboard"
  case ":$PATH:" in
    *":$dir:"*) ;;
    *) echo "Warning: $dir is not in your PATH. Add it to run t3-dashboard from a terminal." ;;
  esac

  if [ "${T3_DASHBOARD_NO_SERVICE:-}" != 1 ]; then
    "$dir/t3-dashboard" install
  fi
}

main "$@"
