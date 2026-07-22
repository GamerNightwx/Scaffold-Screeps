DecisionEngine Specification

Overview

The DecisionEngine ranks goals/activities by utility using a pluggable scorer pipeline and supports online weight adaptation. It is responsible for producing an ordered list of goals for TaskFactory to transform into executable tasks. The engine is modular: scorers compute partial scores from features; an aggregator normalizes and combines scorer outputs into a final utility.

Components

- Scorers (pluggable)
  - Signature: (goal, context) => number
  - Stateless pure functions preferred; may read from context (world, spatial, memory)
  - Example scorers: distanceScorer, energyNeedScorer, urgencyScorer, opportunityScorer

- Aggregator
  - Normalize each scorer output (min-max or z-score) across candidate set per evaluation
  - Apply per-scorer weights and sum: utility = sum_i weight_i * norm(score_i)
  - Optionally apply non-linear transforms (softmax, sigmoid) and clipping

- Learning / Adaptation API
  - observeOutcome(taskId, reward): notify DecisionEngine of external reward signal
  - updateWeights(rewardSignal): adjust per-scorer weights (gradient-free update or simple delta rule)
  - exportWeights()/importWeights(payload): persist/load learned weights
  - Learning should be bounded (weights clipped to reasonable ranges) and have configurable learningRate and decay

- Features & Context
  - context passed into scorers: { world, spatial, workingMemory, blackboard }
  - scorers should avoid side effects; use WorkingMemory for persistent observations

- Safety & Exploration
  - Clipping, min/max weights, and exploration epsilon should be configurable
  - Support a fallback deterministic weight set for safety

- Metrics & Telemetry
  - expose metrics: evaluations, scorerCalls, weightUpdates, lastReward
  - provide hooks to emit to Blackboard

APIs (public)

- registerScorer(name, fn)
- unregisterScorer(name)
- evaluate(goals, context) => [{goal,score}]
- tick() => integrate with Kernel (read goals from WorkingMemory, write priorities)
- observeOutcome(id, reward)
- updateWeights(signals)
- exportWeights() => JSON
- importWeights(json)
- getWeights() => { scorerName: weight }
- getMetrics()

Implementation notes

- Keep scorer evaluation deterministic and fast — aim for O(N*M) where N goals and M scorers.
- Normalize per-evaluation to avoid scorer scale issues.
- For learning, start with a simple reward-proportionate update:
  weight_i += learningRate * reward * average_normed_score_i

Testing

- Unit tests for aggregator correctness (normalization, weighting)
- Integration tests: register mock scorers, run evaluate(), verify ordering
- Learning tests: simulate outcomes, call observeOutcome/updateWeights, assert weight changes within bounds

Configuration

Expose default config parameters with sensible defaults:
- learningRate: 0.01
- weightDecay: 0.999
- minWeight: -5, maxWeight: 5
- normalization: 'minmax' | 'zscore'
- explorationEpsilon: 0.0 (default deterministic)

