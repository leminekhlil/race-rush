/**
 * Bot difficulty, shared by server bots (online) and local bots (offline).
 * Target: a decent human on touch controls can win; bots stay close so races feel contested.
 */
export const botSkill = (slot: number): number => 0.66 + (slot % 3) * 0.05;

/** Rubber band from the gap (meters) between the bot and the best human (positive = bot ahead). */
export const botPace = (finished: boolean, gapToBestHuman: number): number => {
  if (finished) return 0.75;
  if (gapToBestHuman > 150) return 0.78;
  if (gapToBestHuman > 50) return 0.85;
  if (gapToBestHuman > 0) return 0.92;
  if (gapToBestHuman < -300) return 1.04;
  return 0.97;
};
