import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Detect available packages in a monorepo from pnpm-workspace.yaml,
 * turbo.json, or package.json workspaces field.
 */
export async function detectPackages(repoRoot: string): Promise<string[]> {
  // Try pnpm workspaces first
  const pnpmPackages = await detectPnpmPackages(repoRoot);
  if (pnpmPackages.length > 0) return pnpmPackages;

  // Fall back to reading workspace globs from package.json
  const pkgJsonPackages = detectPackageJsonWorkspaces(repoRoot);
  if (pkgJsonPackages.length > 0) return pkgJsonPackages;

  // Fall back to turbo.json package detection
  return detectTurboPackages(repoRoot);
}

async function detectPnpmPackages(repoRoot: string): Promise<string[]> {
  const workspaceYaml = path.join(repoRoot, 'pnpm-workspace.yaml');
  if (!fs.existsSync(workspaceYaml)) return [];

  try {
    // Try pnpm list --json to get actual package names
    const { stdout } = await execFileAsync(
      'pnpm',
      ['list', '--filter', '*', '--depth', '-1', '--json'],
      {
        cwd: repoRoot,
        timeout: 10_000,
      }
    );
    const parsed = JSON.parse(stdout) as Array<{ name?: string }>;
    const names = parsed
      .map((p) => p.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0);
    if (names.length > 0) return names;
  } catch {
    // pnpm not available or failed — fall back to reading workspace.yaml globs
  }

  return readPnpmWorkspaceGlobs(repoRoot, workspaceYaml);
}

function readPnpmWorkspaceGlobs(repoRoot: string, workspaceYaml: string): string[] {
  try {
    const content = fs.readFileSync(workspaceYaml, 'utf8');
    // Parse globs from pnpm-workspace.yaml (simple line-based parsing)
    const globs: string[] = [];
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*-\s+['"]?([^'"#\n]+?)['"]?\s*$/);
      if (match?.[1]) globs.push(match[1].trim());
    }
    return resolvePackageNamesFromGlobs(repoRoot, globs);
  } catch {
    return [];
  }
}

function detectPackageJsonWorkspaces(repoRoot: string): string[] {
  const pkgJsonPath = path.join(repoRoot, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as {
      workspaces?: string[] | { packages?: string[] };
    };
    const globs: string[] = Array.isArray(pkg.workspaces)
      ? pkg.workspaces
      : (pkg.workspaces?.packages ?? []);
    return resolvePackageNamesFromGlobs(repoRoot, globs);
  } catch {
    return [];
  }
}

function detectTurboPackages(repoRoot: string): string[] {
  const turboPath = path.join(repoRoot, 'turbo.json');
  if (!fs.existsSync(turboPath)) return [];

  // With turbo, packages are in the workspace — scan for package.json files in apps/ and packages/
  const dirs = ['apps', 'packages'];
  const names: string[] = [];
  for (const dir of dirs) {
    const dirPath = path.join(repoRoot, dir);
    if (!fs.existsSync(dirPath)) continue;
    try {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const pkgJson = path.join(dirPath, entry.name, 'package.json');
        if (fs.existsSync(pkgJson)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8')) as { name?: string };
            if (pkg.name) names.push(pkg.name);
            else names.push(entry.name);
          } catch {
            names.push(entry.name);
          }
        }
      }
    } catch {
      // ignore readdir errors
    }
  }
  return names;
}

function resolvePackageNamesFromGlobs(repoRoot: string, globs: string[]): string[] {
  const names: string[] = [];
  for (const glob of globs) {
    // Simple glob resolution: handle `apps/*` and `packages/*` style globs
    const pattern = glob.replace(/\*/g, '');
    const dirPath = path.join(repoRoot, pattern);
    if (!fs.existsSync(dirPath)) continue;
    try {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const pkgJson = path.join(dirPath, entry.name, 'package.json');
        if (fs.existsSync(pkgJson)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8')) as { name?: string };
            if (pkg.name) names.push(pkg.name);
            else names.push(entry.name);
          } catch {
            names.push(entry.name);
          }
        }
      }
    } catch {
      // ignore
    }
  }
  return names;
}
