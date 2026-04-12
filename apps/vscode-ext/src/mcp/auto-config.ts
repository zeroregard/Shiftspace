import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { log } from '../logger';
import { reportError } from '../telemetry';

const MCP_SERVER_PATH = path.join(os.homedir(), '.shiftspace', 'mcp-server.mjs');

interface McpServerEntry {
  command: string;
  args: string[];
}

/**
 * Copy the compiled MCP server to ~/.shiftspace/mcp-server.mjs so agents
 * can reference a stable, known path regardless of extension install location.
 */
export async function installMcpServerBinary(extensionPath: string): Promise<void> {
  const source = path.join(extensionPath, 'dist', 'mcp-server.mjs');
  const destDir = path.join(os.homedir(), '.shiftspace');

  await fs.promises.mkdir(destDir, { recursive: true, mode: 0o700 });

  try {
    await fs.promises.copyFile(source, MCP_SERVER_PATH);
  } catch (err) {
    log.warn('Failed to install MCP server binary:', err);
    reportError(err instanceof Error ? err : new Error(String(err)), {
      context: 'installMcpServerBinary',
    });
  }
}

/**
 * Configure Claude Code by merging a shiftspace entry into ~/.claude.json
 */
export async function configureClaudeCode(): Promise<void> {
  const configPath = path.join(os.homedir(), '.claude.json');
  let config: Record<string, unknown> = {};

  try {
    const content = await fs.promises.readFile(configPath, 'utf-8');
    config = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // File doesn't exist or isn't valid JSON — start fresh
  }

  const servers = (config['mcpServers'] as Record<string, unknown>) ?? {};
  servers['shiftspace'] = buildMcpEntry();
  config['mcpServers'] = servers;

  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Configure Cursor by merging a shiftspace entry into .cursor/mcp.json
 * in the given workspace root.
 */
export async function configureCursor(workspaceRoot: string): Promise<void> {
  const configDir = path.join(workspaceRoot, '.cursor');
  const configPath = path.join(configDir, 'mcp.json');
  let config: Record<string, unknown> = {};

  await fs.promises.mkdir(configDir, { recursive: true });

  try {
    const content = await fs.promises.readFile(configPath, 'utf-8');
    config = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // File doesn't exist or isn't valid JSON — start fresh
  }

  const servers = (config['mcpServers'] as Record<string, unknown>) ?? {};
  servers['shiftspace'] = buildMcpEntry();
  config['mcpServers'] = servers;

  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

function buildMcpEntry(): McpServerEntry {
  return {
    command: 'node',
    args: [MCP_SERVER_PATH],
  };
}
