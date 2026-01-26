-- LSP Configuration using Neovim 0.11+ native API
-- nvim-lspconfig provides the default configs in lsp/*.lua
-- We use vim.lsp.config() to extend them and vim.lsp.enable() to activate

return {
	"neovim/nvim-lspconfig",
	event = { "BufReadPre", "BufNewFile" },
	dependencies = {
		"hrsh7th/cmp-nvim-lsp",
	},
	config = function()
		local cmp_nvim_lsp = require("cmp_nvim_lsp")
		local capabilities = cmp_nvim_lsp.default_capabilities()

		-- Diagnostic signs
		local sign = function(opt)
			vim.fn.sign_define(opt.name, {
				texthl = opt.name,
				text = opt.text,
				numhl = "",
			})
		end

		if vim.fn.has("macunix") == 1 then
			sign({ name = "DiagnosticSignError", text = "" })
			sign({ name = "DiagnosticSignWarn", text = "" })
			sign({ name = "DiagnosticSignHint", text = "" })
			sign({ name = "DiagnosticSignInfo", text = "" })
		else
			sign({ name = "DiagnosticSignError", text = "" })
			sign({ name = "DiagnosticSignWarn", text = "" })
			sign({ name = "DiagnosticSignHint", text = "" })
			sign({ name = "DiagnosticSignInfo", text = "" })
		end

		-- Diagnostic configuration
		vim.diagnostic.config({
			virtual_text = false,
			signs = true,
			update_in_insert = true,
			underline = true,
			severity_sort = false,
			float = {
				border = "single",
				source = true,
				header = "",
				prefix = "",
			},
		})

		-- Show diagnostics on cursor hold
		vim.api.nvim_create_autocmd("CursorHold", {
			callback = function()
				vim.diagnostic.open_float(nil, { focusable = false })
			end,
		})

		-- LSP keybindings via LspAttach autocommand
		vim.api.nvim_create_autocmd("LspAttach", {
			callback = function(args)
				local bufnr = args.buf
				local opts = { buffer = bufnr, noremap = true, silent = true }

				vim.keymap.set("n", "g[", vim.diagnostic.goto_prev, vim.tbl_extend("force", opts, { desc = "Go to previous LSP diagnostic" }))
				vim.keymap.set("n", "g]", vim.diagnostic.goto_next, vim.tbl_extend("force", opts, { desc = "Go to next LSP diagnostic" }))
				vim.keymap.set("n", "K", vim.lsp.buf.hover, vim.tbl_extend("force", opts, { desc = "Show LSP hover info" }))
				vim.keymap.set("n", "gD", "<cmd>Telescope lsp_implementations<CR>", vim.tbl_extend("force", opts, { desc = "Show LSP implementations" }))
				vim.keymap.set("n", "1gD", "<cmd>Telescope lsp_type_definitions<CR>", vim.tbl_extend("force", opts, { desc = "Show LSP type definitions" }))
				vim.keymap.set("n", "gr", "<cmd>Telescope lsp_references<CR>", vim.tbl_extend("force", opts, { desc = "Show LSP references" }))
				vim.keymap.set("n", "gd", "<cmd>Telescope lsp_definitions<CR>", vim.tbl_extend("force", opts, { desc = "Show LSP definitions" }))
				vim.keymap.set("n", "gn", vim.lsp.buf.rename, vim.tbl_extend("force", opts, { desc = "Smart rename" }))
				vim.keymap.set({ "n", "v" }, "<leader>ca", vim.lsp.buf.code_action, vim.tbl_extend("force", opts, { desc = "See available code actions" }))
				vim.keymap.set("n", "<leader>h", function()
					vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled({}))
				end, vim.tbl_extend("force", opts, { desc = "Toggle inlay hints" }))
			end,
		})

		-- ESLint auto-fix on save
		vim.api.nvim_create_autocmd("LspAttach", {
			callback = function(args)
				local client = vim.lsp.get_client_by_id(args.data.client_id)
				if client and client.name == "eslint" then
					vim.api.nvim_create_autocmd("BufWritePre", {
						buffer = args.buf,
						callback = function()
							vim.cmd("LspEslintFixAll")
						end,
					})
				end
			end,
		})

		-- ============================================
		-- LSP Server Configurations
		-- nvim-lspconfig provides defaults in lsp/*.lua
		-- We extend them with capabilities and custom settings
		-- ============================================

		-- Global config for all servers
		vim.lsp.config("*", {
			capabilities = capabilities,
		})

		-- Lua - add Neovim runtime settings
		vim.lsp.config("lua_ls", {
			settings = {
				Lua = {
					runtime = { version = "LuaJIT" },
					diagnostics = { globals = { "vim" } },
					workspace = {
						library = vim.api.nvim_get_runtime_file("", true),
						checkThirdParty = false,
					},
					telemetry = { enable = false },
				},
			},
		})

		-- TypeScript - add Vue plugin support
		vim.lsp.config("ts_ls", {
			init_options = {
				plugins = {
					{
						name = "@vue/typescript-plugin",
						location = vim.fn.stdpath("data") .. "/mason/packages/vue-language-server/node_modules/@vue/language-server",
						languages = { "javascript", "typescript", "vue" },
					},
				},
			},
			filetypes = { "javascript", "javascriptreact", "typescript", "typescriptreact", "vue" },
		})

		-- Vue - works with ts_ls via @vue/typescript-plugin
		vim.lsp.config("vue_ls", {})

		-- CSS - enable validation
		vim.lsp.config("cssls", {
			settings = {
				css = { validate = true },
				scss = { validate = true },
				less = { validate = true },
			},
		})

		-- C#/.NET - OmniSharp with useful settings
		vim.lsp.config("omnisharp", {
			settings = {
				FormattingOptions = {
					EnableEditorConfigSupport = true,
					OrganizeImports = true,
				},
				RoslynExtensionsOptions = {
					EnableAnalyzersSupport = true,
					EnableImportCompletion = true,
					EnableDecompilationSupport = true,
				},
			},
		})

		-- Enable all LSP servers
		vim.lsp.enable({
			"lua_ls",
			"ts_ls",
			"vue_ls",
			"tailwindcss",
			"cssls",
			"html",
			"eslint",
			"omnisharp",
		})
	end,
}
