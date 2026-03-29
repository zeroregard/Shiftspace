/**
 * Resolve a command template, substituting {package} with the given package name.
 * Returns null if the template contains {package} but no package is selected.
 */
export function resolveCommand(template: string, packageName: string): string | null {
  if (template.includes('{package}')) {
    if (!packageName) return null;
    return template.replace(/\{package\}/g, packageName);
  }
  return template;
}

/** Check if a command template requires a package selection */
export function requiresPackage(template: string): boolean {
  return template.includes('{package}');
}
