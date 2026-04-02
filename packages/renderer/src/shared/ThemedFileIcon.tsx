import React from 'react';
import { useWorktreeStore } from '../store';
import { FileIcon } from '../ui/FileIcons';

interface ThemedFileIconProps {
  /** Relative file path — used to look up the icon map. */
  filePath: string;
  /** Pixel size for both width/height. */
  size: number;
}

/**
 * Renders the VSCode-themed icon for a file when available (extension host
 * sends an icon-theme message), falling back to the built-in FileIcon SVG.
 */
export const ThemedFileIcon = React.memo(({ filePath, size }: ThemedFileIconProps) => {
  const iconSrc = useWorktreeStore((s) => s.iconMap[filePath]?.dark);
  const fileName = filePath.split('/').pop() ?? filePath;

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

  return <FileIcon filename={fileName} size={size} />;
});

ThemedFileIcon.displayName = 'ThemedFileIcon';
