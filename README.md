# Welch Labs Book Check

Check a book PDF for spelling, grammar, and style problems, right in your browser.

**Open the site:** https://welchlabs.github.io/book-check/

## Quick start

1. Open the site.
2. Drop your book PDF onto the page.
3. Press the start button, then read through the findings and remove any that are wrong.

That runs the built in checks. To also have Claude review the book, follow the setup steps below or use an Anthropic API key.

## Set up Claude reviews

You do not need to download this project. You only need Claude Code, Node.js, and one command.

### Mac

1. **Open Terminal.** Press Cmd and Space, type `Terminal`, press Return.
2. **Install Claude Code.** Paste this and press Return:
   ```sh
   curl -fsSL https://claude.ai/install.sh | bash
   ```
3. **Sign in to Claude.** If the command is not found, close Terminal, open it again, and retry.
   ```sh
   claude auth login
   ```
4. **Install Node.js.** Download the LTS version from [nodejs.org](https://nodejs.org/en/download) and open the installer.
5. **Start the helper.** Keep this window open while you use the site.
   ```sh
   curl -fsSL https://welchlabs.github.io/book-check/claude-helper.mjs --create-dirs -o ~/.book-check/claude-helper.mjs && node ~/.book-check/claude-helper.mjs
   ```
6. **Go back to the site.** A switch to review with Claude now appears.

Next time, open Terminal and run only:

```sh
node ~/.book-check/claude-helper.mjs
```

### Windows

1. **Open PowerShell.** Press the Windows key, type `PowerShell`, press Enter.
2. **Install Claude Code.**
   ```powershell
   irm https://claude.ai/install.ps1 | iex
   ```
3. **Sign in to Claude.** If the command is not found, close PowerShell, open it again, and retry.
   ```powershell
   claude auth login
   ```
4. **Install Node.js.** Download the LTS version from [nodejs.org](https://nodejs.org/en/download) and open the installer.
5. **Start the helper.** Keep this window open while you use the site.
   ```powershell
   curl.exe -fsSL https://welchlabs.github.io/book-check/claude-helper.mjs --create-dirs -o $HOME\.book-check\claude-helper.mjs; node $HOME\.book-check\claude-helper.mjs
   ```
6. **Go back to the site.** A switch to review with Claude now appears.

Next time, open PowerShell and run only:

```powershell
node $HOME\.book-check\claude-helper.mjs
```

The same steps are on the site under the help button in the top right.

## Use an Anthropic API key instead

If you have an Anthropic API key, you can skip the setup above. Paste the key into the key field on the start page, and Claude reviews the book directly from your browser. The key is only stored in your browser.

## Choosing a model

Both ways of reviewing offer the same models on the start page: Claude Fable 5.1, Claude Opus 5.5, Claude Opus 5, Claude Sonnet 5, and Claude Haiku 4.5. Fable and Opus are the most capable. Sonnet and Haiku are faster and use less of your plan or credits.

## Good to know

- **Browser:** use Chrome, Edge, or Firefox. Safari blocks the site from talking to the helper. If Chrome asks to access devices on your local network, allow it.
- **Cost:** reviews through the helper use your Claude plan. Reviews with an API key are billed to that key.
- **Privacy:** the helper only runs on your computer and only answers this site.
- **Saving:** your results stay in the browser after a reload. Use the save button to get a JSON file you can send to someone. They drop it onto the site to see the same report.
