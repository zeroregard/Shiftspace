import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ShiftspaceRenderer } from '@shiftspace/renderer';
import type { ShiftspaceEvent } from '@shiftspace/renderer';
import { MockEngine } from './mock/engine';
import { ControlPanel } from './controls/ControlPanel';

export const App: React.FC = () => {
  const engineRef = useRef<MockEngine | null>(null);
  const [worktreeIds, setWorktreeIds] = useState<string[]>([]);
  const [resetKey, setResetKey] = useState(0);

  if (!engineRef.current) {
    engineRef.current = new MockEngine();
  }

  useEffect(() => {
    const engine = engineRef.current!;
    setWorktreeIds(engine.getWorktrees().map((wt) => wt.id));

    const unsub = engine.subscribe((event: ShiftspaceEvent) => {
      if (event.type === 'worktree-added') {
        setWorktreeIds((ids) => [...ids, event.worktree.id]);
      } else if (event.type === 'worktree-removed') {
        setWorktreeIds((ids) => ids.filter((id) => id !== event.worktreeId));
      }
    });

    return () => {
      unsub();
    };
  }, [resetKey]);

  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
    };
  }, []);

  const onEvent = useCallback(
    (handler: (event: ShiftspaceEvent) => void) => {
      return engineRef.current!.subscribe(handler);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resetKey]
  );

  const handleReset = () => {
    engineRef.current?.reset();
    setResetKey((k) => k + 1);
  };

  const handleAddWorktree = () => {
    const id = engineRef.current?.addPresetWorktree(worktreeIds.length);
    if (id) setWorktreeIds((ids) => [...ids, id]);
  };

  const handleRemoveWorktree = (id: string) => {
    engineRef.current?.removeWorktree(id);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <ShiftspaceRenderer
        key={resetKey}
        initialWorktrees={engineRef.current.getWorktrees()}
        onEvent={onEvent}
      />
      <ControlPanel
        engine={engineRef.current}
        worktreeIds={worktreeIds}
        onReset={handleReset}
        onAddWorktree={handleAddWorktree}
        onRemoveWorktree={handleRemoveWorktree}
      />
    </div>
  );
};
