# Screeps Bot - Phase 0

Projeto de arquitetura modular para bot competitivo em Screeps.

## Quick Start

```bash
npm install
npm run dev              # Watch mode
npm test                 # Run tests
npm run check            # Lint + Test
npm run build            # Build para dist/main.js
npm run upload:local     # Upload ao server local
```

## Features

✅ **Kernel** — Orquestrador central com CPU management
✅ **WorldModel** — Snapshot + índices do Game/Memory
✅ **Rollup** — Build rápido e módular
✅ **Vitest** — Testes isolados com mocks
✅ **ESLint** — Linting com flat config
✅ **Auto Upload** — Deploy automático ao Screeps
✅ **Documentação** — Architecture spec + phases

## Estrutura

```
src/
├── main.js              # Entrada principal
├── config.js            # Configurações
├── kernel/Kernel.js
└── core/WorldModel.js

tests/
├── kernel.test.js
└── worldmodel.test.js

docs/
├── ARCHITECTURE_SPEC_v1.1.md
├── PHASE0.md
└── INFRASTRUCTURE.md
```

## Scripts

| Script | Descrição |
|--------|-----------|
| `npm run build` | Build único com Rollup |
| `npm run watch` | Watch mode |
| `npm test` | Testes uma vez |
| `npm run test:watch` | Tests em watch |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | Auto-fix lint |
| `npm run check` | Lint + Test (CI) |
| `npm run upload:local` | Deploy ao server |

## Documentação

- [Architecture Specification v1.1](./docs/ARCHITECTURE_SPEC_v1.1.md) — Design modular
- [Phase 0 Implementation](./docs/PHASE0.md) — Kernel + WorldModel
- [Infrastructure Guide](./docs/INFRASTRUCTURE.md) — Setup & tooling

## Roadmap

- Phase 0 ✅ **Kernel + WorldModel**
- Phase 1 🔄 **Spatial Engine** (pathfinding, distance matrix)
- Phase 2 ⏳ **Blackboard + WorkingMemory** (state management)
- Phase 3 ⏳ **Decision Engine** (goal prioritization)
- Phase 4 ⏳ **Task Factory + Task Engine** (work breakdown)
- Phase 5 ⏳ **Scheduler + Agent Runtime + Command Engine** (execution)

## Testes

**18 testes passando** (Vitest):
- 9 testes do Kernel
- 9 testes do WorldModel

```bash
npm test                    # Uma vez
npm run test:watch         # Watch
npm run test:ui            # UI interativa
```

## Licença

MIT

---

**Próximo passo:** Veja [INFRASTRUCTURE.md](./docs/INFRASTRUCTURE.md) para setup detalhado.
