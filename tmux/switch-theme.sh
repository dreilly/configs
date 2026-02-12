#!/usr/bin/env bash
# Unset all catppuccin theme variables (they use -o so won't update otherwise),
# set the new flavor, and re-source the plugin.

flavor="$1"

# Unset all @thm_* variables
for var in $(tmux show-options -g | grep -o '@thm_[a-z_0-9]*'); do
  tmux set -gu "$var"
done

# Unset all internal catppuccin variables that use -o
for var in $(tmux show-options -g | grep -o '@_ctp_[a-z_0-9]*'); do
  tmux set -gu "$var"
done
for var in $(tmux show-options -g | grep -o '@catppuccin_window_[a-z_]*_separator'); do
  tmux set -gu "$var"
done
for var in $(tmux show-options -g | grep -oE '@catppuccin_window_(text_color|number_color|current_text_color|current_number_color)'); do
  tmux set -gu "$var"
done
# Unset status module colors (icon_fg, icon_bg, text_fg, text_bg, module_text_bg)
for var in $(tmux show-options -g | grep -oE '@catppuccin_status_[a-z_]+_(icon_fg|icon_bg|text_fg|text_bg)'); do
  tmux set -gu "$var"
done
tmux set -gu @catppuccin_status_module_text_bg 2>/dev/null

# Set the flavor and re-source
tmux set -g @catppuccin_flavor "$flavor"
tmux source ~/.tmux/plugins/tmux/catppuccin_options_tmux.conf
tmux source ~/.tmux/plugins/tmux/catppuccin_tmux.conf
