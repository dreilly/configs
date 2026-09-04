#!/usr/bin/env bash
set -euo pipefail

CONFIGS_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_SUFFIX="backup.$(date +%Y%m%d%H%M%S)"

echo "Setting up config symlinks from $CONFIGS_DIR"

link_item() {
  local source="$1"
  local dest="$2"

  mkdir -p "$(dirname "$dest")"

  if [[ -L "$dest" ]]; then
    rm "$dest"
  elif [[ -e "$dest" ]]; then
    local backup="${dest}.${BACKUP_SUFFIX}"
    mv "$dest" "$backup"
    echo "  Existing $dest moved to $backup"
  fi

  ln -s "$source" "$dest"
  echo "  $dest -> $source"
}

# Neovim
link_item "$CONFIGS_DIR/nvim" "$HOME/.config/nvim"

# Tmux
mkdir -p "$HOME/.tmux"
link_item "$CONFIGS_DIR/tmux/tmux.conf" "$HOME/.tmux.conf"
link_item "$CONFIGS_DIR/tmux/dark.conf" "$HOME/.tmux/dark.conf"
link_item "$CONFIGS_DIR/tmux/light.conf" "$HOME/.tmux/light.conf"
link_item "$CONFIGS_DIR/tmux/switch-theme.sh" "$HOME/.tmux/switch-theme.sh"

# Ghostty
link_item "$CONFIGS_DIR/ghostty" "$HOME/.config/ghostty"

# WezTerm
link_item "$CONFIGS_DIR/wezterm" "$HOME/.config/wezterm"

# i3 / i3status
link_item "$CONFIGS_DIR/i3" "$HOME/.config/i3"
link_item "$CONFIGS_DIR/i3status" "$HOME/.config/i3status"

# Herdr
link_item "$CONFIGS_DIR/herdr/config.toml" "$HOME/.config/herdr/config.toml"

# OpenCode
mkdir -p "$HOME/.config/opencode"
link_item "$CONFIGS_DIR/opencode/commands" "$HOME/.config/opencode/commands"
link_item "$CONFIGS_DIR/opencode/opencode.json" "$HOME/.config/opencode/opencode.json"
link_item "$CONFIGS_DIR/opencode/tui.json" "$HOME/.config/opencode/tui.json"
link_item "$CONFIGS_DIR/opencode/AGENTS.md" "$HOME/.config/opencode/AGENTS.md"

# Shared agent skills/config
link_item "$CONFIGS_DIR/agents" "$HOME/.agents"

# Pi
mkdir -p "$HOME/.pi/agent"
link_item "$CONFIGS_DIR/pi/settings.json" "$HOME/.pi/agent/settings.json"
link_item "$CONFIGS_DIR/pi/keybindings.json" "$HOME/.pi/agent/keybindings.json"
link_item "$CONFIGS_DIR/pi/themes" "$HOME/.pi/agent/themes"
link_item "$CONFIGS_DIR/pi/prompts" "$HOME/.pi/agent/prompts"
link_item "$CONFIGS_DIR/pi/extensions" "$HOME/.pi/agent/extensions"
link_item "$CONFIGS_DIR/pi/agents" "$HOME/.pi/agent/agents"

npm install --omit=dev --ignore-scripts --no-audit --no-fund \
  --prefix "$CONFIGS_DIR/pi/extensions/web-tools"
echo "  Installed Pi web-tools runtime dependencies"

# Install TPM if not present
if [[ ! -d "$HOME/.tmux/plugins/tpm" ]]; then
  echo "Installing TPM..."
  git clone https://github.com/tmux-plugins/tpm "$HOME/.tmux/plugins/tpm"
  echo "  TPM installed. Open tmux and press prefix + I to install plugins."
fi

# Install dark-notify (macOS only)
if [[ "$(uname)" == "Darwin" ]] && ! command -v dark-notify &>/dev/null; then
  echo "Installing dark-notify..."
  brew install cormacrelf/tap/dark-notify
fi

echo "Done."
