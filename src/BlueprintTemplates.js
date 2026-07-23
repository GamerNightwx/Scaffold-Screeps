// BlueprintTemplates - canonical relative placements per RCL
// Placements use offsets relative to a center point. Generator will translate to absolute coords.

export const templates = {
  1: [
    { x: 0, y: 0, type: 'spawn', priority: 10 }
  ],
  2: [
    { x: 0, y: 0, type: 'spawn', priority: 10 },
    { x: -1, y: 0, type: 'extension', priority: 5 },
    { x: 1, y: 0, type: 'extension', priority: 5 },
    { x: 0, y: -1, type: 'extension', priority: 5 },
    { x: 0, y: 1, type: 'extension', priority: 5 }
  ],
  3: [
    { x: 0, y: 0, type: 'spawn', priority: 10 },
    { x: -1, y: 0, type: 'extension', priority: 5 },
    { x: 1, y: 0, type: 'extension', priority: 5 },
    { x: 0, y: -1, type: 'extension', priority: 5 },
    { x: 0, y: 1, type: 'extension', priority: 5 },
    { x: 2, y: 0, type: 'container', priority: 6 }
  ],
  4: [
    { x: 0, y: 0, type: 'spawn', priority: 10 },
    { x: -1, y: 0, type: 'extension', priority: 5 },
    { x: 1, y: 0, type: 'extension', priority: 5 },
    { x: 0, y: -1, type: 'extension', priority: 5 },
    { x: 0, y: 1, type: 'extension', priority: 5 },
    { x: 2, y: 0, type: 'container', priority: 6 },
    { x: -2, y: 0, type: 'tower', priority: 8 }
  ],
  5: [
    // include lab placeholder and more extensions
    { x: 0, y: 0, type: 'spawn', priority: 10 },
    { x: -2, y: -1, type: 'lab', priority: 7 },
    { x: 2, y: -1, type: 'lab', priority: 7 }
  ],
  6: [
    // RCL6: add storage, terminal, more towers, and roads placeholder
    { x: 0, y: 0, type: 'spawn', priority: 10 },
    { x: -2, y: 0, type: 'storage', priority: 9 },
    { x: 2, y: 0, type: 'terminal', priority: 9 },
    { x: -3, y: -1, type: 'tower', priority: 8 },
    { x: 3, y: -1, type: 'tower', priority: 8 },
    { x: -1, y: 2, type: 'road', priority: 1 },
    { x: 0, y: 2, type: 'road', priority: 1 },
    { x: 1, y: 2, type: 'road', priority: 1 }
  ],
  7: [
    // RCL7: add more labs and extensions, additional towers
    { x: 0, y: 0, type: 'spawn', priority: 10 },
    { x: -2, y: 0, type: 'storage', priority: 9 },
    { x: 2, y: 0, type: 'terminal', priority: 9 },
    { x: -3, y: -2, type: 'lab', priority: 7 },
    { x: 3, y: -2, type: 'lab', priority: 7 },
    { x: -3, y: 2, type: 'tower', priority: 8 },
    { x: 3, y: 2, type: 'tower', priority: 8 },
    { x: -1, y: 3, type: 'road', priority: 1 },
    { x: 0, y: 3, type: 'road', priority: 1 },
    { x: 1, y: 3, type: 'road', priority: 1 }
  ],
  8: [
    // RCL8: full layout placeholders (storage, terminal, powerSpawn placeholder, labs cluster)
    { x: 0, y: 0, type: 'spawn', priority: 10 },
    { x: -2, y: 0, type: 'storage', priority: 9 },
    { x: 2, y: 0, type: 'terminal', priority: 9 },
    { x: -1, y: -3, type: 'powerSpawn', priority: 9 },
    { x: -3, y: -1, type: 'lab', priority: 7 },
    { x: -1, y: -1, type: 'lab', priority: 7 },
    { x: 1, y: -1, type: 'lab', priority: 7 },
    { x: 3, y: -1, type: 'lab', priority: 7 },
    { x: -3, y: 2, type: 'tower', priority: 8 },
    { x: 3, y: 2, type: 'tower', priority: 8 },
    { x: -2, y: 3, type: 'road', priority: 1 },
    { x: -1, y: 3, type: 'road', priority: 1 },
    { x: 0, y: 3, type: 'road', priority: 1 },
    { x: 1, y: 3, type: 'road', priority: 1 },
    { x: 2, y: 3, type: 'road', priority: 1 }
  ]
};

export default { templates };
