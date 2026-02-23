-- Mason: LSP server package manager
-- Handles installation of language servers

return {
	"williamboman/mason.nvim",
	build = ":MasonUpdate",
	config = function()
		require("mason").setup({
			ui = {
				border = "single",
				icons = {
					package_installed = "",
					package_pending = "",
					package_uninstalled = "",
				},
			},
		})

		-- Ensure required LSP servers are installed
		local ensure_installed = {
			"lua-language-server",        -- lua_ls
			"typescript-language-server", -- ts_ls
			"vue-language-server",        -- vue_ls
			"tailwindcss-language-server", -- tailwindcss
			"css-lsp",                    -- cssls
			"html-lsp",                   -- html
			"eslint-lsp",                 -- eslint
			"clangd",                     -- clangd (C/C++)
			"omnisharp",                  -- omnisharp (C#/.NET)
			"rust-analyzer",              -- rust_analyzer (Rust)
			"gopls",                      -- gopls (Go)
		}

		local registry = require("mason-registry")

		-- Install missing packages
		registry.refresh(function()
			for _, pkg_name in ipairs(ensure_installed) do
				local pkg = registry.get_package(pkg_name)
				if not pkg:is_installed() then
					vim.notify("Mason: Installing " .. pkg_name, vim.log.levels.INFO)
					pkg:install()
				end
			end
		end)
	end,
}
