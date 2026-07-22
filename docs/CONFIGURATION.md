Configuration guide — Traffic tuning

Overview

This document explains the runtime configuration keys used to tune traffic-aware scheduling and decay behavior. Settings live in src/config/Settings.js (defaults) and can be overridden by passing a config object to the Kernel constructor (kernel.config).

Keys

- trafficWeight (number, default: 0.5)
  - Used by Scheduler when converting SpatialEngine.getTraffic(roomName) into an additive cost: cost += traffic * trafficWeight.
  - Recommended range: 0.0 — 2.0
    - 0.0: ignore traffic (distance-only scheduling)
    - 0.1–0.5: mild penalty, prefers low-traffic rooms only when distances similar
    - 0.5–1.5: moderate penalty, will divert assignments from busy rooms
    - >1.5: strong penalty, avoids high-traffic rooms aggressively

- trafficDecay (number, default: 0.85)
  - Per-tick exponential decay factor applied to SpatialEngine traffic counters. Each tick: value *= trafficDecay.
  - Recommended range: 0.6 — 0.95
    - Lower values (0.6–0.8) make traffic measurements short-lived (fast forgetting)
    - Higher values (0.85–0.95) keep longer memory of traffic patterns

How to override

- In-code: when creating Kernel, pass config:
  const kernel = new Kernel({ trafficWeight: 0.8, trafficDecay: 0.8, subsystems: { ... } });

- Permanent default: edit src/config/Settings.js values.

Tuning tips

- Start with trafficWeight = 0.5 and trafficDecay = 0.85. Observe assignments and in-game metrics.
- If agents frequently congest choke points, increase trafficWeight or decay to accentuate penalties.
- If traffic signals are noisy, lower decay to forget bursts quickly.

Observability

- Expose SpatialEngine.getMetrics() in Kernel.metrics or write to Blackboard each N ticks to observe per-room traffic and tune accordingly.
