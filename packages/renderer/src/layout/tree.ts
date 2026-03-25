import type { FileChange } from '../types';

export interface TreeNode {
  id: string;
  kind: 'folder' | 'file';
  name: string;
  /** Relative path from worktree root — set for folder nodes. */
  path?: string;
  file?: FileChange;
  children: TreeNode[];
}

/** Build a proper folder hierarchy trie from flat file paths, then collapse
 *  single-chain intermediate folders. */
export function buildTree(wtId: string, files: FileChange[]): TreeNode[] {
  interface TrieNode {
    segment: string;
    children: Map<string, TrieNode>;
    files: FileChange[];
  }

  const root: TrieNode = { segment: '', children: new Map(), files: [] };

  for (const file of files) {
    const parts = file.path.split('/');
    const fileName = parts.pop()!;
    let cur = root;
    for (const part of parts) {
      let child = cur.children.get(part);
      if (!child) {
        child = { segment: part, children: new Map(), files: [] };
        cur.children.set(part, child);
      }
      cur = child;
    }
    cur.files.push({ ...file, path: file.path });
    void fileName;
  }

  function trieToTree(trie: TrieNode, pathPrefix: string): TreeNode[] {
    const results: TreeNode[] = [];

    for (const [_seg, child] of Array.from(trie.children.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      const folderPath = pathPrefix ? `${pathPrefix}/${child.segment}` : child.segment;

      let collapsed = child;
      let collapsedName = child.segment;
      let collapsedPath = folderPath;
      while (collapsed.children.size === 1 && collapsed.files.length === 0) {
        const onlyChild = Array.from(collapsed.children.values())[0];
        collapsedName = `${collapsedName}/${onlyChild.segment}`;
        collapsedPath = `${collapsedPath}/${onlyChild.segment}`;
        collapsed = onlyChild;
      }

      const folderNode: TreeNode = {
        id: `folder-${wtId}-${collapsedPath}`,
        kind: 'folder',
        name: collapsedName,
        path: collapsedPath,
        children: [],
      };

      // trieToTree already processes both sub-folders and direct files at
      // `collapsed`'s level — do not add files a second time here.
      folderNode.children.push(...trieToTree(collapsed, collapsedPath));

      results.push(folderNode);
    }

    for (const f of trie.files) {
      results.push({
        id: `file-${wtId}-${f.path}`,
        kind: 'file',
        name: f.path.split('/').pop() ?? f.path,
        file: f,
        children: [],
      });
    }

    return results;
  }

  return trieToTree(root, '');
}
