import React, { useState, useEffect } from 'react';
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
  refactor: 'refactor',
  feature: 'feature',
  bugfix: 'bugfix',
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
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768);

  // Auto-collapse on mobile
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: 'fixed',
          bottom: 12,
          right: 12,
          background: 'rgba(0, 0, 0, 0.7)',
          border: '1px solid rgba(0, 255, 0, 0.3)',
          borderRadius: 4,
          color: '#00ff00',
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: 10,
          fontWeight: 700,
          padding: '4px 8px',
          cursor: 'pointer',
          zIndex: 1000,
          letterSpacing: 1,
        }}
      >
        DEBUG
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        background: 'rgba(0, 0, 0, 0.75)',
        border: '1px solid rgba(0, 255, 0, 0.25)',
        borderRadius: 2,
        padding: '8px 10px',
        width: 260,
        color: 'rgba(0, 255, 0, 0.8)',
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 11,
        zIndex: 1000,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* Header with DEBUG badge and collapse button */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: '1px solid rgba(0, 255, 0, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              background: 'rgba(0, 255, 0, 0.15)',
              border: '1px solid rgba(0, 255, 0, 0.4)',
              borderRadius: 2,
              padding: '1px 5px',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 1,
              color: '#00ff00',
            }}
          >
            DEBUG
          </span>
          <span style={{ fontSize: 10, color: 'rgba(0, 255, 0, 0.5)' }}>simulation</span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(0, 255, 0, 0.5)',
            cursor: 'pointer',
            fontSize: 14,
            padding: '0 2px',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Speed */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: 'rgba(0, 255, 0, 0.4)', marginBottom: 2 }}>
          speed: {speed.toFixed(1)}x
        </div>
        <input
          type="range"
          min={0.1}
          max={5}
          step={0.1}
          value={speed}
          onChange={(e) => handleSpeedChange(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#00ff00', height: 2 }}
        />
      </div>

      {/* Pause / Reset / Add */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <button onClick={handlePause} style={dbgBtn(paused)}>
          {paused ? '▶ resume' : '⏸ pause'}
        </button>
        <button onClick={onReset} style={dbgBtn(false)}>
          ↻ reset
        </button>
        <button onClick={onAddWorktree} style={dbgBtn(false)}>
          + wt
        </button>
      </div>

      {/* Worktree agent controls */}
      <div>
        {worktreeIds.map((id) => (
          <div
            key={id}
            style={{
              marginBottom: 4,
              paddingBottom: 4,
              borderBottom: '1px solid rgba(0, 255, 0, 0.08)',
            }}
          >
            <div style={{ fontSize: 9, color: 'rgba(0, 255, 0, 0.4)', marginBottom: 2 }}>
              {id}
            </div>
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {PERSONAS.map((persona) => (
                <button
                  key={persona}
                  onClick={() => toggleAgent(id, persona)}
                  style={dbgBtn(agentStates[id] === persona, 9)}
                >
                  {PERSONA_LABELS[persona]}
                </button>
              ))}
              <button onClick={() => onRemoveWorktree(id)} style={dbgBtn(false, 9)}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 4, fontSize: 9, color: 'rgba(0, 255, 0, 0.25)' }}>
        {WORKTREE_PRESETS.length} presets available
      </div>
    </div>
  );
};

function dbgBtn(active: boolean, fontSize = 10): React.CSSProperties {
  return {
    background: active ? 'rgba(0, 255, 0, 0.15)' : 'rgba(0, 255, 0, 0.05)',
    border: `1px solid rgba(0, 255, 0, ${active ? '0.4' : '0.15'})`,
    borderRadius: 2,
    color: active ? '#00ff00' : 'rgba(0, 255, 0, 0.6)',
    cursor: 'pointer',
    fontSize,
    fontFamily: '"Courier New", Courier, monospace',
    padding: '2px 6px',
    flex: 1,
  };
}
