import React from 'react';
import { useWorktreeStore } from '../store';
import { FileIcon } from '@shiftspace/ui/file-icons';

interface ThemedFileIconProps {
  /** Relative file path — used to look up the icon map. */
  filePath: string;
  /** Pixel size for both width/height. */
  size: number;
}

/**
 * Renders the VSCode-themed icon for a file when available (extension host
 * sends an icon-theme message), falling back to the built-in FileIcon SVG.
 *
 * When a file's exact path isn't in the icon map (e.g. it just appeared),
 * we resolve via the pre-built icon index by filename or extension — since
 * icon themes resolve by name pattern, not path.
 */
export const ThemedFileIcon = React.memo(({ filePath, size }: ThemedFileIconProps) => {
  const iconSrc = useWorktreeStore((s) => {
    // Fast path: exact match by file path
    const exact = s.iconMap[filePath]?.dark;
    if (exact) return exact;

    // Resolve via the pre-built index (O(1) lookups)
    const fileName = filePath.split('/').pop() ?? filePath;
    const byName = s.iconIndex.byName.get(fileName);
    if (byName) return byName;

    const lastDot = fileName.lastIndexOf('.');
    if (lastDot !== -1) {
      const ext = fileName.slice(lastDot);
      const byExt = s.iconIndex.byExt.get(ext);
      if (byExt) return byExt;
    }

    return undefined;
  });

  if (iconSrc) {
    return (
      <img
        src={iconSrc}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        className="block shrink-0 mt-0.5"
      />
    );
  }

  const fileName = filePath.split('/').pop() ?? filePath;
  return <FileIcon filename={fileName} size={size} />;
});

ThemedFileIcon.displayName = 'ThemedFileIcon';
