export function writeFileSync() {
  throw new Error('fs is not available in browser builds');
}

export default {
  writeFileSync,
};
