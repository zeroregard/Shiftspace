import type { FileChange } from '../types';

export const STATUS_CLASSES: Record<FileChange['status'], string> = {
  added:    'bg-status-added',
  modified: 'bg-status-modified',
  deleted:  'bg-status-deleted',
};
