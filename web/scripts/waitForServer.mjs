const baseUrl = (process.env.TEST_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const timeoutMs = Number.parseInt(process.env.WAIT_TIMEOUT_MS ?? "30000", 10);
if (Number.isNaN(timeoutMs) || timeoutMs <= 0) {
  throw new Error("WAIT_TIMEOUT_MS must be a positive integer");
}
const start = Date.now();

async function waitForServer() {
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) {
        return;
      }
    } catch {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

await waitForServer();
