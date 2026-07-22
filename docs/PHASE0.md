# Phase 0 Implementation - Kernel + WorldModel

## Objetivos Atingidos

✅ **Kernel**
- Orquestrador central com lazy initialization de subsistemas
- Gerenciamento de CPU com budget e reserve
- Ordem de execução definida (worldModel → engines → blackboard.clear)
- Métricas por tick (CPU, erros)
- Tratamento de falhas com rollback

✅ **WorldModel**
- Captura snapshot completo do Game/Memory a cada tick
- Índices rápidos (creepsByRoom, structuresByRoom, creepsById, etc)
- Consultas via `query(indexName, key)`
- Imutabilidade: `current()` e `previous()` para comparações
- Metadata: timestamp, CPU usado

✅ **Testes Unitários**
- 9 testes do Kernel
- 9 testes do WorldModel
- Mock de Game/Memory para isolamento
- Assertions manuais

✅ **Integração**
- `src/main.js` inicializa Kernel + todos os subsistemas
- Loop é chamado a cada tick
- Logs de CPU a cada 10 ticks
- Kernel exportado para debug

## Estrutura de Diretórios

```
Scaffold-Screeps/
├── src/
│   ├── kernel/
│   │   └── Kernel.js          (orquestrador)
│   ├── core/
│   │   └── WorldModel.js      (snapshot + índices)
│   └── main.js                (ponto de entrada)
├── tests/
│   ├── kernel.test.js         (9 testes)
│   └── worldmodel.test.js     (9 testes)
├── docs/
│   ├── ARCHITECTURE_SPEC_v1.1.md
│   └── PHASE0.md              (este arquivo)
├── dist/
│   └── main.js                (output do esbuild)
└── package.json
```

## Como Executar

### Build

```bash
npm run build
```

Gera `dist/main.js` (bundled com esbuild).

### Testes

```bash
npm test
```

Roda todos os testes unitários (Kernel + WorldModel).

Ou individualmente:

```bash
node tests/kernel.test.js
node tests/worldmodel.test.js
```

### Verificação Sintática

```bash
npm run check
```

Valida sintaxe com `node --check`.

## Contrato de Interfaces (JSDoc)

### Kernel

```javascript
// Registrar subsistema
kernel.register(name, initFn)  // (kernel) => subsystemInstance

// Acessar subsistema (lazy init)
kernel.get(name)               // => subsystemInstance

// Executar tick
kernel.tick()                  // => { success, cpuUsed, cpuRemaining, errors }

// Métricas
kernel.metrics()               // => { tickId, cpuUsed, cpuBudget, cpuRemaining, ... }

// Validação
kernel.validate()              // => { valid, missing: ['...'] }
```

### WorldModel

```javascript
// Captura snapshot
worldModel.snapshot()          // => WorldSnapshot

// Acesso imutável
worldModel.current()           // => WorldSnapshot | null
worldModel.previous()          // => WorldSnapshot | null (para comparação)

// Consultas
worldModel.query(indexName, key)  // => Array (ex: 'creepsByRoom', 'E1S1')
worldModel.entities(type)         // => Array (ex: 'creeps', 'structures')
```

### WorldSnapshot

```javascript
{
  tickId: number,                    // Game.time
  game: {
    time: number,
    creeps: Array<Creep>,
    structures: Array<Structure>,
    rooms: Array<Room>,
    flags: Array<Flag>,
    resources: Array<Resource>
  },
  memory: Object,                    // Copy of Memory
  indices: {
    creepsByRoom: { roomName => [creeps] },
    structuresByRoom: { roomName => [structures] },
    structuresByType: { type => [structures] },
    sourcesByRoom: { roomName => [sources] },
    creepsById: { id => creep },
    structuresById: { id => structure }
  },
  meta: {
    timestamp: number,
    cpuStarted: number,
    cpuFinished: number,
    cpuUsed: number
  }
}
```

## Fluxo de Execução (por tick)

```text
kernel.tick()
  ↓
  1. WorldModel.snapshot()         — captura Game/Memory, constrói índices
  ↓
  2. Executa subsistemas em ordem:
     - spatialEngine.tick()
     - workingMemory.tick()
     - blackboard.tick()
     - decisionEngine.tick()
     - taskFactory.tick()
     - taskEngine.tick()
     - scheduler.tick()
     - agentRuntime.tick()
     - commandEngine.tick()
  ↓
  3. blackboard.clear()            — limpa eventos/alerts do tick
  ↓
  4. Retorna { success, cpuUsed, cpuRemaining, errors }
```

## Próximas Fases

### Phase 1: Spatial Engine
- Implementar PathFinder wrapper
- Distâncias em cache
- Análise de terreno
- Testes de pathfinding

### Phase 2: Blackboard + Working Memory
- Blackboard: eventos, alerts (efêmero)
- WorkingMemory: Goals, Reservations, Task templates (persistente)
- Versionamento e invalidação

### Phase 3: Decision Engine
- Score goals por utilidade
- Pluggable score functions (economy, military, expansion)
- Priorização e restrições

### Phase 4: Task Factory + Task Engine
- Converter Goals em Tasks
- Gerenciar ciclo de vida
- Dependências e reservações

### Phase 5: Scheduler + Agent Runtime + Command Engine
- Alocalizar Tasks para creeps
- Executar localmente
- Normalizar comandos → Game API

## Testes Executados

### Kernel Tests (9)
✓ Construction (default config)
✓ Register subsystem
✓ Get subsystem (com lazy init)
✓ Get non-existent (error handling)
✓ Lazy initialization (init called on get, not on register)
✓ Validate (checks required subsystems)
✓ Metrics (null before tick)
✓ Tick execution (success + metrics)
✓ Tick with error (error handling)

### WorldModel Tests (9)
✓ Construction (initial state)
✓ Snapshot (captura completa)
✓ Current (imutável)
✓ Previous (comparação entre ticks)
✓ Query (índices)
✓ Entities (acesso por tipo)
✓ Indices (estrutura correta)
✓ Meta (timestamp + CPU)
✓ Memory capture (cópia de Memory)

## Notas Importantes

1. **Isolamento:** Kernel e WorldModel são totalmente independentes de Game/Memory em testes (mocks)
2. **Performance:** WorldModel.snapshot() é O(n) em creeps + structures, otimizado depois
3. **Persistência:** Memory é capturado como copy, não referência
4. **Subsistemas:** Todos os 10 são instanciados (placeholders agora, implementação nas phases)
5. **CPU:** Budget default é 19 com reserve de 2; ajustável

## Debug

No console do Screeps, acesse:

```javascript
// Kernel
kernel.metrics()               // últimas métricas
kernel.validate()              // checklist de subsistemas

// WorldModel
const wm = kernel.get('worldModel')
wm.current()                   // snapshot atual
wm.query('creepsByRoom', 'E1S1')  // creeps na sala E1S1
wm.entities('structures')      // todas as structures
```

---

**Próximo passo:** Phase 1 - Spatial Engine
