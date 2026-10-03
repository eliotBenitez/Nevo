#!/usr/bin/env bash
# Runs inside `dbus-run-session`: a private session bus, a headless GNOME Shell
# with one virtual monitor, and WebKitWebDriver, which launches the Tauri binary
# on demand. Everything (dconf, keyring, app data) lives under QA_PROFILE, so
# the user's desktop session, GNOME settings, home directory and real workspaces
# are untouched.
set -euo pipefail

: "${QA_PROFILE:?}" "${QA_LOG_DIR:?}" "${QA_PORT:?}" "${QA_SIZE:?}" "${QA_WAYLAND_DISPLAY:?}"

# HOME too: the app expands `~/Documents/Nevo/` (default workspace location) via $HOME.
export HOME="$QA_PROFILE/home"
export XDG_CONFIG_HOME="$QA_PROFILE/config"
export XDG_DATA_HOME="$QA_PROFILE/data"
export XDG_CACHE_HOME="$QA_PROFILE/cache"
export XDG_STATE_HOME="$QA_PROFILE/state"
mkdir -p "$HOME/Documents" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME"

gnome-shell --headless --wayland --wayland-display "$QA_WAYLAND_DISPLAY" \
  --virtual-monitor "$QA_SIZE" >"$QA_LOG_DIR/gnome-shell.log" 2>&1 &

for _ in $(seq 100); do
  [ -S "$XDG_RUNTIME_DIR/$QA_WAYLAND_DISPLAY" ] && break
  sleep 0.1
done
if [ ! -S "$XDG_RUNTIME_DIR/$QA_WAYLAND_DISPLAY" ]; then
  echo "gnome-shell did not create its Wayland socket; see $QA_LOG_DIR/gnome-shell.log" >&2
  exit 1
fi

if [ -n "${QA_COLOR_SCHEME:-}" ]; then
  gsettings set org.gnome.desktop.interface color-scheme "$QA_COLOR_SCHEME" || true
fi

export WAYLAND_DISPLAY="$QA_WAYLAND_DISPLAY"
export GDK_BACKEND=wayland
# tauri-runtime-wry only allows WebKit automation when this is set.
export TAURI_WEBVIEW_AUTOMATION=true

exec WebKitWebDriver --port="$QA_PORT" >"$QA_LOG_DIR/webdriver.log" 2>&1
