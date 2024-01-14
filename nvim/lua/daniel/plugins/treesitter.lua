return {
	"nvim-treesitter/nvim-treesitter",
	build = ":TSUpdate",
	config = function()
		local configs = require("nvim-treesitter.configs")
		configs.setup({
			ensure_installed = { "javascript", "rust", "typescript", "c", "lua", "vim", "vimdoc", "query", "go", "gomod" },
			sync_install = false,
			auto_install = true,
			highlight = {
				enable = true,
				additional_vim_regex_highlighting = false,
			},
			file_ignore_patterns = { "node_modules", "plugged" },
			find_command = { 'rg', '--files', '--iglob', '!.git', '--hidden' },
		})
	end,
}
