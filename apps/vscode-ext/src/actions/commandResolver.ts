/**
 * Validate that a package name contains only safe characters.
 * Allows scoped npm packages like @scope/name and typical package names.
 */
function isSafePackageName(name: string): boolean {
  return /^[@a-zA-Z0-9][@a-zA-Z0-9._\-/]*$/.test(name);
}

/**
 * Resolve a command template, substituting {package} with the given package name.
 * Returns null if the template contains {package} but no package is selected
 * or if the package name contains unsafe characters.
 */
export function resolveCommand(template: string, packageName: string): string | null {
  if (template.includes('{package}')) {
    if (!packageName) return null;
    if (!isSafePackageName(packageName)) return null;
    return template.replace(/\{package\}/g, packageName);
  }
  return template;
}

/** Check if a command template requires a package selection */
export function requiresPackage(template: string): boolean {
  return template.includes('{package}');
}
