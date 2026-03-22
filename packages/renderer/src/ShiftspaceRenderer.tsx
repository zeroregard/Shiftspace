import React, { useEffect } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { WorktreeState, ShiftspaceEvent } from './types';
import { useShiftspaceStore } from './store';

interface Props {
  initialWorktrees?: WorktreeState[];
  onEvent?: (handler: (event: ShiftspaceEvent) => void) => () => void;
  onFileClick?: (worktreeId: string, filePath: string) => void;
  onTerminalOpen?: (worktreeId: string) => void;
}

export const ShiftspaceRenderer: React.FC<Props> = ({
  initialWorktrees = [],
  onEvent,
  onFileClick,
}) => {
  const { worktrees, setWorktrees, applyEvent } = useShiftspaceStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, , onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    setWorktrees(initialWorktrees);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!onEvent) return;
    return onEvent(applyEvent);
  }, [onEvent, applyEvent]);

  // Derive React Flow nodes from worktree state
  useEffect(() => {
    const wtArray = Array.from(worktrees.values());
    const newNodes = wtArray.flatMap((wt, wtIdx) => {
      const clusterX = wtIdx * 320;
      const clusterNode = {
        id: `wt-${wt.id}`,
        type: 'default',
        position: { x: clusterX, y: 0 },
        data: {
          label: (
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600, color: '#e0e0ff' }}>{wt.branch}</div>
              <div style={{ fontSize: 11, color: '#6b6b8a' }}>
                {wt.files.length} files · +{wt.files.reduce((s, f) => s + f.linesAdded, 0)} -
                {wt.files.reduce((s, f) => s + f.linesRemoved, 0)}
              </div>
              {wt.process && (
                <div style={{ fontSize: 10, color: '#4ec9b0', marginTop: 4 }}>
                  :{wt.process.port}
                </div>
              )}
            </div>
          ),
        },
        style: {
          background: '#1a1a2e',
          border: '1px solid #3a3a4a',
          borderRadius: 12,
          color: '#e0e0ff',
          width: 180,
        },
      };

      const fileNodes = wt.files.map((file, fileIdx) => {
        const fileName = file.path.split('/').pop() ?? file.path;
        const statusColors = { added: '#4ec94e', modified: '#e0c44e', deleted: '#e05c5c' };
        return {
          id: `file-${wt.id}-${file.path}`,
          type: 'default',
          position: { x: clusterX + (fileIdx % 2) * 200, y: 120 + Math.floor(fileIdx / 2) * 90 },
          data: {
            label: (
              <div
                style={{ cursor: 'pointer', textAlign: 'left' }}
                onClick={() => onFileClick?.(wt.id, file.path)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: statusColors[file.status],
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ fontSize: 12, color: '#c0c0e0' }}>{fileName}</span>
                </div>
                <div style={{ fontSize: 10, color: '#6b6b8a', marginTop: 2 }}>
                  <span style={{ color: '#4ec94e' }}>+{file.linesAdded}</span>{' '}
                  <span style={{ color: '#e05c5c' }}>-{file.linesRemoved}</span>
                </div>
              </div>
            ),
          },
          style: {
            background: '#141428',
            border: `1px solid ${file.staged ? '#4a6baa' : '#3a3a4a'}`,
            borderRadius: 6,
            color: '#c0c0e0',
            opacity: file.staged ? 1 : 0.75,
            width: 160,
          },
        };
      });

      return [clusterNode, ...fileNodes];
    });

    setNodes(newNodes);
  }, [worktrees, onFileClick, setNodes]);

  return (
    <div style={{ width: '100%', height: '100%', background: '#0d0d1a' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        colorMode="dark"
      >
        <Background color="#2a2a3a" gap={24} />
        <Controls />
      </ReactFlow>
    </div>
  );
};
