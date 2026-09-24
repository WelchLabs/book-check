# Welch Labs Book Check

Upload a PDF of a book and get an editorial review of it in the browser. Local checks catch spelling, repeated words, common grammar mistakes, spacing, and inconsistent styles. Claude then reviews the text section by section, and both sets of findings are merged into one report.

## Run it locally

```sh
bun install
bun run dev
```

When the site runs through Vite, it reviews with your local `claude -p` login if Claude Code is installed and signed in. Otherwise, paste an Anthropic API key on the start page, or leave it empty to run only the local checks.

## Using claude -p with the hosted site

The hosted site on GitHub Pages at https://welchlabs.github.io/book-check/ is only static files, so it cannot run `claude -p` by itself. To review with your Claude Code login there, run a small helper on your own computer:

```sh
bun install
bun run claude-server
```

The helper listens on `http://localhost:4317` and runs `claude -p` for each section the site sends it. Leave it running, then open or return to the hosted site. It finds the helper on its own and shows the switch to review with your `claude -p` login. Stop the helper with Ctrl+C when you are done.

Things to know:

- You need Claude Code installed and signed in (`claude auth login`). Reviews use your Claude Code plan, not an API key. Any API key in your shell is ignored.
- The helper only listens on your own computer and only answers the hosted site and pages served from `localhost`. Requests from any other website are refused.
- To allow another site, such as a fork on a different domain, list it when starting the helper: `BOOK_CHECK_ORIGINS=https://example.github.io bun run claude-server`.
- To use a different port, set `PORT`, for example `PORT=5000 bun run claude-server`. The hosted site only looks on port 4317, so this is mainly useful for local copies.
- Chrome, Edge, and Firefox allow the hosted site to reach the helper. Chrome may ask for permission to access devices on your local network the first time; allow it. Safari blocks secure sites from calling `http://localhost`, so use another browser or run the site locally with `bun run dev`.

## Using it

- Drop a PDF onto the start page to check it. Add a plain text word list with it to allow custom spellings.
- Choose how many Claude reviews run at the same time, how many words each review reads, and which model to use.
- Remove findings that are wrong. Your changes are saved in the browser and come back after a reload.
- Save the results as a JSON file to share. Anyone can drop that file onto the site to open the same report.

## Scripts

- `bun run dev` starts the site with the local Claude endpoint.
- `bun run build` type checks and builds the site into `dist`.
- `bun run preview` serves the built site, also with the local Claude endpoint.
- `bun run claude-server` runs the helper that lets the hosted site review with `claude -p`.
