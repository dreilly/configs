return {
	"nvim-telescope/telescope.nvim",
	tag = "0.1.5",
	dependencies = { "nvim-lua/plenary.nvim" },
	config = function()
		local telescope = require("telescope")
		local map = vim.api.nvim_set_keymap

		telescope.setup({
			file_ignore_patterns = { "node_modules", "plugged" },
			find_command = { "rg", "--files", "--iglob", "!.git", "--hidden" },
		})
		map("n", "<Leader>p", "<cmd>Telescope find_files<CR>", { noremap = true })
		map("n", ";", "<cmd>Telescope buffers<CR>", { noremap = true })
		map("n", "<Leader>fh", "<cmd>Telescope git_status<CR>", { noremap = true })
		map("n", "<Leader>fg", "<cmd>Telescope live_grep<CR>", { noremap = true })
		map("n", "<Leader>qf", "<cmd>Telescope quickfix<CR>", { noremap = true })
	end,
}
