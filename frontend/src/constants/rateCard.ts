/** Static rate slab reference for UI — not live pricing data */
export const rateCardData = {
  zones: ["A", "B", "C", "D", "E"] as const,
  weightSlabs: ["0.5 kg", "1 kg", "2 kg", "5 kg", "10 kg"] as const,
  rates: {
    A: [29, 39, 59, 119, 199],
    B: [35, 49, 75, 145, 249],
    C: [42, 59, 89, 169, 299],
    D: [49, 69, 109, 199, 349],
    E: [55, 79, 125, 229, 399],
  } as Record<string, number[]>,
};
