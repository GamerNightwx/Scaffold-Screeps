export default {
  // Weight applied to room traffic when computing effective cost in Scheduler
  trafficWeight: 0.5,
  // Decay factor for SpatialEngine traffic counters (per tick exponential decay)
  trafficDecay: 0.85,

  // Skill and scheduler tuning
  // Penalty to apply when agent lacks required skill (large to avoid assignment)
  missingSkillPenalty: 1000,
  // Multiplier applied to agent skill levels when computing cost scaling
  skillProficiencyScale: 1.0,
  // Skill aliases mapping: canonicalSkill => [aliases...]
  skillAliases: {
    carry: ['transport'],
    claim: ['reserve'],
    harvest: ['harvest'],
    build: ['build'],
    repair: ['repair'],
    upgrade: ['upgrade'],
    dismantle: ['dismantle'],
    defend: ['defend'],
    scout: ['scout']
  },

  // Scheduler multi-factor weights (defaults)
  pathWeight: 1.0,
  typeWeight: 1.0,
  availabilityWeight: 1.0,
  skillWeight: 1.0,
  balanceWeight: 10.0, // penalty per existing assignment
  preemptionThreshold: 5.0 // cost delta required to trigger preemption
};
