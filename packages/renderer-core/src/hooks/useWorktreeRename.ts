import React, { useState, useRef } from 'react';
import { useActions } from '../ui/ActionsContext';

interface WorktreeRenameState {
  isRenaming: boolean;
  renameValue: string;
  renameInputRef: React.RefObject<HTMLInputElement>;
  setRenameValue: (value: string) => void;
  startRename: () => void;
  commitRename: () => void;
  cancelRename: () => void;
}

/**
 * Encapsulates the rename-worktree interaction:
 * toggling edit mode, tracking the input value, and committing / cancelling.
 */
export function useWorktreeRename(worktreeId: string, currentName: string): WorktreeRenameState {
  const actions = useActions();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null!);

  const startRename = () => {
    setRenameValue(currentName);
    setIsRenaming(true);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== currentName) {
      actions.renameWorktree(worktreeId, trimmed);
    }
    setIsRenaming(false);
  };

  const cancelRename = () => {
    setIsRenaming(false);
  };

  return {
    isRenaming,
    renameValue,
    renameInputRef,
    setRenameValue,
    startRename,
    commitRename,
    cancelRename,
  };
}
