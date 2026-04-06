# Cursor 3.0 Integration Research Notes

Research conducted April 2026.

## 1. Worktree Detection from Extensions

**Finding:** There is **no dedicated Cursor worktree API** exposed to VSCode extensions.

- Cursor 3 has first-class worktree support via `/worktree` and `/best-of-n` slash commands in the agent chat.
- When an agent runs in worktree mode, Cursor automatically creates a git worktree, runs setup commands from `.cursor/worktrees.json`, and the agent operates in that isolated directory.
- Each worktree opens as a **separate Cursor window** with its own language server and AI agent process.
- Extensions detect worktrees the same way as in stock VSCode: `vscode.workspace.workspaceFolders` and `git worktree list`.
- There is **no `cursor.worktree.*` API namespace** for extensions to query active worktree state or receive worktree lifecycle events.

**Approach for Shiftspace:** Use the same strategy as the VSCode extension — detect the git root from the active file's workspace folder. This works because each Cursor worktree window has its own workspace folder.

## 2. Cursor Plugin Format

Cursor has its own plugin system separate from VSCode extensions:

```
.cursor-plugin/
  plugin.json          # Required manifest
skills/                # SKILL.md files with YAML frontmatter
rules/                 # .mdc files (always-apply or glob-scoped)
commands/              # Markdown files with numbered steps
subagents/             # Specialized parallel agents
mcp_servers/           # Or mcp.json at root
hooks/                 # hooks.json for lifecycle scripts
```

### Can a project be BOTH a VSCode extension AND a Cursor plugin?

**Yes.** These are orthogonal systems:

- The VSIX extension runs in the extension host (webview panels, tree views, status bar)
- The Cursor plugin provides AI-agent primitives (skills, rules, MCP tools)
- They don't conflict

**Practical implication:** Shiftspace can ship as a VSCode extension that Cursor installs normally (from Open VSX registry), AND optionally provide a `.cursor-plugin/` directory for agent-aware features.

## 3. Agents Window

- The Agents Window (`Cmd+Shift+P -> Agents Window`) shows agent tabs, each an independent session.
- Agents can run in **Local**, **Worktree**, or **Cloud** mode.
- The Agents Window is a **built-in Cursor UI** — it does **not** expose extension contribution points.
- Extensions **cannot** inject views, badges, or custom panels into the Agents Window.

**TODO:** Monitor for an Agents Window extension API in future Cursor releases. This would be ideal for showing per-worktree insights.

## 4. `cursor.*` API Namespace

**No documented `cursor.*` API namespace exists.** Cursor does not extend `vscode.*` with custom APIs for extensions. The plugin system (skills, rules, MCP, hooks) is the mechanism for extending Cursor's AI features.

**TODO:** Check `github.com/cursor/cursor` for proposals. File a feature request if none exists.

## 5. Environment Variables

| Variable             | Value                 | Context                                                              |
| -------------------- | --------------------- | -------------------------------------------------------------------- |
| `CURSOR_AGENT`       | `1`                   | Set when Cursor CLI executes terminal commands during agent sessions |
| `CURSOR_CLI`         | Path to cursor binary | Set in Cursor's integrated terminal                                  |
| `ROOT_WORKTREE_PATH` | Absolute path         | Available during worktree setup; points to main repo root            |

Additionally, worktree coordination files (not env vars):

- `.agent-id`: Contains numeric task assignment (1-8) per worktree
- `.session-id`: Identifies the coordinated session
- `.coord-[session-id]/task-*.json`: Claim files for task distribution

**Detection:** Check `process.env.CURSOR_AGENT === '1'` or `vscode.env.appName?.toLowerCase().includes('cursor')` to detect Cursor.

## 6. Extension Compatibility

- Cursor is a **fork of VSCode's open-source codebase**. The extension API is the same.
- Cursor pulls from **Open VSX Registry** (not Microsoft Marketplace). ~90% cross-published.
- Proprietary Microsoft extensions (Pylance, C# Dev Kit, Live Share) are unavailable.
- VSCode extensions (`.vsix`) install and run identically in Cursor.

## Summary: What This Means for the Cursor Extension

1. **Ship as a normal VSCode extension.** No need for a separate `.cursor-plugin/` (though we could add one later for agent skills/rules).
2. **Worktree detection:** Standard `git worktree list` / workspace folder detection works.
3. **No Grove needed:** Cursor's Agents Window already manages worktrees visually. We go straight to Inspection for the current workspace folder.
4. **MCP server integration:** The existing Shiftspace MCP server works in Cursor — agents can query insights and check status.
5. **Agents Window is closed:** We cannot add UI to it. Our webview panel is the right approach.
6. **Environment detection:** Use `CURSOR_AGENT` env var or `vscode.env.appName` to detect Cursor context.
