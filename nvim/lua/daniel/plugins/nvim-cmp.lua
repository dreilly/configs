return {
	"hrsh7th/nvim-cmp",
	event = "InsertEnter",
	dependencies = {
		"hrsh7th/cmp-vsnip",
		"hrsh7th/cmp-path",
		"hrsh7th/cmp-buffer",
		"hrsh7th/cmp-nvim-lsp-signature-help",
		"hrsh7th/vim-vsnip",
		"L3MON4D3/LuaSnip",
	},
	config = function()
		local cmp = require("cmp")
		local luasnip = require("luasnip")

		cmp.setup({
			snippet = {
				expand = function(args)
					vim.fn["vsnip#anonymous"](args.body)
				end,
			},
			mapping = {
				['<C-p>'] = cmp.mapping.select_prev_item(),
				['<C-n>'] = cmp.mapping.select_next_item(),
				['<CR>'] = cmp.mapping.confirm({
					behavior = cmp.ConfirmBehavior.Insert,
					select = true,
				})

			},
			sources = {
				{ name = 'path' },                                   -- file paths
				{ name = 'nvim_lsp',               keyword_length = 1 }, -- from language server
				{ name = 'nvim_lsp_signature_help' },                -- display function signatures with current parameter emphasized
				{ name = 'nvim_lua',               keyword_length = 1 }, -- complete neovim's Lua runtime API such vim.lsp.*
				{ name = 'buffer',                 keyword_length = 1 }, -- source current buffer
				{ name = 'vsnip',                  keyword_length = 1 }, -- nvim-cmp source for vim-vsnip
				{ name = 'calc' },                                   -- source for math calculation
				{ name = 'copilot' },
			},
			window = {
				completion = cmp.config.window.bordered(),
				documentation = cmp.config.window.bordered(),
			},
			formatting = {
				fields = { 'menu', 'abbr', 'kind' },
				format = function(entry, item)
					local menu_icon = {
						nvim_lsp = 'λ',
						vsnip = '⋗',
						buffer = 'Ω',
						path = '🖫',
						copilot = "",
					}
					item.menu = menu_icon[entry.source.name]
					return item
				end,
			},
		})
	end,
}
