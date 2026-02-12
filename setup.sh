#!/usr/bin/env bash
set -euo pipefail

CONFIGS_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Setting up config symlinks from $CONFIGS_DIR"

# Neovim
mkdir -p ~/.config
ln -sf "$CONFIGS_DIR/nvim" ~/.config/nvim
echo "  ~/.config/nvim -> $CONFIGS_DIR/nvim"

# Tmux
mkdir -p ~/.tmux
ln -sf "$CONFIGS_DIR/tmux/tmux.conf" ~/.tmux.conf
ln -sf "$CONFIGS_DIR/tmux/dark.conf" ~/.tmux/dark.conf
ln -sf "$CONFIGS_DIR/tmux/light.conf" ~/.tmux/light.conf
ln -sf "$CONFIGS_DIR/tmux/switch-theme.sh" ~/.tmux/switch-theme.sh
echo "  ~/.tmux.conf -> $CONFIGS_DIR/tmux/tmux.conf"
echo "  ~/.tmux/{dark,light,switch-theme}.sh -> $CONFIGS_DIR/tmux/"

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
