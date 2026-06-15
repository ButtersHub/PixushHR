#!/usr/bin/env node

const DEFAULT_AGENT_URL = "http://18.215.146.5:3000/execute";
const DEFAULT_TENANT = "papaya";
const DEFAULT_MAX_TASKS = 10;

function usage() {
  console.log(`Usage:
  node tools/sensei-handshake.mjs <handshake-url> [options]

Options:
  --agent-url <url>     Pixush /execute URL. Default: ${DEFAULT_AGENT_URL}
  --tenant <tenant>     Tenant passed to Pixush. Default: ${DEFAULT_TENANT}
  --source <source>     Source passed to Pixush. Default: agentalent-handshake
  --max-tasks <n>       Safety cap. Default: ${DEFAULT_MAX_TASKS}
  --timeout-ms <n>      Per-request timeout. Default: 120000
  --resume-submit-url <url>
                       Resume by submitting a known answer or next task to this submit URL
  --resume-response <text>
                       Response to submit with --resume-submit-url
  --resume-task <text>
                       Next task prompt to answer with Pixush before submitting
  --dry-run             Start/read tasks, but do not submit answers
  --help                Show this help

Example:
  node tools/sensei-handshake.mjs \\
    https://agentalent.ai/api/handshake/c83abeac-df50-4532-a930-b7e511a0eff8
`);
}

function parseArgs(argv) {
  const opts = {
    agentUrl: DEFAULT_AGENT_URL,
    tenant: DEFAULT_TENANT,
    source: "agentalent-handshake",
    maxTasks: DEFAULT_MAX_TASKS,
    timeoutMs: 120_000,
    resumeSubmitUrl: "",
    resumeResponse: "",
    resumeTask: "",
    dryRun: false,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--agent-url") {
      opts.agentUrl = requireValue(argv, ++i, arg);
    } else if (arg === "--tenant") {
      opts.tenant = requireValue(argv, ++i, arg);
    } else if (arg === "--source") {
      opts.source = requireValue(argv, ++i, arg);
    } else if (arg === "--max-tasks") {
      opts.maxTasks = Number.parseInt(requireValue(argv, ++i, arg), 10);
    } else if (arg === "--timeout-ms") {
      opts.timeoutMs = Number.parseInt(requireValue(argv, ++i, arg), 10);
    } else if (arg === "--resume-submit-url") {
      opts.resumeSubmitUrl = requireValue(argv, ++i, arg);
    } else if (arg === "--resume-response") {
      opts.resumeResponse = requireValue(argv, ++i, arg);
    } else if (arg === "--resume-task") {
      opts.resumeTask = requireValue(argv, ++i, arg);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (!positional[0]) throw new Error("Missing handshake URL.");
  if (opts.resumeSubmitUrl && !opts.resumeResponse && !opts.resumeTask) {
    throw new Error("--resume-submit-url requires --resume-response or --resume-task.");
  }
  if ((opts.resumeResponse || opts.resumeTask) && !opts.resumeSubmitUrl) {
    throw new Error("--resume-response and --resume-task require --resume-submit-url.");
  }
  if (opts.resumeResponse && opts.resumeTask) throw new Error("Use either --resume-response or --resume-task, not both.");
  if (!Number.isFinite(opts.maxTasks) || opts.maxTasks < 1) throw new Error("--max-tasks must be a positive number.");
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs < 1000) throw new Error("--timeout-ms must be at least 1000.");
  return { ...opts, handshakeUrl: positional[0] };
}

function requireValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
}

async function fetchJson(url, init = {}, timeoutMs = 120_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      throw new Error(`${init.method ?? "GET"} ${url} failed with ${res.status}: ${JSON.stringify(body)}`);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function extractTask(payload) {
  const taskish = payload?.task ?? payload?.next_task ?? payload?.nextTask ?? payload?.challenge ?? payload?.item;
  if (typeof taskish === "string") return taskish.trim();
  if (taskish && typeof taskish === "object") {
    return firstString(
      taskish.task,
      taskish.prompt,
      taskish.instructions,
      taskish.description,
      taskish.input,
      taskish.message,
      taskish.content,
    );
  }
  return firstString(payload?.prompt, payload?.instructions, payload?.description, payload?.input, payload?.message, payload?.content);
}

function extractSubmitUrl(payload) {
  const taskish = payload?.task ?? payload?.next_task ?? payload?.nextTask ?? payload?.challenge ?? payload?.item;
  if (taskish && typeof taskish === "object") {
    const nested = firstString(taskish.submit_url, taskish.submitUrl, taskish.url);
    if (nested) return nested;
  }
  return firstString(payload?.submit_url, payload?.submitUrl, payload?.url);
}

function resolveUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    throw new Error(`Invalid URL returned by handshake API: ${url}`);
  }
}

function extractTaskId(payload) {
  const taskish = payload?.task ?? payload?.next_task ?? payload?.nextTask ?? payload?.challenge ?? payload?.item;
  if (taskish && typeof taskish === "object") {
    return firstString(taskish.id, taskish.task_id, taskish.taskId);
  }
  return firstString(payload?.task_id, payload?.taskId, payload?.id);
}

function isComplete(payload) {
  const status = firstString(payload?.status, payload?.state).toLowerCase();
  return payload?.complete === true ||
    payload?.completed === true ||
    payload?.done === true ||
    ["complete", "completed", "done", "finished"].includes(status);
}

function summarizeFeedback(payload) {
  const score = payload?.score ?? payload?.result?.score ?? payload?.evaluation?.score;
  const feedback = payload?.feedback ?? payload?.result?.feedback ?? payload?.evaluation?.feedback;
  const parts = [];
  if (score !== undefined) parts.push(`score=${JSON.stringify(score)}`);
  if (feedback !== undefined) parts.push(`feedback=${typeof feedback === "string" ? feedback : JSON.stringify(feedback)}`);
  return parts.join("\n");
}

async function askPixush(opts, task, taskId) {
  const body = {
    task,
    context: {
      tenant: opts.tenant,
      source: opts.source,
      ...(taskId ? { handshake_task_id: taskId } : {}),
    },
  };
  const payload = await fetchJson(opts.agentUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, opts.timeoutMs);
  const response = firstString(payload?.response, payload?.structured?.response, payload?.message, payload?.content);
  if (!response) throw new Error(`Pixush response did not contain a response string: ${JSON.stringify(payload)}`);
  return response;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log(`Starting Sensei handshake: ${opts.handshakeUrl}`);
  console.log(`Pixush endpoint: ${opts.agentUrl}`);
  let payload;
  if (opts.resumeSubmitUrl && opts.resumeResponse) {
    console.log(`Resuming from submit URL: ${opts.resumeSubmitUrl}`);
    payload = await fetchJson(resolveUrl(opts.resumeSubmitUrl, opts.handshakeUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: opts.resumeResponse }),
    }, opts.timeoutMs);
    const feedback = summarizeFeedback(payload);
    if (feedback) {
      console.log("\n--- Sensei feedback ---");
      console.log(feedback);
    }
  } else if (opts.resumeSubmitUrl && opts.resumeTask) {
    payload = {
      next_task: {
        prompt: opts.resumeTask,
        submit_url: opts.resumeSubmitUrl,
      },
    };
  } else {
    payload = await fetchJson(opts.handshakeUrl, { method: "POST" }, opts.timeoutMs);
  }

  for (let index = 1; index <= opts.maxTasks; index += 1) {
    if (isComplete(payload)) {
      console.log("\nHandshake complete.");
      return;
    }

    const task = extractTask(payload);
    const submitUrl = extractSubmitUrl(payload);
    const taskId = extractTaskId(payload);
    if (!task || !submitUrl) {
      console.log("\nNo next task/submit URL found. Last payload:");
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log(`\n=== Task ${index}${taskId ? ` (${taskId})` : ""} ===`);
    console.log(task);

    const answer = await askPixush(opts, task, taskId);
    console.log("\n--- Pixush answer ---");
    console.log(answer);

    if (opts.dryRun) {
      console.log("\nDry run enabled; not submitting answer.");
      return;
    }

    payload = await fetchJson(resolveUrl(submitUrl, opts.handshakeUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: answer }),
    }, opts.timeoutMs);

    const feedback = summarizeFeedback(payload);
    if (feedback) {
      console.log("\n--- Sensei feedback ---");
      console.log(feedback);
    }
  }

  console.log(`\nStopped after safety cap of ${opts.maxTasks} tasks. Last payload:`);
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(`\nHandshake runner failed: ${error.message}`);
  process.exit(1);
});
