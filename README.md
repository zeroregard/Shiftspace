# Shiftspace

Shiftspace is a VSCode extension that helps you with two things:
1. Have an overview of work trees and a way to manage them
2. Dive into worktree branches and spot problems


## Work tree management (Grove view)
Watch all your work trees, run checks on a high level, rename work trees, change branches, swap with your primary work tree:
<img width="860" height="626" alt="image" src="https://github.com/user-attachments/assets/e4efa0af-7452-4e4a-b1c2-5128e90f4dad" />

## Inspection view
A list + tree view of all changed files in a branch. You can choose to look at working changes, or all changes against e.g. `main` to have an overview of all files. 

<img width="864" height="705" alt="image" src="https://github.com/user-attachments/assets/79c07fc6-b1e5-4a38-9a8b-eef74e4aba24" />

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

<img width="318" height="119" alt="image" src="https://github.com/user-attachments/assets/e29e5ca0-bdaf-4646-b3d3-4001443b9d7b" />

