#!/usr/bin/env node
/**
 * Standalone MCP server that bridges stdio ↔ HTTP.
 * Reads ~/.shiftspace/mcp-lock.json to find port + token of the running
 * Shiftspace VSCode extension HTTP API, then exposes MCP tools over stdio.
 *
 * Compiled separately from the extension and placed at ~/.shiftspace/mcp-server.mjs
 * so agents can reference a stable path.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface McpLock {
  port: number;
  token: string;
  pid: number;
  startedAt: string;
}

function readLockFile(): McpLock {
  const lockFile = path.join(os.homedir(), '.shiftspace', 'mcp-lock.json');
  try {
    return JSON.parse(fs.readFileSync(lockFile, 'utf-8')) as McpLock;
  } catch {
    throw new Error(
      'Shiftspace MCP lock file not found. Is the Shiftspace VSCode extension running?'
    );
  }
}

const TOOLS = [
  {
    name: 'get_insights',
    description:
      'Get code smells and diagnostics for the current worktree. Returns per-file findings including pattern-based code smell detections.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cwd: {
          type: 'string',
          description: 'Working directory (auto-detected if omitted)',
        },
      },
    },
  },
  {
    name: 'get_check_status',
    description:
      'Get the current pass/fail/stale status of all configured checks (format, lint, typecheck, test, etc.) for the current worktree.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cwd: {
          type: 'string',
          description: 'Working directory (auto-detected if omitted)',
        },
      },
    },
  },
  {
    name: 'run_check',
    description:
      'Run a specific check (e.g. "fmt", "lint", "test") and return the result including exit code and output.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        check_id: {
          type: 'string',
          description: 'The check ID from .shiftspace.json (e.g. "fmt", "lint", "test")',
        },
        cwd: {
          type: 'string',
          description: 'Working directory (auto-detected if omitted)',
        },
      },
      required: ['check_id'],
    },
  },
  {
    name: 'run_pipeline',
    description:
      'Run a full check pipeline (e.g. "verify": fmt → lint → typecheck → test) sequentially and return all results. Stops on first failure if the pipeline is configured with stopOnFailure.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pipeline_id: {
          type: 'string',
          description: 'Pipeline ID from .shiftspace.json (e.g. "verify")',
        },
        cwd: {
          type: 'string',
          description: 'Working directory (auto-detected if omitted)',
        },
      },
      required: ['pipeline_id'],
    },
  },
  {
    name: 'get_changed_files',
    description:
      'List all changed files in the current worktree with their status (modified/added/deleted) and line change counts.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cwd: {
          type: 'string',
          description: 'Working directory (auto-detected if omitted)',
        },
      },
    },
  },
];

async function callExtension(
  lock: McpLock,
  tool: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(`http://127.0.0.1:${lock.port}/tool`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${lock.token}`,
    },
    body: JSON.stringify({ tool, params }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shiftspace extension returned ${response.status}: ${text}`);
  }

  return response.json();
}

async function main(): Promise<void> {
  const lock = readLockFile();

  const server = new Server(
    { name: 'shiftspace', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await callExtension(lock, name, (args as Record<string, unknown>) ?? {});
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Shiftspace MCP server failed to start: ${err}\n`);
  process.exit(1);
});
