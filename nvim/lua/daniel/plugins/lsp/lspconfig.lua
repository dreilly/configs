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

				-- Built-in for single-result actions (faster, jumps directly)
				vim.keymap.set("n", "gd", vim.lsp.buf.definition, vim.tbl_extend("force", opts, { desc = "Go to definition" }))
				vim.keymap.set("n", "gD", vim.lsp.buf.declaration, vim.tbl_extend("force", opts, { desc = "Go to declaration" }))

				-- Telescope for multi-result actions (better UI for browsing)
				vim.keymap.set("n", "gr", "<cmd>Telescope lsp_references<CR>", vim.tbl_extend("force", opts, { desc = "Show LSP references" }))
				vim.keymap.set("n", "gi", "<cmd>Telescope lsp_implementations<CR>", vim.tbl_extend("force", opts, { desc = "Show LSP implementations" }))
				vim.keymap.set("n", "gt", "<cmd>Telescope lsp_type_definitions<CR>", vim.tbl_extend("force", opts, { desc = "Show LSP type definitions" }))
				vim.keymap.set("n", "gs", "<cmd>Telescope lsp_document_symbols<CR>", vim.tbl_extend("force", opts, { desc = "Show document symbols" }))

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
					hint = { enable = true },
				},
			},
		})

		-- TypeScript - add Vue plugin support and inlay hints
		local inlay_hints_settings = {
			includeInlayParameterNameHints = "all",
			includeInlayParameterNameHintsWhenArgumentMatchesName = false,
			includeInlayFunctionParameterTypeHints = true,
			includeInlayVariableTypeHints = true,
			includeInlayPropertyDeclarationTypeHints = true,
			includeInlayFunctionLikeReturnTypeHints = true,
			includeInlayEnumMemberValueHints = true,
		}
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
			settings = {
				typescript = { inlayHints = inlay_hints_settings },
				javascript = { inlayHints = inlay_hints_settings },
			},
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

		-- C#/.NET - OmniSharp with useful settings and inlay hints
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
					InlayHintsOptions = {
						EnableForParameters = true,
						ForLiteralParameters = true,
						ForIndexerParameters = true,
						ForObjectCreationParameters = true,
						ForOtherParameters = true,
						EnableForTypes = true,
						ForImplicitVariableTypes = true,
						ForLambdaParameterTypes = true,
						ForImplicitObjectCreation = true,
					},
				},
			},
		})

		-- Rust - rust-analyzer with inlay hints
		vim.lsp.config("rust_analyzer", {
			settings = {
				["rust-analyzer"] = {
					inlayHints = {
						parameterHints = { enable = true },
						typeHints = { enable = true },
						chainingHints = { enable = false }, -- can be noisy
						closingBraceHints = { enable = true, minLines = 20 },
					},
				},
			},
		})

		-- Go - gopls with inlay hints
		vim.lsp.config("gopls", {
			settings = {
				gopls = {
					hints = {
						assignVariableTypes = true,
						compositeLiteralFields = true,
						compositeLiteralTypes = false, -- can be noisy
						constantValues = true,
						functionTypeParameters = true,
						parameterNames = true,
						rangeVariableTypes = true,
					},
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
			"rust_analyzer",
			"gopls",
		})
	end,
}
