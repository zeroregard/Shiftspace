import { IconButton } from '@shiftspace/ui/icon-button';
import { useActions } from '../ui/actions-context';

interface Props {
  worktreeId: string;
  url: string;
}

/**
 * Icon button that opens the worktree's related ticket (Jira / Linear / etc.)
 * in the browser. The URL is resolved from the global `ticketUrlTemplate`
 * setting; this component only renders when a resolvable URL exists.
 */
export function TicketLinkButton({ worktreeId, url }: Props) {
  const actions = useActions();
  return (
    <IconButton
      icon="link-external"
      label="Open ticket"
      size="sm"
      ghost
      data-testid={`ticket-link-${worktreeId}`}
      onClick={(e) => {
        e.stopPropagation();
        actions.openExternalUrl(url);
      }}
    />
  );
}
