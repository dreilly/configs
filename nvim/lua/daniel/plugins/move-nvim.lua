return {
	"fedepujol/move.nvim",
	config = function()
		local map = vim.api.nvim_set_keymap
		local opts = { noremap = true, silent = true }
		map('n', '<A-j>', ':MoveLine(1)<CR>', opts)
		map('n', '<A-k>', ':MoveLine(-1)<CR>', opts)
		map('n', '<A-h>', ':MoveHChar(-1)<CR>', opts)
		map('n', '<A-l>', ':MoveHChar(1)<CR>', opts)
		map('v', '<A-j>', ':MoveBlock(1)<CR>', opts)
		map('v', '<A-k>', ':MoveBlock(-1)<CR>', opts)
		map('v', '<A-h>', ':MoveHBlock(-1)<CR>', opts)
		map('v', '<A-l>', ':MoveHBlock(1)<CR>', opts)
	end,
}
