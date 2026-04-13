/**
 * ConfirmPopover — small inline confirmation popover anchored to a trigger.
 *
 * Use this instead of a native VSCode modal for routine confirmations so the
 * user's focus stays in the workspace.
 *
 *   <ConfirmPopover
 *     title="Delete worktree foo?"
 *     description="Uncommitted changes will be lost."
 *     confirmLabel="Delete"
 *     confirmIcon="trash"
 *     danger
 *     onConfirm={() => actions.removeWorktree(wt.id)}
 *   >
 *     <IconButton icon="trash" label="Remove worktree" danger />
 *   </ConfirmPopover>
 */
import { useState, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Button } from '@shiftspace/ui/button';

interface ConfirmPopoverProps {
  /** The trigger element (rendered via Popover.Trigger asChild). */
  children: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmIcon?: string;
  danger?: boolean;
  onConfirm: () => void;
  align?: 'start' | 'center' | 'end';
}

export function ConfirmPopover({
  children,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmIcon,
  danger = false,
  onConfirm,
  align = 'end',
}: ConfirmPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-50 w-64 rounded-lg border border-border-default bg-node-file p-3 shadow-lg animate-popover-open flex flex-col gap-2"
          align={align}
          sideOffset={4}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="text-12 text-text-primary">{title}</div>
          {description && <div className="text-11 text-text-muted">{description}</div>}
          <div className="flex justify-end gap-1.5 mt-1">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {cancelLabel}
            </Button>
            <Button
              size="sm"
              variant={danger ? 'danger' : 'primary'}
              icon={confirmIcon}
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
