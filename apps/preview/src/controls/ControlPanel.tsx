import React, { useState } from 'react';
import type { MockEngine } from '../mock/engine';
import type { AgentPersona } from '../mock/types';
import { WORKTREE_PRESETS } from '../mock/templates';

interface Props {
  engine: MockEngine;
  worktreeIds: string[];
  onReset: () => void;
  onAddWorktree: () => void;
  onRemoveWorktree: (id: string) => void;
}

const PERSONAS: AgentPersona[] = ['refactor', 'feature', 'bugfix'];
const PERSONA_LABELS: Record<AgentPersona, string> = {
  refactor: 'Refactor',
  feature: 'Feature',
  bugfix: 'Bugfix',
};

export const ControlPanel: React.FC<Props> = ({
  engine,
  worktreeIds,
  onReset,
  onAddWorktree,
  onRemoveWorktree,
}) => {
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [agentStates, setAgentStates] = useState<Record<string, AgentPersona | null>>({});

  const handleSpeedChange = (val: number) => {
    setSpeed(val);
    engine.setSpeed(val);
  };

  const handlePause = () => {
    const next = !paused;
    setPaused(next);
    engine.setPaused(next);
  };

  const toggleAgent = (worktreeId: string, persona: AgentPersona) => {
    const current = agentStates[worktreeId];
    if (current === persona) {
      engine.stopAgent(worktreeId);
      setAgentStates((s) => ({ ...s, [worktreeId]: null }));
    } else {
      engine.startAgent(worktreeId, persona);
      setAgentStates((s) => ({ ...s, [worktreeId]: persona }));
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        background: '#16162a',
        border: '1px solid #3a3a5a',
        borderRadius: 12,
        padding: 16,
        width: 280,
        color: '#c0c0e0',
        fontFamily: 'monospace',
        fontSize: 12,
        zIndex: 1000,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: '#e0e0ff' }}>
        Shiftspace Controls
      </div>

      {/* Speed */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, color: '#8a8ab0' }}>
          Speed: {speed.toFixed(1)}x
        </label>
        <input
          type="range"
          min={0.1}
          max={5}
          step={0.1}
          value={speed}
          onChange={(e) => handleSpeedChange(Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      {/* Pause / Reset */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={handlePause} style={btnStyle(paused ? '#4a6baa' : '#2a2a4a')}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button onClick={onReset} style={btnStyle('#3a1a1a')}>
          Reset
        </button>
        <button onClick={onAddWorktree} style={btnStyle('#1a3a1a')}>
          + Worktree
        </button>
      </div>

      {/* Worktree agent controls */}
      <div>
        {worktreeIds.map((id) => (
          <div
            key={id}
            style={{
              marginBottom: 8,
              paddingBottom: 8,
              borderBottom: '1px solid #2a2a3a',
            }}
          >
            <div style={{ color: '#8a8ab0', marginBottom: 4, fontSize: 10 }}>{id}</div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {PERSONAS.map((persona) => (
                <button
                  key={persona}
                  onClick={() => toggleAgent(id, persona)}
                  style={btnStyle(agentStates[id] === persona ? '#4a3a8a' : '#2a2a4a', 10)}
                >
                  {PERSONA_LABELS[persona]}
                </button>
              ))}
              <button onClick={() => onRemoveWorktree(id)} style={btnStyle('#3a1a1a', 10)}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, fontSize: 10, color: '#4a4a6a' }}>
        {WORKTREE_PRESETS.length} presets available
      </div>
    </div>
  );
};

function btnStyle(bg: string, fontSize = 11): React.CSSProperties {
  return {
    background: bg,
    border: '1px solid #4a4a6a',
    borderRadius: 6,
    color: '#c0c0e0',
    cursor: 'pointer',
    fontSize,
    padding: '4px 8px',
    flex: 1,
  };
}
