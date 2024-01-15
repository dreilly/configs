return {
	"simrat39/rust-tools.nvim",
	config = function()
		local configs = require("rust-tools")
		configs.setup({
			server = {
				on_attach = function(_, _)
					require("nvim-autopairs").remove_rule("`")
					--require("inlay-hints").on_attach(c, buff)
				end,
			},
		})
	end,
}
