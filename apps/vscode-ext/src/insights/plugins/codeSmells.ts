// The codeSmells plugin is registered as a side-effect when @shiftspace/core
// is imported (core's index.ts includes `import './insights/plugins/codeSmells'`).
// This file exists for backwards compatibility with the side-effect import in
// ShiftspacePanel.ts. Importing @shiftspace/core anywhere triggers registration.
export {};
