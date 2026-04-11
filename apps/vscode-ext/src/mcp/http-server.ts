import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { McpToolHandlers } from './handlers';
import { reportError } from '../telemetry';

interface McpLock {
  port: number;
  token: string;
  pid: number;
  startedAt: string;
}

export const LOCK_DIR = path.join(os.homedir(), '.shiftspace');
export const LOCK_FILE = path.join(LOCK_DIR, 'mcp-lock.json');

export class ShiftspaceMcpHttpServer {
  private server: http.Server | null = null;
  private token = '';
  private port = 0;
  private handlers: McpToolHandlers | null = null;

  getPort(): number {
    return this.port;
  }

  getToken(): string {
    return this.token;
  }

  setHandlers(handlers: McpToolHandlers): void {
    this.handlers = handlers;
  }

  async start(): Promise<void> {
    this.token = crypto.randomBytes(32).toString('hex');

    this.server = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(0, '127.0.0.1', () => {
        this.port = (this.server!.address() as { port: number }).port;
        resolve();
      });
    });

    await this.writeLockFile();
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }
    await this.removeLockFile();
  }

  private async writeLockFile(): Promise<void> {
    await fs.promises.mkdir(LOCK_DIR, { recursive: true, mode: 0o700 });

    const lock: McpLock = {
      port: this.port,
      token: this.token,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    };

    await fs.promises.writeFile(LOCK_FILE, JSON.stringify(lock, null, 2), { mode: 0o600 });
  }

  private async removeLockFile(): Promise<void> {
    try {
      await fs.promises.unlink(LOCK_FILE);
    } catch {
      // File may already be gone
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Only accept POST to /tool
    if (req.method !== 'POST' || req.url !== '/tool') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Auth check
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${this.token}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    if (!this.handlers) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Handlers not initialized' }));
      return;
    }

    let body: string;
    try {
      body = await this.readBody(req);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
      return;
    }

    let tool: string;
    let params: Record<string, unknown>;
    try {
      const parsed = JSON.parse(body);
      tool = parsed.tool;
      params = parsed.params ?? {};
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    try {
      const result = await this.handlers.handleTool(tool, params);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err: unknown) {
      console.error('[MCP HTTP] Tool handler error:', err);
      reportError(err as Error, { context: 'mcpHttpServer', tool });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
      req.on('error', reject);
    });
  }
}
