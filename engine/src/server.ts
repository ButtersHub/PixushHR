import { buildApp } from "./app.js";
import { InMemoryStore } from "./store.js";
import { HttpHermesClient } from "./hermes.js";
import { StubHermes } from "./stubHermes.js";

const port = Number(process.env.PORT ?? 3000);
const hermesUrl = process.env.HERMES_URL ?? "http://localhost:8642";
const hermesKey = process.env.HERMES_API_KEY ?? "dev-key";

const hermes =
  process.env.HERMES_MODE === "stub"
    ? new StubHermes(`http://127.0.0.1:${port}`)
    : new HttpHermesClient(hermesUrl, hermesKey);

const app = buildApp({
  store: new InMemoryStore(),
  hermes,
});

app.listen({ port, host: "0.0.0.0" }).then(() => {
  console.log(`engine listening on :${port}, hermes at ${hermesUrl}`);
});
