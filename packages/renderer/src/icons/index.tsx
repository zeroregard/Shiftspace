import React from 'react';

// ---------------------------------------------------------------------------
// UI icons — rendered as Codicons (requires codicon.css to be loaded by host)
// ---------------------------------------------------------------------------

export function GitBranchIcon() {
  return <i className="codicon codicon-git-branch" style={{ fontSize: 12 }} aria-hidden="true" />;
}

export function GitCompareIcon() {
  return <i className="codicon codicon-git-compare" style={{ fontSize: 12 }} aria-hidden="true" />;
}

export function RefreshIcon() {
  return <i className="codicon codicon-refresh" style={{ fontSize: 11 }} aria-hidden="true" />;
}

export function SwapIcon() {
  return <i className="codicon codicon-arrow-swap" style={{ fontSize: 12 }} aria-hidden="true" />;
}

export function TrashIcon() {
  return <i className="codicon codicon-trash" style={{ fontSize: 12 }} aria-hidden="true" />;
}

export function PencilIcon() {
  return <i className="codicon codicon-edit" style={{ fontSize: 12 }} aria-hidden="true" />;
}

export function CheckIcon() {
  return <i className="codicon codicon-check" style={{ fontSize: 12 }} aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// SVG base shapes
// ---------------------------------------------------------------------------

interface FileShapeProps {
  /** Main fill color */
  color: string;
  /** Optional 1-2 char abbreviation rendered inside the icon */
  abbrev?: string;
  size: number;
}

const FileIconSvg: React.FC<FileShapeProps> = ({ color, abbrev, size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    {/* Document body */}
    <path
      d="M2 1.5H8L12 5.5V12.5C12 12.8 11.8 13 11.5 13H2.5C2.2 13 2 12.8 2 12.5V1.5Z"
      fill={color}
    />
    {/* Fold crease */}
    <path d="M8 1.5V5.5H12" stroke="rgba(0,0,0,0.25)" strokeWidth="0.75" />
    {/* Fold highlight */}
    <path d="M8 1.5L12 5.5H8V1.5Z" fill="rgba(255,255,255,0.12)" />
    {abbrev && (
      <text
        x="7"
        y="11"
        textAnchor="middle"
        fontSize="5"
        fontWeight="700"
        fill="rgba(255,255,255,0.88)"
        fontFamily="system-ui, -apple-system, monospace"
      >
        {abbrev}
      </text>
    )}
  </svg>
);

interface FolderShapeProps {
  color: string;
  size: number;
}

const FolderIconSvg: React.FC<FolderShapeProps> = ({ color, size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    {/* Folder tab */}
    <path
      d="M1 6V4.5C1 4.2 1.2 4 1.5 4H5.5L7 2.5H12.5C12.8 2.5 13 2.7 13 3V6"
      fill={color}
      fillOpacity="0.75"
    />
    {/* Folder body */}
    <path d="M1 6H13V12.5C13 12.8 12.8 13 12.5 13H1.5C1.2 13 1 12.8 1 12.5V6Z" fill={color} />
  </svg>
);

// ---------------------------------------------------------------------------
// File type config
// ---------------------------------------------------------------------------

interface FileConfig {
  color: string;
  abbrev?: string;
}

// Extension → color + optional 2-char abbreviation
const EXT_MAP: Record<string, FileConfig> = {
  ts: { color: '#3178C6', abbrev: 'TS' },
  tsx: { color: '#3178C6', abbrev: 'TX' },
  js: { color: '#CBCB41', abbrev: 'JS' },
  jsx: { color: '#CBCB41', abbrev: 'JX' },
  mjs: { color: '#CBCB41', abbrev: 'JS' },
  cjs: { color: '#CBCB41', abbrev: 'JS' },
  css: { color: '#519ABA' },
  scss: { color: '#C563BD' },
  sass: { color: '#C563BD' },
  less: { color: '#2A5FAD' },
  json: { color: '#BD8E2D' },
  md: { color: '#519ABA' },
  mdx: { color: '#519ABA' },
  html: { color: '#DE7548' },
  htm: { color: '#DE7548' },
  svg: { color: '#E2803B' },
  png: { color: '#A57FE6' },
  jpg: { color: '#A57FE6' },
  jpeg: { color: '#A57FE6' },
  gif: { color: '#A57FE6' },
  webp: { color: '#A57FE6' },
  ico: { color: '#A57FE6' },
  yaml: { color: '#CB2027' },
  yml: { color: '#CB2027' },
  toml: { color: '#888888' },
  env: { color: '#ECC94B' },
  lock: { color: '#BBBBBB' },
  sh: { color: '#4AA163' },
  bash: { color: '#4AA163' },
  py: { color: '#3572A5' },
  rs: { color: '#DEA584' },
  go: { color: '#00ACD7' },
  sql: { color: '#E38C00' },
};

// Special filenames (checked before extension)
const FILENAME_MAP: Record<string, FileConfig> = {
  'package.json': { color: '#CB3837' },
  'package-lock.json': { color: '#CB3837' },
  'tsconfig.json': { color: '#3178C6', abbrev: 'TS' },
  'tsconfig.base.json': { color: '#3178C6', abbrev: 'TS' },
  'vite.config.ts': { color: '#646CFF' },
  'vite.config.js': { color: '#646CFF' },
  'next.config.ts': { color: '#888888' },
  'next.config.js': { color: '#888888' },
  'next.config.mjs': { color: '#888888' },
  '.prettierrc': { color: '#C188C1' },
  '.prettierrc.js': { color: '#C188C1' },
  '.prettierrc.json': { color: '#C188C1' },
  '.eslintrc': { color: '#4B32C3' },
  '.eslintrc.js': { color: '#4B32C3' },
  '.eslintrc.json': { color: '#4B32C3' },
  '.eslintrc.cjs': { color: '#4B32C3' },
  'eslint.config.js': { color: '#4B32C3' },
  'eslint.config.ts': { color: '#4B32C3' },
  'readme.md': { color: '#519ABA' },
  license: { color: '#BBBBBB' },
  licence: { color: '#BBBBBB' },
  dockerfile: { color: '#2496ED' },
  'docker-compose.yml': { color: '#2496ED' },
  'docker-compose.yaml': { color: '#2496ED' },
  '.gitignore': { color: '#F44D27' },
  '.gitattributes': { color: '#F44D27' },
  '.env': { color: '#ECC94B' },
  '.env.local': { color: '#ECC94B' },
  '.env.example': { color: '#ECC94B' },
  'turbo.json': { color: '#EF4444' },
  'tailwind.config.ts': { color: '#38BDF8' },
  'tailwind.config.js': { color: '#38BDF8' },
};

const GENERIC_FILE: FileConfig = { color: '#9090A0' };

// ---------------------------------------------------------------------------
// Folder type config
// ---------------------------------------------------------------------------

const FOLDER_MAP: Record<string, string> = {
  src: '#4B9EE0',
  source: '#4B9EE0',
  lib: '#89C06D',
  libs: '#89C06D',
  app: '#A57FE6',
  apps: '#A57FE6',
  api: '#E06C6C',
  pages: '#A57FE6',
  components: '#4B9EE0',
  hooks: '#89C06D',
  utils: '#88A0A8',
  utility: '#88A0A8',
  helpers: '#88A0A8',
  store: '#E0A84B',
  stores: '#E0A84B',
  context: '#E0A84B',
  public: '#C9A44A',
  static: '#C9A44A',
  assets: '#C9A44A',
  images: '#A57FE6',
  icons: '#A57FE6',
  fonts: '#C9A44A',
  styles: '#C563BD',
  css: '#519ABA',
  test: '#89C06D',
  tests: '#89C06D',
  __tests__: '#89C06D',
  __test__: '#89C06D',
  spec: '#89C06D',
  e2e: '#89C06D',
  config: '#808080',
  configs: '#808080',
  '.github': '#808080',
  '.vscode': '#4B9EE0',
  scripts: '#89C06D',
  types: '#3178C6',
  node_modules: '#3D3D3D',
  dist: '#C0601A',
  build: '#C0601A',
  out: '#C0601A',
  '.next': '#888888',
  '.turbo': '#EF4444',
  coverage: '#808080',
  mock: '#808080',
  mocks: '#808080',
  __mocks__: '#808080',
  layout: '#A57FE6',
  layouts: '#A57FE6',
  engine: '#E0A84B',
  controls: '#88A0A8',
};

const GENERIC_FOLDER_COLOR = '#788090';

// ---------------------------------------------------------------------------
// Public lookup functions
// ---------------------------------------------------------------------------

export function getFileIconConfig(filename: string): FileConfig {
  const lower = filename.toLowerCase();
  if (FILENAME_MAP[lower]) return FILENAME_MAP[lower];

  const ext = lower.includes('.') ? lower.split('.').pop()! : '';
  return EXT_MAP[ext] ?? GENERIC_FILE;
}

export function getFolderIconColor(folderName: string): string {
  const lower = folderName.toLowerCase();
  return FOLDER_MAP[lower] ?? FOLDER_MAP[folderName] ?? GENERIC_FOLDER_COLOR;
}

// ---------------------------------------------------------------------------
// React components for use in nodes
// ---------------------------------------------------------------------------

export interface FileIconProps {
  filename: string;
  size?: number;
}

export const FileIcon: React.FC<FileIconProps> = React.memo(({ filename, size = 14 }) => {
  const { color, abbrev } = getFileIconConfig(filename);
  return <FileIconSvg color={color} abbrev={abbrev} size={size} />;
});
FileIcon.displayName = 'FileIcon';

export interface FolderIconProps {
  name: string;
  size?: number;
}

export const FolderIcon: React.FC<FolderIconProps> = React.memo(({ name, size = 14 }) => {
  const color = getFolderIconColor(name);
  return <FolderIconSvg color={color} size={size} />;
});
FolderIcon.displayName = 'FolderIcon';
