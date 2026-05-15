return {
	"nvim-treesitter/nvim-treesitter",
	build = ":TSUpdate",
	config = function()
		require("nvim-treesitter")

		-- Neovim 0.12 passes directive captures as node lists, while nvim-treesitter's
		-- bundled compatibility directives still expect a single node.
		local query = require("vim.treesitter.query")
		local directive_opts = { force = true, all = false }
		local html_script_type_languages = {
			["application/ecmascript"] = "javascript",
			["importmap"] = "json",
			["module"] = "javascript",
			["text/ecmascript"] = "javascript",
		}
		local non_filetype_match_injection_language_aliases = {
			ex = "elixir",
			pl = "perl",
			sh = "bash",
			ts = "typescript",
			uxn = "uxntal",
		}
		local function first_node(match, capture_id)
			local node = match[capture_id]
			if type(node) == "table" then
				node = node[1]
			end
			return node
		end
		local function parser_from_markdown_info_string(injection_alias)
			local match = vim.filetype.match({ filename = "a." .. injection_alias })
			return match or non_filetype_match_injection_language_aliases[injection_alias] or injection_alias
		end

		query.add_directive("set-lang-from-mimetype!", function(match, _, bufnr, pred, metadata)
			local node = first_node(match, pred[2])
			if not node then
				return
			end

			local type_attr_value = vim.treesitter.get_node_text(node, bufnr)
			local type_parts = vim.split(type_attr_value, "/", {})
			metadata["injection.language"] = html_script_type_languages[type_attr_value]
				or type_parts[#type_parts]
		end, directive_opts)

		query.add_directive("set-lang-from-info-string!", function(match, _, bufnr, pred, metadata)
			local node = first_node(match, pred[2])
			if not node then
				return
			end

			local injection_alias = vim.treesitter.get_node_text(node, bufnr):lower()
			metadata["injection.language"] = parser_from_markdown_info_string(injection_alias)
		end, directive_opts)

		query.add_directive("downcase!", function(match, _, bufnr, pred, metadata)
			local id = pred[2]
			local node = first_node(match, id)
			if not node then
				return
			end

			local text = vim.treesitter.get_node_text(node, bufnr, { metadata = metadata[id] }) or ""
			metadata[id] = metadata[id] or {}
			metadata[id].text = string.lower(text)
		end, directive_opts)

		local configs = require("nvim-treesitter.configs")
		configs.setup({
			ensure_installed = { "javascript", "typescript", "c", "lua", "vim", "vimdoc", "query", "go", "gomod", "json" },
			sync_install = false,
			auto_install = true,
			highlight = {
				enable = true,
				additional_vim_regex_highlighting = false,
			},
		})
	end,
}
