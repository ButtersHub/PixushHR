import { buildApp } from "./app.js";
import { InMemoryStore } from "./store.js";
import { HttpHermesClient } from "./hermes.js";

const port = Number(process.env.PORT ?? 3000);
const hermesUrl = process.env.HERMES_URL ?? "http://localhost:8642";
const hermesKey = process.env.HERMES_API_KEY ?? "dev-key";

const app = buildApp({
  store: new InMemoryStore(),
  hermes: new HttpHermesClient(hermesUrl, hermesKey),
});

app.listen({ port, host: "0.0.0.0" }).then(() => {
  console.log(`engine listening on :${port}, hermes at ${hermesUrl}`);
});
