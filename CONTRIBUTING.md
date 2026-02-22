# Contributing

## Lint

- **ESLint** runs in CI. Use `npm run lint` locally.
- **No new warnings.** The project uses `--max-warnings 107`. Do not increase this to absorb new warnings; fix or suppress new issues instead.
- To tighten the bar over time: fix a batch of warnings (e.g. one rule), then lower `--max-warnings` in `package.json` accordingly.

## Tests

- `npm run test` must pass before merging.
- Add unit tests for new or changed logic (e.g. pure functions, hooks, components as needed).

## Layout and design

- Follow [docs/PAGE_LAYOUT.md](docs/PAGE_LAYOUT.md) for new or updated pages so the app stays consistent with the inventory page design.
