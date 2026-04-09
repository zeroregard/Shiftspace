import React from 'react';
import { ActionsProvider } from '@shiftspace/renderer-core/src/ui/actions-context';
import { InspectionHoverContext } from '@shiftspace/renderer-core/src/shared/inspection-hover-context';
import * as RadixTooltip from '@radix-ui/react-tooltip';

/**
 * Wrapper for FolderNode tests.
 * Provides: ActionsProvider, 180px wide container.
 */
export function FolderNodeWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ActionsProvider>
      <div style={{ width: 180, padding: 8, background: 'var(--color-canvas)' }}>{children}</div>
    </ActionsProvider>
  );
}

/**
 * Wrapper for FileNode tests.
 * Provides: RadixTooltip.Provider, ActionsProvider, InspectionHoverContext, 180px wide container.
 */
export function FileNodeWrapper({
  children,
  hoveredFilePath = null,
}: {
  children: React.ReactNode;
  hoveredFilePath?: string | null;
}) {
  return (
    <RadixTooltip.Provider>
      <ActionsProvider>
        <InspectionHoverContext.Provider value={{ hoveredFilePath }}>
          <div style={{ width: 180, padding: 8, background: 'var(--color-canvas)' }}>
            {children}
          </div>
        </InspectionHoverContext.Provider>
      </ActionsProvider>
    </RadixTooltip.Provider>
  );
}

/**
 * Wrapper for FileListPanel tests.
 * Provides: RadixTooltip.Provider, ActionsProvider, 350x500 flex container.
 */
export function FileListPanelWrapper({ children }: { children: React.ReactNode }) {
  return (
    <RadixTooltip.Provider>
      <ActionsProvider>
        <div
          style={{
            width: 350,
            height: 500,
            background: 'var(--color-canvas)',
            display: 'flex',
          }}
        >
          {children}
        </div>
      </ActionsProvider>
    </RadixTooltip.Provider>
  );
}

/**
 * Wrapper for WorktreeCard tests.
 * Provides: RadixTooltip.Provider, ActionsProvider, padded container.
 */
export function WorktreeCardWrapper({ children }: { children: React.ReactNode }) {
  return (
    <RadixTooltip.Provider>
      <ActionsProvider>
        <div style={{ padding: 16, background: 'var(--color-canvas)' }}>{children}</div>
      </ActionsProvider>
    </RadixTooltip.Provider>
  );
}

/**
 * Wrapper for ActionBar and DiffPopover tests.
 * Provides: RadixTooltip.Provider, ActionsProvider, padded container.
 */
export function ActionBarWrapper({ children }: { children: React.ReactNode }) {
  return (
    <RadixTooltip.Provider>
      <ActionsProvider>
        <div style={{ padding: 8, background: 'var(--color-canvas)' }}>{children}</div>
      </ActionsProvider>
    </RadixTooltip.Provider>
  );
}

/**
 * Wrapper for DiffPopover tests.
 * Provides: RadixTooltip.Provider, ActionsProvider, padded container (16px).
 */
export function DiffPopoverWrapper({ children }: { children: React.ReactNode }) {
  return (
    <RadixTooltip.Provider>
      <ActionsProvider>
        <div style={{ padding: 16, background: 'var(--color-canvas)' }}>{children}</div>
      </ActionsProvider>
    </RadixTooltip.Provider>
  );
}

/**
 * Wrapper for UnifiedHeader tests.
 * Provides: RadixTooltip.Provider, ActionsProvider, 800px wide container.
 */
export function UnifiedHeaderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <RadixTooltip.Provider>
      <ActionsProvider>
        <div style={{ width: 800, background: 'var(--color-canvas)' }}>{children}</div>
      </ActionsProvider>
    </RadixTooltip.Provider>
  );
}
