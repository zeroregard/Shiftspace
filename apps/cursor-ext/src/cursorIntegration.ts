import * as vscode from 'vscode';

// ////// TODO: CURSOR-SPECIFIC INTEGRATION POINTS
//
// This file is where all Cursor-specific hooks should live.
// Research findings (April 2026):
//
// 1. PLUGIN SYSTEM BRIDGE
//    Cursor has its own plugin format (.cursor-plugin/plugin.json)
//    with skills, rules, MCP servers, commands.
//    A project CAN be both a VSCode extension AND a Cursor plugin.
//    The extension handles UI (webview panels, tree views).
//    The plugin handles AI primitives (skills, rules, MCP tools).
//    Consider adding a .cursor-plugin/ directory for:
//    - A /shiftspace command that opens Inspection
//    - Skills for agents to query insights
//    - MCP server registration via the plugin manifest
//
// 2. DESIGN MODE INTEGRATION
//    Cursor 3 has Design Mode (Cmd+Shift+D) for annotating UI elements.
//    The Agents Window and Design Mode are built-in Cursor UI with
//    NO extension contribution points as of April 2026.
//    Monitor for extensibility APIs in future releases.
//
// 3. AGENT CONTEXT
//    When a Cursor agent is working in a worktree, the MCP server
//    from @shiftspace/core handles agent queries.
//    There is no native Cursor plugin skills API to replace this.
//    The MCP approach is the correct integration strategy.
//
// 4. /worktree COMMAND HOOK
//    Cursor's /worktree creates new worktrees and runs setup from
//    .cursor/worktrees.json. There is no hook to detect when a new
//    worktree is created. Use filesystem watching on the parent
//    directory to detect new worktree directories.
//
// 5. AGENTS WINDOW
//    Each agent tab is a separate worktree window. There is no
//    "user switched worktree" event because each worktree is
//    an independent Cursor window with its own extension host.
//    The current workspace folder IS the current worktree.
//
// 6. ENVIRONMENT VARIABLES
//    - CURSOR_AGENT=1: Set during agent terminal commands
//    - ROOT_WORKTREE_PATH: Available during worktree setup
//    - .agent-id file: Contains numeric task assignment (1-8)
//
// //////

/**
 * Set up Cursor-specific integration if running in Cursor.
 * Currently a no-op scaffold with detection logic.
 */
export function setupCursorIntegration(): void {
  // Check if we're running in Cursor (not plain VSCode)
  const isCursor =
    vscode.env.appName?.toLowerCase().includes('cursor') ||
    process.env['CURSOR_SESSION'] !== undefined;

  if (!isCursor) {
    return;
  }

  // ////// TODO: Initialize Cursor-specific features here
  //
  // Ideas for future implementation:
  //
  // 1. Read .agent-id to know which parallel agent we are
  //    const agentId = readAgentId(workspaceRoot);
  //    if (agentId) { ... }
  //
  // 2. Register MCP server with Cursor's plugin system
  //    (already handled by @shiftspace/core's httpServer)
  //
  // 3. Auto-open Inspection when CURSOR_AGENT=1
  //    if (process.env['CURSOR_AGENT'] === '1') {
  //      vscode.commands.executeCommand('shiftspace.openInspection');
  //    }
  //
  // //////
}
