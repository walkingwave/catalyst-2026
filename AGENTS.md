# UI changes

Before adding a UI feature, inspect the existing screen, nearby features, shared
components in `src/components/ui.tsx`, and tokens in `src/app/globals.css`.
Build on the current implementation and preserve existing workflows.

Keep BandDrop's design language: tonal surfaces, square controls, display
headings, compact labels, and mobile layouts with large touch targets. Reuse
`Panel`, `Button`, `Field`, `Input`, `SectionHeader`, `Badge`, and existing tab
patterns. Use theme tokens instead of new hard-coded colors. Long tab rows
should scroll within the screen instead of overflowing it.

Features shared by admin and staff should share a component, respect the current
event selector, and reset event-specific state when the event changes. Check
mobile overflow, loading/error states, and disabled actions.

Read the relevant installed Next.js guide in `node_modules/next/dist/docs/`
before changing framework behavior.
