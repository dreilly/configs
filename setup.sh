#!/usr/bin/env bash
set -euo pipefail

CONFIGS_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Setting up config symlinks from $CONFIGS_DIR"

# Neovim
mkdir -p ~/.config
ln -sfn "$CONFIGS_DIR/nvim" ~/.config/nvim
echo "  ~/.config/nvim -> $CONFIGS_DIR/nvim"

# Tmux
mkdir -p ~/.tmux
ln -sf "$CONFIGS_DIR/tmux/tmux.conf" ~/.tmux.conf
ln -sf "$CONFIGS_DIR/tmux/dark.conf" ~/.tmux/dark.conf
ln -sf "$CONFIGS_DIR/tmux/light.conf" ~/.tmux/light.conf
ln -sf "$CONFIGS_DIR/tmux/switch-theme.sh" ~/.tmux/switch-theme.sh
echo "  ~/.tmux.conf -> $CONFIGS_DIR/tmux/tmux.conf"
echo "  ~/.tmux/{dark,light,switch-theme}.sh -> $CONFIGS_DIR/tmux/"

# Ghostty
ln -sfn "$CONFIGS_DIR/ghostty" ~/.config/ghostty
echo "  ~/.config/ghostty -> $CONFIGS_DIR/ghostty"

# OpenCode
mkdir -p ~/.config/opencode
ln -sfn "$CONFIGS_DIR/opencode/commands" ~/.config/opencode/commands
ln -sf "$CONFIGS_DIR/opencode/opencode.json" ~/.config/opencode/opencode.json
echo "  ~/.config/opencode/opencode.json -> $CONFIGS_DIR/opencode/opencode.json"
echo "  ~/.config/opencode/commands -> $CONFIGS_DIR/opencode/commands"

# Pi
mkdir -p ~/.pi/agent
ln -sf "$CONFIGS_DIR/pi/settings.json" ~/.pi/agent/settings.json
ln -sf "$CONFIGS_DIR/pi/keybindings.json" ~/.pi/agent/keybindings.json
ln -sfn "$CONFIGS_DIR/pi/themes" ~/.pi/agent/themes
ln -sfn "$CONFIGS_DIR/pi/prompts" ~/.pi/agent/prompts
ln -sfn "$CONFIGS_DIR/pi/extensions" ~/.pi/agent/extensions
npm install --omit=dev --ignore-scripts --no-audit --no-fund \
  --prefix "$CONFIGS_DIR/pi/extensions/web-tools"
echo "  ~/.pi/agent/{settings,keybindings}.json -> $CONFIGS_DIR/pi/"
echo "  ~/.pi/agent/{themes,prompts,extensions} -> $CONFIGS_DIR/pi/"
echo "  Installed Pi web-tools runtime dependencies"

# Install TPM if not present
if [ ! -d ~/.tmux/plugins/tpm ]; then
  echo "Installing TPM..."
  git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
  echo "  TPM installed. Open tmux and press prefix + I to install plugins."
fi

# Install dark-notify (macOS only)
if [[ "$(uname)" == "Darwin" ]] && ! command -v dark-notify &>/dev/null; then
  echo "Installing dark-notify..."
  brew install cormacrelf/tap/dark-notify
fi

echo "Done."
