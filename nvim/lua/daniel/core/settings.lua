vim.opt.hidden = true
vim.opt.relativenumber = true
vim.opt.number = true
vim.opt.wildmenu = true
vim.opt.wrap = false
vim.opt.ignorecase = true
vim.opt.smartcase = true
vim.opt.autoindent = true
vim.opt.laststatus = 0
vim.opt.confirm = true
vim.opt.mouse = "a"
vim.opt.to = true
vim.opt.ttimeout = true
vim.opt.ttimeoutlen = 0
vim.opt.timeoutlen = 1000
vim.opt.pastetoggle = "<F11>"
vim.opt.expandtab = true
vim.opt.smartindent = true
vim.opt.shiftwidth = 2
--vim.opt.softtabstop = 2
vim.opt.tabstop = 2
vim.opt.incsearch = true
vim.opt.shortmess:append({ A = true })
vim.opt.shortmess:append({ I = true })
vim.opt.shortmess:append({ c = true })
vim.opt.cursorline = true
vim.opt.scrolloff = 10
vim.opt.background = "dark"
vim.opt.backspace:append({ indent = true })
vim.opt.backspace:append({ eol = true })
vim.opt.backspace:append({ start = true })
vim.opt.guicursor = "n-v-c-i:block"

vim.opt.completeopt = { "menuone", "noselect", "noinsert" }
vim.opt.shortmess = vim.opt.shortmess + { c = true }
vim.api.nvim_set_option("updatetime", 300)

vim.cmd([[
	filetype plugin indent on
	set noswapfile
	set signcolumn=yes
	set winbar=\ %m\ %f
]])

-- MAPPINGS
local map = vim.api.nvim_set_keymap

vim.g.mapleader = " "
vim.keymap.set("n", "<Leader>`", "<C-^>")
vim.keymap.set("n", "J", "mzJ`z")

-- Syntax
map("n", "<Leader>i", ":set syntax=whitespace<CR>", { noremap = true })
map("n", "<Leader>I", ":set syntax=on<CR>", { noremap = true })

-- Clears
map("n", "<Leader>o", ":noh<CR>", { noremap = true })
map("n", "<Leader>O", ":e<CR>", { noremap = true })
