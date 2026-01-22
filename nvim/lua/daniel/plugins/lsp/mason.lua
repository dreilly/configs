return {
	"williamboman/mason.nvim",
	dependencies = {
		"williamboman/mason-lspconfig.nvim",
	},
	config = function()
		local mason = require("mason")
		mason.setup({ })
		local mason_lspconfig = require("mason-lspconfig")

		mason_lspconfig.setup({
			ensure_installed = {
				"lua_ls",
				"rust_analyzer",
				"ts_ls",
				"tailwindcss",
				"prismals",
				"cssls",
				"gopls",
				"pyright",
				"html",
			},
			automatic_enable = true,
		})
	end,
}
