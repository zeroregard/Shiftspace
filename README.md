# Shiftspace

Shiftspace is a VSCode extension that helps you with two things:

1. Have an overview of work trees and a way to manage them
2. Dive into worktree branches and spot problems

## Work tree management

Watch all your work trees, run checks on a high level, rename work trees, change branches, swap with your primary work tree:

<img width="2140" height="792" alt="image" src="https://github.com/user-attachments/assets/416be536-148f-4e2d-b33b-bd7c8a6df726" />

You can access the work trees from primary side bar tab as well:
<img width="388" height="387" alt="image" src="https://github.com/user-attachments/assets/9e3688bf-7bb7-48ea-b7b5-dbcbf5fb3111" />

## Inspection view

A list + tree view of all changed files in a branch. You can choose to look at working changes, or all changes against e.g. `main` to have an overview of all files.

<img width="3024" height="1648" alt="image" src="https://github.com/user-attachments/assets/16dace98-a738-446b-bc5b-1e7166226dd7" />

## Insights

Shiftspace can be configured (`.shiftspace.json`) to highlight changes in files that linting will not catch for you, for example, lint disables.

```json
  "smells": [
    {
      "id": "eslint-disable",
      "label": "ESLint Disable",
      "pattern": "eslint-disable",
      "threshold": 1,
      "fileTypes": [".js", ".jsx", ".ts", ".tsx"]
    },
    {
      "id": "llm-comment",
      "label": "LLM Comment",
      "pattern": "// ---------------------------------------------------------------------------",
      "threshold": "1"
    },
    ...
```

These code smells are higlighted in the aforementioend inspection view. This helps you review your agent code before opening a pull request.

<img width="236" height="84" alt="image" src="https://github.com/user-attachments/assets/a52c1cf2-ced9-44a9-bae8-3c6b6a1c30b7" />
