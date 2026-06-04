---
description: Open Realtime for a district in Chrome
---

# /open-realtime

Open Realtime for the supplied district ID using the Chrome DevTools MCP server.

## Usage

```
/open-realtime <districtId>
```

## Instructions

1. Treat `$1` as `<districtId>`.
2. Build this URL exactly: `https://sis.localhost/$1/stay.cfm`.
3. Use the Chrome DevTools MCP server to open Chrome to that URL.
4. If Chrome already has a page open, navigate the active page to the URL; otherwise create a new page.
5. After opening the page, report the URL that was opened.

Do not use a shell command or another browser automation tool for this command.
