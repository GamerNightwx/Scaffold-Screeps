# Setup & Infrastructure Guide

## Instalação

```bash
npm install
```

Instala todas as dependências incluindo:
- **Rollup**: Build bundler
- **Vitest**: Test framework
- **ESLint**: Code linter

## Scripts Disponíveis

### Build & Watch

```bash
npm run build       # Build uma única vez com Rollup
npm run watch       # Watch mode: rebuild ao salvar arquivos
npm run dev         # Alias para watch
```

**Output:** `dist/main.js` (CommonJS, compatível com Screeps)

### Testes

```bash
npm test            # Rodar testes uma vez (Vitest)
npm run test:watch  # Watch mode para testes
npm run test:ui     # UI interativa para testes
```

**Testes:**
- Unit tests com Vitest
- Mock de Game/Memory para isolamento
- Cobertura de 18+ testes no Phase 0

### Linting

```bash
npm run lint        # Verificar código
npm run lint:fix    # Auto-fix issues
npm run check       # Lint + Test (CI/CD)
```

**Regras:**
- ESLint flat config (v10 compatible)
- Globals do Screeps pré-configurados
- Max 10 warnings permitidos

### Upload & Deploy

```bash
npm run upload              # Upload para server local (127.0.0.1:21025)
npm run upload:local        # Alias
node upload.js --help       # Ver opções
```

**Configuração:** `.screepsrc.json` (opcional)

```json
{
  "host": "127.0.0.1",
  "port": 21025,
  "branch": "main",
  "email": "user@example.com",
  "password": "password"
}
```

## Estrutura de Diretórios

```
src/
├── main.js                  # Entrada principal
├── config.js                # Configurações globais
├── kernel/
│   └── Kernel.js           # Orquestrador central
└── core/
    └── WorldModel.js       # Snapshot + índices

tests/
├── kernel.test.js          # Testes do Kernel
└── worldmodel.test.js      # Testes do WorldModel

dist/
└── main.js                 # Build output (gerado)

docs/
├── ARCHITECTURE_SPEC_v1.1.md
├── PHASE0.md
└── INFRASTRUCTURE.md       # Este arquivo
```

## Configurações

### rollup.config.js

- Input: `src/main.js`
- Output: `dist/main.js` (CommonJS)
- Format: ESM → CommonJS (compatível com Screeps)

### vitest.config.js

- Ambiente: Node.js
- Include: `tests/**/*.test.js`
- Coverage: v8 provider

### eslint.config.js

- Flat config (ESLint v10+)
- ESM support
- Screeps globals pré-definidos
- Auto-fix available

### package.json

```json
{
  "type": "module",        // ESM modules
  "scripts": {
    "build": "rollup -c",
    "watch": "rollup -c -w",
    "test": "vitest run",
    "lint": "eslint src/ tests/",
    "check": "npm run lint && npm run test"
  }
}
```

## Development Workflow

### 1. Desenvolvimento Local

```bash
npm run watch          # Terminal 1: rebuild on save
npm run test:watch    # Terminal 2: tests on save
```

### 2. Pre-commit Check

```bash
npm run check         # Lint + Test (antes de commit)
```

### 3. Build & Upload

```bash
npm run build         # Build para dist/main.js
npm run upload        # Upload ao Screeps server
```

### 4. CI/CD

```bash
npm run check         # Lint + Test
npm run build         # Build
npm run upload        # Deploy
```

## Troubleshooting

### ESLint errors

Se receber erro sobre eslint.config.js:
```bash
npm install --save-dev @eslint/js
```

### Rollup build fails

Certificar-se que `src/main.js` é ESM válido:
```bash
npm run build -- --debug
```

### Tests failing

Verificar que mocks de Game/Memory estão corretos:
```bash
npm run test:watch
```

### Upload issues

1. Verificar se servidor local está rodando (porta 21025)
2. Configurar `.screepsrc.json` com credenciais
3. Testar conexão: `npm run upload -- --dry-run`

## Performance Tips

- **Build:** Rollup é rápido (~180ms)
- **Tests:** Vitest paralelo (~700ms para 18 testes)
- **Lint:** ESLint incremental com `--cache`
- **Watch:** ~100ms rebuild, ~500ms test cycle

## Próximos Passos

- [ ] Adicionar pre-commit hook (husky)
- [ ] GitHub Actions para CI/CD
- [ ] Sonarqube/Code coverage tracking
- [ ] Minify para dist/main.js
- [ ] Source maps para debug

---

Veja também: [ARCHITECTURE_SPEC_v1.1.md](./ARCHITECTURE_SPEC_v1.1.md) e [PHASE0.md](./PHASE0.md)
