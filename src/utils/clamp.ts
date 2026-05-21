export type Clamp = (params: { max: number; min: number; value: number }) => number;
export const clamp: Clamp = ({ max, min, value }) => Math.max(min, Math.min(max, value));
