#!/usr/bin/env bash
# Build an installable Arch Linux package for Nevo.
#
# Usage:
#   packaging/arch/build.sh [options]
#
# Options:
#       --out <dir>       Output directory (default: dist-arch)
#       --pkgrel <number> Arch package release number (default: 1)
#       --skip-install    Do not run pnpm install --frozen-lockfile
#       --skip-build      Repackage an existing Tauri .deb staging tree
#   -h, --help            Show this help

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pkgbuild="$repo_root/packaging/arch/PKGBUILD"
out_dir="$repo_root/dist-arch"
pkgrel=1
skip_install=0
skip_build=0

die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m==>\033[0m %s\n' "$*"; }

usage() {
  sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//;$d'
}

require_value() {
  [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || die "$1 requires a value"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      require_value "$@"
      out_dir="$2"
      shift 2
      ;;
    --pkgrel)
      require_value "$@"
      pkgrel="$2"
      shift 2
      ;;
    --skip-install)
      skip_install=1
      shift
      ;;
    --skip-build)
      skip_build=1
      skip_install=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1 (see --help)"
      ;;
  esac
done

[[ "$pkgrel" =~ ^[1-9][0-9]*$ ]] || die "--pkgrel must be a positive integer"
[[ -f "$pkgbuild" ]] || die "PKGBUILD not found: $pkgbuild"

for command_name in makepkg node; do
  command -v "$command_name" >/dev/null || die "$command_name is required"
done

case "$(uname -m)" in
  x86_64)
    pkgarch=x86_64
    deb_arch=amd64
    ;;
  aarch64|arm64)
    pkgarch=aarch64
    deb_arch=arm64
    ;;
  *)
    die "unsupported architecture: $(uname -m)"
    ;;
esac

version="$({ node - "$repo_root" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const root = process.argv[2]
const packageVersion = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
).version
const tauriVersion = JSON.parse(
  fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'),
).version
const cargoManifest = fs.readFileSync(
  path.join(root, 'src-tauri/Cargo.toml'),
  'utf8',
)
const cargoVersion = cargoManifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1]

if (!packageVersion || packageVersion !== tauriVersion || packageVersion !== cargoVersion) {
  console.error(
    `version mismatch: package.json=${packageVersion}, `
      + `tauri.conf.json=${tauriVersion}, Cargo.toml=${cargoVersion ?? 'missing'}`,
  )
  process.exit(1)
}

process.stdout.write(packageVersion)
NODE
  } || die 'could not resolve a consistent application version')"

bundle_root="$repo_root/src-tauri/target/release/bundle/deb"
data_dir="$bundle_root/Nevo_${version}_${deb_arch}/data"

if [[ $skip_build -eq 0 ]]; then
  for command_name in cargo pnpm rustc; do
    command -v "$command_name" >/dev/null || die "$command_name is required to build Nevo"
  done

  build_dependencies=(
    base-devel
    curl
    file
    libappindicator-gtk3
    librsvg
    openssl
    webkit2gtk-4.1
    wget
    xdotool
  )
  if command -v pacman >/dev/null; then
    set +e
    missing_dependencies="$(pacman -T "${build_dependencies[@]}" 2>/dev/null)"
    dependency_status=$?
    set -e
    if [[ $dependency_status -ne 0 && $dependency_status -ne 127 ]]; then
      die "pacman could not validate the build dependencies"
    fi
    if [[ -n "$missing_dependencies" ]]; then
      printf 'Missing Arch build dependencies:\n%s\n' "$missing_dependencies" >&2
      die "install them with: sudo pacman -S --needed ${build_dependencies[*]}"
    fi
  fi

  if [[ $skip_install -eq 0 ]]; then
    info 'installing frontend dependencies'
    (cd "$repo_root" && pnpm install --frozen-lockfile)
  fi

  info "building Nevo $version for $pkgarch"
  (
    cd "$repo_root"
    pnpm tauri build \
      --bundles deb \
      --config '{"bundle":{"createUpdaterArtifacts":false}}'
  )
fi

[[ -x "$data_dir/usr/bin/nevo" ]] || die "Tauri package data not found: $data_dir
Run without --skip-build to create it."
[[ -f "$data_dir/usr/share/applications/Nevo.desktop" ]] \
  || die "desktop entry missing from the Tauri package data"

mkdir -p "$out_dir"
out_dir="$(cd "$out_dir" && pwd)"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/nevo-arch.XXXXXXXX")"
trap 'rm -rf -- "$work_dir"' EXIT

package_root="$work_dir/package-root"
mkdir -p "$package_root"
cp -a "$data_dir/." "$package_root/"
install -Dm644 "$pkgbuild" "$work_dir/PKGBUILD"

export NEVO_PACKAGE_ROOT="$package_root"
export NEVO_PKGARCH="$pkgarch"
export NEVO_PKGREL="$pkgrel"
export NEVO_PKGVER="$version"
export PKGDEST="$out_dir"

info "packaging nevo $version-$pkgrel"
(
  cd "$work_dir"
  makepkg --clean --force
)

mapfile -t package_files < <(
  cd "$work_dir"
  makepkg --packagelist
)
[[ ${#package_files[@]} -gt 0 ]] || die 'makepkg did not report an output package'

info 'done:'
for package_file in "${package_files[@]}"; do
  [[ -f "$package_file" ]] || die "expected package was not created: $package_file"
  printf '  %s  (%s)\n' "$package_file" "$(du -h "$package_file" | cut -f1)"
done
