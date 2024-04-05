local wezterm = require("wezterm")

return {
	color_scheme = "Catppuccin Mocha",
	font = wezterm.font("JetBrains Mono"),
	use_cap_height_to_scale_fallback_fonts = true,
	font_size = 12,
	scrollback_lines = 5000,
	hide_tab_bar_if_only_one_tab = true,
	enable_scroll_bar = false,
	audible_bell = "Disabled",
	default_prog = { "/bin/bash" },
	window_background_opacity = 1.0,
	window_padding = {
		left = 0,
		right = 0,
		top = 0,
		bottom = 0,
	},
	keys = {
		{
			key = "n",
			mods = "CTRL",
			action = wezterm.action.DisableDefaultAssignment,
		},
		{
			key = "n",
			mods = "META",
			action = wezterm.action.DisableDefaultAssignment,
		},
	},
}
