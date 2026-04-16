# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## JSON Editor - Tauri + React

A macOS desktop JSON editor application built with Tauri and React.

## Commands

```bash
# Development
npm run dev           # Start Vite dev server
npm run tauri:dev     # Start Tauri dev mode (requires Rust)

# Build
npm run build         # Build frontend
npm run tauri:build   # Build Tauri app (requires Rust)

# Lint
npm run lint
```

## Prerequisites

- Node.js 18+
- Rust (install via: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)

## Architecture

```
src/
├── components/
│   ├── JsonTree.tsx      # Left panel - JSON tree view (read-only)
│   ├── EditorPanel.tsx   # Right panel - object/array editor
│   └── Toolbar.tsx       # File operations and tools
├── hooks/
│   └── useJsonState.ts   # JSON state management
├── utils/
│   └── jsonUtils.ts      # JSON parsing and manipulation utilities
└── App.tsx               # Main app with layout toggle

src-tauri/
└── src/
    └── lib.rs            # Rust backend commands
```

## Features

- Open JSON files via dialog
- Left panel: formatted JSON tree with expand/collapse
- Right panel: edit selected node (object as key:value, array as table)
- Layout toggle: horizontal ↔ vertical
- Tools: remove escape (`\"` → `"`), copy compressed JSON
