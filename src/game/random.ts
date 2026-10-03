// Reject the four extra uint32 values instead of biasing faces with modulo.
export function secureDie(): number {
  const sample = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / 6) * 6;
  do { globalThis.crypto.getRandomValues(sample); } while(sample[0] >= limit);
  return sample[0] % 6 + 1;
}
