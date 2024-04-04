return {
	"williamboman/mason.nvim",
	dependencies = {
		"williamboman/mason-lspconfig.nvim",
	},
	config = function()
		local mason = require("mason")
		mason.setup({})
		local mason_lspconfig = require("mason-lspconfig")

		mason_lspconfig.setup({
			ensure_installed = {
				"lua_ls",
				"rust_analyzer",
				"denols",
				"tsserver",
				"tailwindcss",
				"prismals",
				"cssls",
				"gopls",
				"volar",
				"pyright",
				"html",
				"volar@1.8.4",
			},
			automatic_installation = true,
		})
	end,
}
