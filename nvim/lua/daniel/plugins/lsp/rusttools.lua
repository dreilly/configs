return {
	"simrat39/rust-tools.nvim",
	config = function()
		local configs = require("rust-tools")
		configs.setup({
			tools = {
				on_initialized = function()
					require("inlay-hints").set_all()
				end,
				inlay_hints = {
					auto = true,
				},
			},
			server = {
				on_attach = function(c, buff)
					require("nvim-autopairs").remove_rule('`')
					require("inlay-hints").on_attach(c, buff)
				end,
			},
		})
	end,
}
