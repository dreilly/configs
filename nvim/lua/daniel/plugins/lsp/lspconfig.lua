return {
	"neovim/nvim-lspconfig",
	event = { "BufReadPre", "BufNewFile" },
	dependencies = {
		"hrsh7th/cmp-nvim-lsp",
	},
	config = function()
		local lspconfig = require("lspconfig")
		local cmp_nvim_lsp = require("cmp_nvim_lsp")

		local opts = { noremap = true, silent = true }
		local keymap = vim.keymap
		local on_attach = function(client, bufnr)
			opts.buffer = bufnr
			keymap.set("n", "g[", vim.diagnostic.goto_prev, opts)

			opts.desc = "Go to next LSP diagnostic"
			keymap.set("n", "g]", vim.diagnostic.goto_next, opts)

			opts.desc = "Show LSP info for whats under the cursor"
			keymap.set("n", "K", vim.lsp.buf.hover, opts)

			opts.desc = "Show LSP implementations"
			keymap.set("n", "gD", "<cmd>Telescope lsp_implementations<CR>", opts)

			opts.desc = "Show LSP type definitions"
			keymap.set("n", "1gD", "<cmd>Telescope lsp_type_definitions<CR>", opts)

			opts.desc = "Show LSP references"
			keymap.set("n", "gr", "<cmd>Telescope lsp_references<CR>", opts)

			opts.desc = "Show LSP definitions"
			keymap.set("n", "gd", "<cmd>Telescope lsp_definitions<CR>", opts)

			opts.desc = "Smart rename"
			keymap.set("n", "gn", vim.lsp.buf.rename, opts)

			opts.desc = "See available code actions"
			keymap.set({ "n", "v" }, "<leader>ca", vim.lsp.buf.code_action, opts)
		end
		--vim.cmd [[autocmd BufWritePre * lua vim.lsp.buf.format()]]

		local capabilities = cmp_nvim_lsp.default_capabilities()
		local sign = function(opt)
			vim.fn.sign_define(opt.name, {
				texthl = opt.name,
				text = opt.text,
				numhl = "",
			})
		end

		sign({ name = "DiagnosticSignError", text = "" })
		sign({ name = "DiagnosticSignWarn", text = "" })
		sign({ name = "DiagnosticSignHint", text = "" })
		sign({ name = "DiagnosticSignInfo", text = "" })

		vim.diagnostic.config({
			virtual_text = false,
			signs = true,
			update_in_insert = true,
			underline = true,
			severity_sort = false,
			float = {
				border = "single",
				source = "always",
				header = "",
				prefix = "",
			},
		})

		vim.cmd([[
			autocmd CursorHold * lua vim.diagnostic.open_float(nil, { focusable = false })
		]])

		--configure lus_ls server
		lspconfig["lua_ls"].setup({
			capabilities = capabilities,
			on_attach = on_attach,
			settings = {
				Lua = {
					runtime = {
						version = "LuaJIT",
					},
					diagnostics = {
						globals = { "vim" },
					},
					workspace = {
						library = {
							[vim.fn.expand("$VIMRUNTIME/lua")] = true,
							[vim.fn.stdpath("config") .. "/lua"] = true,
						},
					},
					telemetry = {
						enable = false,
					},
				},
			},
		})

		lspconfig["rust_analyzer"].setup({
			capabilities = capabilities,
			on_attach = on_attach,
			cmd = {
				"rustup",
				"run",
				"stable",
				"rust-analyzer",
			},
			settings = {
				["rust-analyzer"] = {
					diagnostics = false,
				},
			},
		})

		vim.g.markdown_fenced_languages = {
			"ts=typescript",
		}

		-- deno language server
		lspconfig["denols"].setup({
			capabilities = capabilities,
			on_attach = on_attach,
			root_dir = lspconfig["util"].root_pattern("deno.json", "deno.jsonc"),
		})

		-- typescript language server
		lspconfig["tsserver"].setup({
			capabilities = capabilities,
			on_attach = on_attach,
			root_dir = lspconfig["util"].root_pattern("package.json"),
		})

		-- tailwind language server
		lspconfig["tailwindcss"].setup({
			capabilities = capabilities,
			on_attach = on_attach,
		})

		-- prisma language server
		lspconfig["prismals"].setup({
			capabilities = capabilities,
			on_attach = on_attach,
		})

		-- css language server
		lspconfig["cssls"].setup({
			capabilities = capabilities,
			on_attach = on_attach,
		})

		-- go language server
		lspconfig["gopls"].setup({
			capabilities = capabilities,
			on_attach = on_attach,
		})

		-- vue language server
		lspconfig["volar"].setup({
			capabilities = capabilities,
			on_attach = on_attach,
		})

		-- python
		lspconfig["pyright"].setup({
			capabilities = capabilities,
			on_attach = on_attach,
		})
	end,
}
