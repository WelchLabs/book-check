# Welch Labs Book Check

Check a book PDF for spelling, grammar, and style problems, right in your browser.

**Open the site:** https://welchlabs.github.io/book-check/

## Quick start

1. Open the site.
2. Drop your book PDF onto the page.
3. Press the start button, then read through the findings and remove any that are wrong.

That runs the built in checks. To also have Claude or Codex review the book, follow the setup steps below. An Anthropic API key is another option for Claude.

## Set up Claude or Codex reviews

You do not need to download this project. Both CLIs use the same local helper:

1. Install the LTS version of [Node.js](https://nodejs.org/en/download).
2. Install and sign in to the CLI you want to use:

   | CLI | Mac install | Windows install | Sign in |
   | --- | --- | --- | --- |
   | Claude Code | `curl -fsSL https://claude.ai/install.sh \| bash` | `irm https://claude.ai/install.ps1 \| iex` | `claude auth login` |
   | Codex CLI | `npm install -g @openai/codex` | `npm install -g @openai/codex` | `codex login` |

3. Start the helper and keep its terminal window open while using the site.

   **Mac (Terminal):**

   ```sh
   curl -fsSL https://welchlabs.github.io/book-check/book-check-helper.mjs --create-dirs -o ~/.book-check/book-check-helper.mjs && node ~/.book-check/book-check-helper.mjs
   ```

   **Windows (PowerShell):**

   ```powershell
   curl.exe -fsSL https://welchlabs.github.io/book-check/book-check-helper.mjs --create-dirs -o $HOME\.book-check\book-check-helper.mjs; node $HOME\.book-check\book-check-helper.mjs
   ```

4. Return to the site, choose **Claude CLI** or **Codex CLI**, then choose a model and supported reasoning depth.

Next time, start the helper with `node ~/.book-check/book-check-helper.mjs` on Mac or `node $HOME\.book-check\book-check-helper.mjs` on Windows. The same steps are in the site's setup guide.

The helper runs Codex reviews in a temporary directory with a read only sandbox and a structured output schema.

## Use an Anthropic API key instead

If you have an Anthropic API key, you can skip the setup above. Paste the key into the key field on the start page, and Claude reviews the book directly from your browser. The key is only stored in your browser.

## Choosing a model

Claude CLI and Anthropic API reviews offer the same models on the start page: Claude Fable 5.1, Claude Opus 5.5, Claude Opus 5, Claude Sonnet 5, and Claude Haiku 4.5. Codex reviews offer the named models listed by your local Codex CLI. Both providers show the reasoning depths supported by the selected model; Claude Haiku 4.5 does not support this setting.

## Good to know

- **Browser:** use Chrome, Edge, or Firefox. Safari blocks the site from talking to the helper. If Chrome asks to access devices on your local network, allow it.
- **Cost:** CLI reviews use the account signed in to the selected CLI. Reviews with an Anthropic API key are billed to that key.
- **Privacy:** the helper only runs on your computer and only answers this site.
- **Saving:** your results stay in the browser after a reload. Use the save button to get a JSON file you can send to someone. They drop it onto the site to see the same report.
