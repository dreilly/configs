return {
	"simrat39/inlay-hints.nvim",
	config = function()
		local configs = require("inlay-hints")
		configs.setup({
			only_current_line = true,
			eol = {
				right_align = true,
			}
		})
	end,
}
