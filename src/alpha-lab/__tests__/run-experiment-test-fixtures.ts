export function createCapturedIo(): {
  readonly stdout: string;
  readonly stderr: string;
  io: { stdout: { write: (m: string) => void }; stderr: { write: (m: string) => void } };
} {
  let stdout = '';
  let stderr = '';
  return {
    get stdout() { return stdout; },
    get stderr() { return stderr; },
    io: {
      stdout: { write: (m: string) => { stdout += m; } },
      stderr: { write: (m: string) => { stderr += m; } },
    },
  };
}
