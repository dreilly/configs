return {
	"zbirenbaum/copilot.lua",
	event = "InsertEnter",
	cmd = "Copilot",

	config = function()
		local configs = require("copilot")
		configs.setup({})
	end,
}
