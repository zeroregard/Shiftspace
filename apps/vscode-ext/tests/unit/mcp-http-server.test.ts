import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'http';
import * as fs from 'fs';
import { ShiftspaceMcpHttpServer, LOCK_FILE, LOCK_DIR } from '../../src/mcp/http-server';
import type { McpToolHandlers } from '../../src/mcp/handlers';

function makeRequest(
  port: number,
  token: string,
  body: object
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/tool',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode!, body: JSON.parse(text) });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

describe('ShiftspaceMcpHttpServer', () => {
  let server: ShiftspaceMcpHttpServer;

  afterEach(async () => {
    if (server) await server.stop();
    // Clean up lock file
    try {
      fs.unlinkSync(LOCK_FILE);
    } catch {}
    try {
      fs.rmdirSync(LOCK_DIR);
    } catch {}
  });

  it('starts on a random port on localhost', async () => {
    server = new ShiftspaceMcpHttpServer();
    await server.start();
    const port = server.getPort();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it('writes lock file with correct port, token, and pid', async () => {
    server = new ShiftspaceMcpHttpServer();
    await server.start();

    const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
    expect(lock.port).toBe(server.getPort());
    expect(lock.token).toBe(server.getToken());
    expect(lock.pid).toBe(process.pid);
    expect(lock.startedAt).toBeTruthy();
  });

  it('lock file has restrictive permissions', async () => {
    server = new ShiftspaceMcpHttpServer();
    await server.start();

    const stat = fs.statSync(LOCK_FILE);
    // 0o600 = owner read/write only (on Linux/macOS)
    const perms = stat.mode & 0o777;
    expect(perms).toBe(0o600);
  });

  it('lock directory has restrictive permissions', async () => {
    server = new ShiftspaceMcpHttpServer();
    await server.start();

    const stat = fs.statSync(LOCK_DIR);
    const perms = stat.mode & 0o777;
    expect(perms).toBe(0o700);
  });

  it('returns 401 for requests without auth token', async () => {
    server = new ShiftspaceMcpHttpServer();
    await server.start();

    const result = await new Promise<{ status: number }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: server.getPort(),
          path: '/tool',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        (res) => {
          res.resume();
          resolve({ status: res.statusCode! });
        }
      );
      req.on('error', reject);
      req.write('{}');
      req.end();
    });

    expect(result.status).toBe(401);
  });

  it('returns 401 for requests with wrong token', async () => {
    server = new ShiftspaceMcpHttpServer();
    await server.start();

    const result = await makeRequest(server.getPort(), 'wrong-token', {
      tool: 'get_changed_files',
      params: {},
    });
    expect(result.status).toBe(401);
  });

  it('returns 404 for non /tool paths', async () => {
    server = new ShiftspaceMcpHttpServer();
    await server.start();

    const result = await new Promise<{ status: number }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: server.getPort(),
          path: '/other',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${server.getToken()}`,
          },
        },
        (res) => {
          res.resume();
          resolve({ status: res.statusCode! });
        }
      );
      req.on('error', reject);
      req.write('{}');
      req.end();
    });

    expect(result.status).toBe(404);
  });

  it('routes valid requests to handlers', async () => {
    server = new ShiftspaceMcpHttpServer();
    await server.start();

    const mockHandlers = {
      handleTool: async (tool: string, params: Record<string, unknown>) => ({
        tool,
        params,
        result: 'ok',
      }),
    } as McpToolHandlers;

    server.setHandlers(mockHandlers);

    const result = await makeRequest(server.getPort(), server.getToken(), {
      tool: 'get_changed_files',
      params: { cwd: '/tmp' },
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      tool: 'get_changed_files',
      params: { cwd: '/tmp' },
      result: 'ok',
    });
  });

  it('returns 503 when handlers not set', async () => {
    server = new ShiftspaceMcpHttpServer();
    await server.start();

    const result = await makeRequest(server.getPort(), server.getToken(), {
      tool: 'get_changed_files',
      params: {},
    });

    expect(result.status).toBe(503);
  });

  it('cleans up lock file on stop', async () => {
    server = new ShiftspaceMcpHttpServer();
    await server.start();
    expect(fs.existsSync(LOCK_FILE)).toBe(true);

    await server.stop();
    expect(fs.existsSync(LOCK_FILE)).toBe(false);
  });
});
