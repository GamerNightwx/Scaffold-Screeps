# Architecture Specification v1.1 — JavaScript Edition

## Objetivo

Consolidar toda a arquitetura do bot competitivo para Screeps em uma especificação única, definindo responsabilidades, interfaces, fluxo de dados e contratos entre os módulos em JavaScript puro.

---

## Princípios Arquiteturais

- Cada módulo possui uma única responsabilidade.
- Módulos comunicam-se através de interfaces bem definidas (JSDoc).
- O fluxo de dados é unidirecional.
- A lógica estratégica é separada da lógica de execução.
- O acesso direto à API do Screeps ocorre apenas no Kernel e CommandEngine.
- Todo conhecimento derivado é centralizado e reutilizável.
- Planejamento, decisão e execução são componentes independentes.

---

## Arquitetura Geral

```text
Game API
    │
    ▼
Kernel (CPU/tick management)
    │
    ▼
WorldModel (snapshot + indices)
    │
    ├─→ Spatial Engine (paths, distance, regions)
    │
    ├─→ Working Memory (Goals, Reservations, persistent state)
    │
    └─→ Blackboard (Events, Alerts, ephemeral state)
    │
    ▼
Economy Engine ─────┐
Military Engine ────┤
Expansion Engine ───┼─→ Decision Engine (score goals)
Market Engine ──────┤
Empire Engine ──────┘
    │
    ▼
Task Factory (Goals → Tasks)
    │
    ▼
Task Engine (lifecycle, dependencies, reservations)
    │
    ▼
Scheduler (Tasks + Agents → Assignments)
    │
    ▼
Agent Runtime (execute locally)
    │
    ▼
Command Engine (normalize + Game API)
    │
    ▼
Game API
```

---

## Componentes

### 1. Kernel

**Responsabilidades:**
- Ciclo do tick
- Gerenciamento de CPU
- Inicialização de subsistemas
- Orquestração (chamar WorldModel, Engines, CommandEngine)
- Tratamento de falhas e timeouts
- Métricas globais

**Contrato Público:**

```javascript
/**
 * @typedef {Object} KernelConfig
 * @property {number} cpuBudget - CPU máximo por tick (default: 19)
 * @property {number} cpuReserve - CPU reservado para emergências (default: 2)
 * @property {Object<string, Function>} subsystems - Map de subsystemas
 */

/**
 * @class Kernel
 */
class Kernel {
  /**
   * @param {KernelConfig} config
   */
  constructor(config) {}

  /**
   * Executa um tick completo
   * @returns {Object} resultado { success: boolean, cpuUsed: number, errors: Array }
   */
  tick() {}

  /**
   * Registra um subsistema
   * @param {string} name
   * @param {Function} initFn - (kernel) => subsystemInstance
   */
  register(name, initFn) {}

  /**
   * Retorna subsistema por nome
   * @param {string} name
   * @returns {Object}
   */
  get(name) {}
}
```

**Nunca contém:** Lógica de jogo, decisões estratégicas, acesso direto a Goal/Task.

---

### 2. WorldModel

**Responsabilidades:**
- Snapshot da Game API e Memory a cada tick
- Criação de índices rápidos (creeps por sala, estruturas, etc)
- Consultas imutáveis sobre o estado
- Cache de cálculos derivados

**Contrato Público:**

```javascript
/**
 * @typedef {Object} WorldSnapshot
 * @property {number} tickId - Identificador único do tick
 * @property {Object} game - Snapshot de Game
 * @property {Object} memory - Snapshot de Memory
 * @property {Map<string, Array>} indices - Índices por tipo (creeps, structures, etc)
 * @property {Object} meta - { timestamp, cpuUsed }
 */

/**
 * @class WorldModel
 */
class WorldModel {
  /**
   * Captura snapshot completo do jogo
   * @returns {WorldSnapshot}
   */
  snapshot() {}

  /**
   * Consulta índice pré-computado
   * @param {string} indexName - 'creepsByRoom', 'structuresByRoom', etc
   * @param {string} key - chave do índice
   * @returns {Array}
   */
  query(indexName, key) {}

  /**
   * Acesso imutável ao snapshot atual
   * @returns {WorldSnapshot}
   */
  current() {}
}
```

**Regra crítica:** Única fonte de verdade. Nenhum outro módulo lê Game/Memory diretamente.

---

### 3. Spatial Engine

**Responsabilidades:**
- Cálculo de caminhos e distâncias
- Flow fields para regiões
- Análise de terreno
- Identificação de choke points
- Nenhum outro módulo usa PathFinder diretamente

**Contrato Público:**

```javascript
/**
 * @typedef {Object} PathCacheEntry
 * @property {RoomPosition[]} path
 * @property {number} cost
 * @property {number} createdTick
 */

/**
 * @class SpatialEngine
 */
class SpatialEngine {
  /**
   * @param {WorldModel} worldModel
   */
  constructor(worldModel) {}

  /**
   * Computa caminho entre dois pontos
   * @param {RoomPosition} start
   * @param {RoomPosition} end
   * @param {Object} opts - { ignoreCreeps, range, maxPath }
   * @returns {PathCacheEntry}
   */
  computePath(start, end, opts = {}) {}

  /**
   * Retorna matriz de distâncias para uma sala
   * @param {string} roomName
   * @param {RoomPosition} origin
   * @returns {Array<Array<number>>}
   */
  distanceMatrix(roomName, origin) {}

  /**
   * Identifica regiões estratégicas (choke points, open areas)
   * @param {string} roomName
   * @returns {Array<{type: string, positions: RoomPosition[]}>}
   */
  analyzeTopology(roomName) {}
}
```

---

### 4. WorkingMemory

**Responsabilidades:**
- Armazenar Goals, Reservations, Task templates
- Persistência entre ticks com versionamento
- Invalidação automática por regras (ex: creep morreu → invalidar reservations)

**Contrato Público:**

```javascript
/**
 * @typedef {Object} VersionedObject
 * @property {string} id - identificador único
 * @property {number} createdTick
 * @property {string} versionToken - hash para detecção de mudanças
 * @property {boolean} valid - flag de invalidação
 * @property {Object} data - payload
 */

/**
 * @class WorkingMemory
 */
class WorkingMemory {
  /**
   * Salva objeto com versionamento
   * @param {string} collection - 'goals', 'reservations', 'templates'
   * @param {VersionedObject} obj
   */
  set(collection, obj) {}

  /**
   * Lê objeto por ID
   * @param {string} collection
   * @param {string} id
   * @returns {VersionedObject | null}
   */
  get(collection, id) {}

  /**
   * Lista todos os objetos válidos em uma coleção
   * @param {string} collection
   * @returns {VersionedObject[]}
   */
  list(collection) {}

  /**
   * Remove objeto
   * @param {string} collection
   * @param {string} id
   */
  delete(collection, id) {}

  /**
   * Invalida objetos por predicado
   * @param {string} collection
   * @param {Function} predicate - (obj) => boolean
   */
  invalidateWhere(collection, predicate) {}
}
```

---

### 5. Blackboard

**Responsabilidades:**
- Memória efêmera do tick
- Armazenar Events, Alerts, Metrics
- Recriado a cada tick

**Contrato Público:**

```javascript
/**
 * @typedef {Object} Event
 * @property {string} type - 'creepDied', 'structureLost', 'resourceFound'
 * @property {number} tick
 * @property {Object} data
 */

/**
 * @typedef {Object} Alert
 * @property {string} severity - 'low', 'medium', 'high', 'critical'
 * @property {string} message
 * @property {number} tick
 */

/**
 * @class Blackboard
 */
class Blackboard {
  /**
   * Registra evento
   * @param {Event} event
   */
  emitEvent(event) {}

  /**
   * Lê eventos desde lastRead
   * @param {number} since
   * @returns {Event[]}
   */
  events(since) {}

  /**
   * Registra alerta
   * @param {Alert} alert
   */
  emitAlert(alert) {}

  /**
   * Retorna alertas ativos
   * @returns {Alert[]}
   */
  alerts() {}

  /**
   * Limpa estado (chamado no fim do tick)
   */
  clear() {}
}
```

---

### 6. Decision Engine

**Responsabilidades:**
- Arbitrar entre Goals conflitantes
- Aplicar políticas e restrições
- Retornar lista ordenada de Goals prontos para execução

**Contrato Público:**

```javascript
/**
 * @typedef {Object} Goal
 * @property {string} id
 * @property {string} type - 'mine', 'build', 'attack', 'haul'
 * @property {Object} context - dados específicos do goal
 * @property {number} priority - 0-100, hint de importância
 * @property {Object} constraints - { maxTime, maxEnergy, required }
 */

/**
 * @typedef {Object} GoalScore
 * @property {string} goalId
 * @property {number} score - 0-100
 * @property {Object} breakdown - { economic: n, military: n, etc }
 */

/**
 * @class DecisionEngine
 */
class DecisionEngine {
  /**
   * @param {Object} config - { scoreWeights, policies }
   * @param {WorldModel} worldModel
   * @param {SpatialEngine} spatialEngine
   */
  constructor(config, worldModel, spatialEngine) {}

  /**
   * Ordena Goals por utilidade e restrições
   * @param {Goal[]} candidates - Goals candidatos
   * @param {Object} context - { worldSnapshot, workingMemory, blackboard }
   * @returns {GoalScore[]} - ordenado por score (maior primeiro)
   */
  rankGoals(candidates, context) {}

  /**
   * Registra função de score customizada
   * @param {string} engine - 'economy', 'military', 'expansion'
   * @param {Function} fn - (goal, context) => number
   */
  registerScorer(engine, fn) {}
}
```

---

### 7. Task Factory

**Responsabilidades:**
- Converter Goals em Tasks
- Toda Task é criada exclusivamente aqui
- Validar Goal antes de conversão

**Contrato Público:**

```javascript
/**
 * @typedef {Object} Task
 * @property {string} id - UUID
 * @property {string} goalId - referência ao Goal pai
 * @property {string} type - 'move', 'harvest', 'build', 'repair'
 * @property {Object} payload - dados específicos
 * @property {Object} resources - { energy, structures, etc }
 * @property {Object} agent - { profile: 'harvester' | 'hauler', ...  }
 * @property {number} estimatedTime
 * @property {Array<string>} dependencies - IDs de outras Tasks
 * @property {number} createdTick
 * @property {string} status - 'pending' | 'active' | 'completed' | 'failed'
 */

/**
 * @class TaskFactory
 */
class TaskFactory {
  /**
   * @param {WorkingMemory} workingMemory
   * @param {WorldModel} worldModel
   */
  constructor(workingMemory, worldModel) {}

  /**
   * Converte Goal em Task(s)
   * @param {Goal} goal
   * @param {Object} context - { worldSnapshot, spatialEngine }
   * @returns {Task[]}
   */
  createTasks(goal, context) {}

  /**
   * Valida se Goal pode virar Task
   * @param {Goal} goal
   * @param {Object} context
   * @returns {Object} { valid: boolean, reason: string }
   */
  validate(goal, context) {}
}
```

---

### 8. Task Engine

**Responsabilidades:**
- Gerenciar ciclo de vida das Tasks
- Validar dependências
- Gerenciar reservações de recursos
- Monitoramento e histórico

**Contrato Público:**

```javascript
/**
 * @typedef {Object} TaskResult
 * @property {Task} task
 * @property {string} outcome - 'success' | 'failed' | 'cancelled'
 * @property {Object} metrics - { cpuUsed, timeSpent, resourcesConsumed }
 */

/**
 * @class TaskEngine
 */
class TaskEngine {
  /**
   * @param {WorkingMemory} workingMemory
   * @param {Blackboard} blackboard
   */
  constructor(workingMemory, blackboard) {}

  /**
   * Registra Task
   * @param {Task} task
   * @returns {string} taskId
   */
  registerTask(task) {}

  /**
   * Retorna Tasks prontas para agendamento (sem dependências pendentes)
   * @returns {Task[]}
   */
  readyTasks() {}

  /**
   * Completa Task
   * @param {string} taskId
   * @param {TaskResult} result
   */
  completeTask(taskId, result) {}

  /**
   * Retorna histórico de Tasks
   * @param {Object} filter - { status, type, since }
   * @returns {Task[]}
   */
  history(filter) {}
}
```

---

### 9. Scheduler

**Responsabilidades:**
- Resolver atribuição entre Tasks e agentes
- Calcular custos e restrições
- Distribuir fila de execução
- Nunca toma decisões estratégicas

**Contrato Público:**

```javascript
/**
 * @typedef {Object} Assignment
 * @property {string} taskId
 * @property {string} agentId - creep ID
 * @property {number} priority - 0-100
 * @property {Object} context - { estimatedCost, constraints }
 */

/**
 * @class Scheduler
 */
class Scheduler {
  /**
   * @param {TaskEngine} taskEngine
   * @param {WorldModel} worldModel
   */
  constructor(taskEngine, worldModel) {}

  /**
   * Executa agendamento de Tasks para agentes
   * @param {Object} context - { worldSnapshot, availableAgents, constraints }
   * @returns {Assignment[]} - fila ordenada de assignments
   */
  schedule(context) {}

  /**
   * Calcula custo de uma Task para um agente
   * @param {Task} task
   * @param {Creep} agent
   * @returns {number} custo (lower = better)
   */
  calculateCost(task, agent) {}
}
```

---

### 10. Agent Runtime

**Responsabilidades:**
- Executar Task localmente no creep
- Percepção local
- Navegação e microotimizações
- Nunca escolhe qual Task executar

**Contrato Público:**

```javascript
/**
 * @typedef {Object} ExecutionOutcome
 * @property {string} status - 'success' | 'retry' | 'failed'
 * @property {number} cpuUsed
 * @property {Object} metrics - { movesConsumed, actionTaken, etc }
 * @property {string} reason - motivo de falha
 */

/**
 * @class AgentRuntime
 */
class AgentRuntime {
  /**
   * @param {SpatialEngine} spatialEngine
   * @param {Blackboard} blackboard
   */
  constructor(spatialEngine, blackboard) {}

  /**
   * Executa Task recebida
   * @param {Creep} agent
   * @param {Task} task
   * @param {Object} context
   * @returns {ExecutionOutcome}
   */
  execute(agent, task, context) {}

  /**
   * Retorna estado local do agent (cache)
   * @param {Creep} agent
   * @returns {Object}
   */
  state(agent) {}
}
```

---

### 11. Command Engine

**Responsabilidades:**
- Última camada antes Game API
- Normalizar ações em comandos padronizados
- Validação e otimização
- Telemetria e tradução de códigos de retorno

**Contrato Público:**

```javascript
/**
 * @typedef {Object} Command
 * @property {string} type - 'move', 'harvest', 'build', etc
 * @property {string} agentId
 * @property {Object} args - argumentos específicos
 */

/**
 * @typedef {Object} CommandResult
 * @property {Command} command
 * @property {number} returnCode - Screeps API return code
 * @property {boolean} success
 * @property {Object} telemetry
 */

/**
 * @class CommandEngine
 */
class CommandEngine {
  /**
   * @param {Blackboard} blackboard
   */
  constructor(blackboard) {}

  /**
   * Executa batch de comandos contra Game API
   * @param {Command[]} commands
   * @returns {CommandResult[]}
   */
  executeBatch(commands) {}

  /**
   * Normaliza ação em comando
   * @param {Object} action - { type, agent, args }
   * @returns {Command}
   */
  normalize(action) {}

  /**
   * Registra comando no telemetry
   * @param {CommandResult} result
   */
  recordTelemetry(result) {}
}
```

---

## Fluxo de Dados (por tick)

```text
1. Kernel.tick() inicia

2. WorldModel.snapshot()
   ├─→ captura Game, Memory
   ├─→ constrói índices
   └─→ passa para todos os engines

3. Engines de análise (Economy, Military, Expansion)
   └─→ consultam WorldModel, Spatial Engine
   └─→ registram Goals na WorkingMemory

4. Decision Engine.rankGoals()
   └─→ ordena Goals por utilidade
   └─→ retorna top N goals

5. Task Factory.createTasks()
   └─→ converte Goals em Tasks
   └─→ registra na Task Engine

6. Scheduler.schedule()
   └─→ aloca Tasks para creeps
   └─→ retorna fila de assignments

7. Agent Runtime (por creep)
   └─→ execute(creep, task)
   └─→ retorna ExecutionOutcome

8. Command Engine.executeBatch()
   └─→ executa comandos na Game API
   └─→ registra telemetry

9. Blackboard.clear()
   └─→ limpa eventos/alerts do tick

10. Kernel registra métricas e retorna
```

---

## Regras Arquiteturais (enfatizadas)

1. **Isolamento:** Nenhum módulo acessa outro equivalente diretamente.
2. **Contrato:** Toda comunicação via interfaces públicas (métodos do JSDoc).
3. **Fonte de Verdade:** Apenas WorldModel lê Game/Memory.
4. **Comandos:** Apenas CommandEngine chama Game API.
5. **Semântica:** Tasks = trabalho; Goals = intenção.
6. **Agência:** Agentes nunca escolhem objetivos; Scheduler não toma decisões estratégicas.
7. **Persistência:** Objetos persistentes carregam createdTick e versionToken.
8. **Invalidação:** WorkingMemory invalidate via predicados explícitos (ex: creep morreu).
9. **Telemetria:** Toda decisão importante é registrada (decision logs, assignments, outcomes).
10. **Testes:** Todos os módulos devem ser testáveis isoladamente (mock WorldModel, Game/Memory).

---

## Objetivo Final

Construir uma engine modular, escalável e orientada a decisões, capaz de competir em Screeps World e adaptar-se tanto ao jogo permanente quanto às futuras Seasons, permitindo evolução contínua sem necessidade de reescrever o núcleo da arquitetura.

---

## Próximos Passos

- **Phase 0:** Kernel + WorldModel + tests
- **Phase 1:** Spatial Engine + distâncias + terreno
- **Phase 2:** Blackboard + Working Memory
- **Phase 3:** Decision Engine (MVP)
- **Phase 4:** Task Factory + Task Engine
- **Phase 5:** Scheduler + Agent Runtime + Command Engine

