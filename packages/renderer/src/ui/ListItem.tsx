import React from 'react';
import clsx from 'clsx';

interface ListItemProps {
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  selected?: boolean;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Clickable list row used for file lists, branch lists, and package lists.
 * Provides consistent hover/selected states.
 *
 * Usage:
 *   <ListItem onClick={handleClick} selected={isSelected}>
 *     <FileIcon /> <span>index.ts</span>
 *   </ListItem>
 */
export const ListItem = React.memo(
  ({
    onClick,
    onMouseEnter,
    onMouseLeave,
    selected,
    active,
    children,
    className,
  }: ListItemProps) => (
    <button
      className={clsx(
        'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left transition-colors',
        onClick ? 'cursor-pointer' : 'cursor-default',
        selected ? 'bg-node-file-pulse text-text-primary' : 'hover:bg-node-file-pulse',
        active && 'bg-node-file-pulse',
        className
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </button>
  )
);
ListItem.displayName = 'ListItem';
