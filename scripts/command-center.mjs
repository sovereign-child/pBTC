#!/usr/bin/env node
// ─── pBTC Command Center ────────────────────────────────────────────────
//
// Interactive terminal dashboard for launching, monitoring, and testing
// the entire pBTC testnet stack. Zero external dependencies — uses only
// Node.js built-ins.
//
// Usage:
//   node scripts/command-center.mjs
//
// Controls:
//   1-6  Toggle services on/off
//   s    Run bridge simulation
//   r    Refresh all health checks
//   l    Toggle log view
//   q    Quit (stops all services)
//
// ─────────────────────────────────────────────────────────────────────────

import { spawn } from "child_process"
import { createInterface } from "readline"
import { existsSync, copyFileSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

// ── State ────────────────────────────────────────────────────────────────

const services = [
  {
    id: "bridge-api",
    name: "Bridge API",
    description: "Mock bridge API (deposit/redeem lifecycle)",
    port: 3007,
    healthUrl: "http://localhost:3007/health",
    cmd: "npx",
    args: ["tsx", "src/index.ts"],
    cwd: path.join(ROOT, "apps/pbtc-bridge-api"),
    env: { BRIDGE_API_MODE: "mock", PORT: "3007", CORS_ORIGIN: "*" },
    status: "stopped", // stopped | starting | running | error
    process: null,
    logs: [],
    health: null,
  },
  {
    id: "portal",
    name: "Portal (Vite)",
    description: "pBTC web portal (React + Vite dev server)",
    port: 5173,
    healthUrl: "http://localhost:5173",
    cmd: "npm",
    args: ["run", "dev"],
    cwd: path.join(ROOT, "apps/pbtc-portal"),
    env: {
      VITE_BRIDGE_API_URL: "http://localhost:3007",
      VITE_PULSECHAIN_CHAIN_ID: "943",
      VITE_PULSECHAIN_RPC_URL: "https://rpc.v4.testnet.pulsechain.com",
      VITE_PULSECHAIN_NETWORK_NAME: "Pulsechain Testnet",
      VITE_BTC_PRICE_USD: "95000",
    },
    status: "stopped",
    process: null,
    logs: [],
    health: null,
  },
  {
    id: "guardian-hb",
    name: "Guardian Heartbeat",
    description: "Sends heartbeat to bridge API every 10s",
    port: null,
    healthUrl: null,
    cmd: "node",
    args: ["-e", `
      async function beat() {
        try {
          const res = await fetch("http://localhost:3007/guardians/heartbeat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ guardianId: "cmd-center-guardian", version: "command-center-v1" }),
            signal: AbortSignal.timeout(5000),
          });
          const j = await res.json();
          console.log("heartbeat ok:", j.guardianId);
        } catch (e) {
          console.error("heartbeat failed:", e.message);
        }
      }
      beat();
      setInterval(beat, 10000);
    `],
    cwd: ROOT,
    env: {},
    status: "stopped",
    process: null,
    logs: [],
    health: null,
  },
  {
    id: "simulation",
    name: "Bridge Simulation",
    description: "End-to-end deposit + redemption test",
    port: null,
    healthUrl: null,
    cmd: "node",
    args: ["scripts/simulate-bridge.mjs", "http://localhost:3007", "--fast"],
    cwd: ROOT,
    env: {},
    status: "stopped",
    process: null,
    logs: [],
    health: null,
    oneShot: true,
  },
  {
    id: "metrics",
    name: "Metrics Viewer",
    description: "Live Prometheus metrics snapshot",
    port: null,
    healthUrl: null,
    cmd: "node",
    args: ["-e", `
      async function check() {
        try {
          const res = await fetch("http://localhost:3007/metrics", { signal: AbortSignal.timeout(5000) });
          const text = await res.text();
          const lines = text.split("\\n").filter(l => !l.startsWith("#") && l.trim());
          console.log("── Metrics Snapshot (" + new Date().toLocaleTimeString() + ") ──");
          for (const l of lines) console.log("  " + l);
          console.log("");
        } catch (e) {
          console.error("metrics fetch failed:", e.message);
        }
      }
      check();
      setInterval(check, 15000);
    `],
    cwd: ROOT,
    env: {},
    status: "stopped",
    process: null,
    logs: [],
    health: null,
  },
  {
    id: "docker-full",
    name: "Docker Full Stack",
    description: "All services via docker compose (alternative to 1-3)",
    port: null,
    healthUrl: "http://localhost:3007/health",
    cmd: "docker",
    args: ["compose", "-f", "docker-compose.testnet.yml", "--env-file", ".env.testnet", "up", "--build"],
    cwd: ROOT,
    env: {},
    status: "stopped",
    process: null,
    logs: [],
    health: null,
  },
]

let showLogs = false
let logTarget = null // service id to show logs for
let lastRender = ""

const MAX_LOG_LINES = 50
const HEALTH_INTERVAL_MS = 5000

// ── Terminal Helpers ──────────────────────────────────────────────────────

const ESC = "\x1b"
const CLEAR = `${ESC}[2J${ESC}[H`
const BOLD = `${ESC}[1m`
const DIM = `${ESC}[2m`
const RESET = `${ESC}[0m`
const RED = `${ESC}[31m`
const GREEN = `${ESC}[32m`
const YELLOW = `${ESC}[33m`
const BLUE = `${ESC}[34m`
const CYAN = `${ESC}[36m`
const WHITE = `${ESC}[37m`
const BG_GREEN = `${ESC}[42m`
const BG_RED = `${ESC}[41m`
const BG_YELLOW = `${ESC}[43m`
const BG_BLUE = `${ESC}[44m`

function statusIcon(status) {
  switch (status) {
    case "running":  return `${BG_GREEN}${WHITE}${BOLD}  UP  ${RESET}`
    case "starting": return `${BG_YELLOW}${WHITE}${BOLD} WAIT ${RESET}`
    case "error":    return `${BG_RED}${WHITE}${BOLD} FAIL ${RESET}`
    case "stopped":  return `${DIM}  --  ${RESET}`
    case "done":     return `${BG_BLUE}${WHITE}${BOLD} DONE ${RESET}`
    default:         return `${DIM}  ??  ${RESET}`
  }
}

function healthIcon(health) {
  if (health === null) return `${DIM}--${RESET}`
  if (health === true) return `${GREEN}OK${RESET}`
  return `${RED}ERR${RESET}`
}

// ── Service Management ───────────────────────────────────────────────────

function startService(svc) {
  if (svc.status === "running" || svc.status === "starting") return

  // Ensure .env.testnet exists for docker
  if (svc.id === "docker-full") {
    const envFile = path.join(ROOT, ".env.testnet")
    const exampleFile = path.join(ROOT, ".env.testnet.example")
    if (!existsSync(envFile) && existsSync(exampleFile)) {
      copyFileSync(exampleFile, envFile)
      addLog(svc, "Created .env.testnet from example")
    }
  }

  svc.status = "starting"
  svc.logs = []
  addLog(svc, `Starting ${svc.name}...`)

  const env = { ...process.env, ...svc.env }

  try {
    const proc = spawn(svc.cmd, svc.args, {
      cwd: svc.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    })

    svc.process = proc

    proc.stdout.on("data", (data) => {
      const lines = data.toString().split("\n").filter(Boolean)
      for (const line of lines) addLog(svc, line)
      if (svc.status === "starting") svc.status = "running"
      render()
    })

    proc.stderr.on("data", (data) => {
      const lines = data.toString().split("\n").filter(Boolean)
      for (const line of lines) addLog(svc, `${RED}${line}${RESET}`)
      // Don't mark as error for stderr — many tools use stderr for info
      if (svc.status === "starting") svc.status = "running"
      render()
    })

    proc.on("close", (code) => {
      if (svc.oneShot) {
        svc.status = code === 0 ? "done" : "error"
        addLog(svc, `Exited with code ${code}`)
      } else {
        svc.status = code === 0 ? "stopped" : "error"
        addLog(svc, `Process exited (code ${code})`)
      }
      svc.process = null
      render()
    })

    proc.on("error", (err) => {
      svc.status = "error"
      addLog(svc, `${RED}Failed to start: ${err.message}${RESET}`)
      svc.process = null
      render()
    })

    // Auto-detect running after a delay if no stdout yet
    setTimeout(() => {
      if (svc.status === "starting") {
        svc.status = "running"
        render()
      }
    }, 3000)
  } catch (e) {
    svc.status = "error"
    addLog(svc, `${RED}Launch failed: ${e.message}${RESET}`)
  }

  render()
}

function stopService(svc) {
  if (svc.process) {
    addLog(svc, "Stopping...")

    if (svc.id === "docker-full") {
      // docker compose needs its own stop
      spawn("docker", ["compose", "-f", "docker-compose.testnet.yml", "down"], {
        cwd: ROOT,
        stdio: "ignore",
        shell: true,
      })
    }

    svc.process.kill("SIGTERM")
    setTimeout(() => {
      if (svc.process) svc.process.kill("SIGKILL")
    }, 3000)
  }
  svc.status = "stopped"
  svc.health = null
  svc.process = null
  render()
}

function toggleService(idx) {
  const svc = services[idx]
  if (!svc) return

  if (svc.status === "running" || svc.status === "starting") {
    stopService(svc)
  } else {
    startService(svc)
  }
}

function addLog(svc, msg) {
  const ts = new Date().toLocaleTimeString()
  svc.logs.push(`${DIM}${ts}${RESET} ${msg}`)
  if (svc.logs.length > MAX_LOG_LINES) {
    svc.logs = svc.logs.slice(-MAX_LOG_LINES)
  }
}

// ── Health Checks ────────────────────────────────────────────────────────

async function checkHealth(svc) {
  if (!svc.healthUrl || svc.status === "stopped") {
    svc.health = null
    return
  }
  try {
    const res = await fetch(svc.healthUrl, { signal: AbortSignal.timeout(3000) })
    svc.health = res.ok
    if (svc.status === "starting") svc.status = "running"
  } catch {
    svc.health = false
  }
}

async function checkAllHealth() {
  await Promise.all(services.map(checkHealth))
  render()
}

// ── Quick Start ──────────────────────────────────────────────────────────

function quickStart() {
  // Start bridge API first, then guardian, then portal
  const api = services.find(s => s.id === "bridge-api")
  const guardian = services.find(s => s.id === "guardian-hb")
  const portal = services.find(s => s.id === "portal")

  if (api.status === "stopped") startService(api)

  setTimeout(() => {
    if (guardian.status === "stopped") startService(guardian)
  }, 2000)

  setTimeout(() => {
    if (portal.status === "stopped") startService(portal)
  }, 4000)
}

// ── Render ────────────────────────────────────────────────────────────────

function render() {
  const cols = process.stdout.columns || 80
  const rows = process.stdout.rows || 24
  const line = "─".repeat(cols - 2)
  const dline = "═".repeat(cols - 2)

  let out = CLEAR

  // Header
  out += `${BOLD}${CYAN}`
  out += `╔${"═".repeat(cols - 2)}╗\n`
  out += `║${" ".repeat(Math.floor((cols - 24) / 2))}pBTC Command Center${" ".repeat(Math.ceil((cols - 24) / 2))}║\n`
  out += `╚${"═".repeat(cols - 2)}╝${RESET}\n`
  out += "\n"

  // Service table
  out += `${BOLD} #  Status  Health  Service                    Port     Description${RESET}\n`
  out += `${DIM}${line}${RESET}\n`

  services.forEach((svc, i) => {
    const num = `${BOLD}${YELLOW}${i + 1}${RESET}`
    const icon = statusIcon(svc.status)
    const hlth = healthIcon(svc.health)
    const port = svc.port ? `:${svc.port}` : "  --"
    const name = svc.status === "running"
      ? `${GREEN}${svc.name}${RESET}`
      : svc.status === "error"
      ? `${RED}${svc.name}${RESET}`
      : svc.status === "done"
      ? `${BLUE}${svc.name}${RESET}`
      : `${DIM}${svc.name}${RESET}`

    out += ` ${num}  ${icon}  ${hlth}      ${name.padEnd(38)} ${port.padEnd(8)} ${DIM}${svc.description}${RESET}\n`
  })

  out += `${DIM}${line}${RESET}\n`

  // Quick stats
  const running = services.filter(s => s.status === "running").length
  const errors = services.filter(s => s.status === "error").length
  out += `\n  ${GREEN}${running} running${RESET}  ${errors > 0 ? `${RED}${errors} errors${RESET}` : `${DIM}0 errors${RESET}`}`
  out += `  │  ${DIM}Health checks every ${HEALTH_INTERVAL_MS / 1000}s${RESET}\n`

  // URLs
  const api = services.find(s => s.id === "bridge-api")
  const portal = services.find(s => s.id === "portal")
  if (api?.status === "running") {
    out += `\n  ${BOLD}Endpoints:${RESET}\n`
    out += `    API Health:    ${CYAN}http://localhost:3007/health${RESET}\n`
    out += `    Metrics:       ${CYAN}http://localhost:3007/metrics${RESET}\n`
    if (portal?.status === "running") {
      out += `    Portal:        ${CYAN}http://localhost:5173${RESET}\n`
      out += `    Status Page:   ${CYAN}http://localhost:5173/status.html${RESET}\n`
    }
  }

  // Log panel
  if (showLogs && logTarget) {
    const svc = services.find(s => s.id === logTarget)
    if (svc) {
      out += `\n${BOLD}${CYAN}── Logs: ${svc.name} ──${RESET}\n`
      const logLines = svc.logs.slice(-(rows - 22))
      for (const l of logLines) {
        out += `  ${l}\n`
      }
      if (svc.logs.length === 0) {
        out += `  ${DIM}(no output yet)${RESET}\n`
      }
    }
  }

  // Controls
  out += `\n${DIM}${line}${RESET}\n`
  out += `  ${BOLD}Controls:${RESET} `
  out += `${YELLOW}1-6${RESET} toggle service  `
  out += `${YELLOW}a${RESET} quick-start (API+Guardian+Portal)  `
  out += `${YELLOW}s${RESET} run simulation  `
  out += `${YELLOW}r${RESET} refresh health\n`
  out += `           `
  out += `${YELLOW}l${RESET} toggle logs  `
  out += `${YELLOW}1-6${RESET}+${YELLOW}l${RESET} view logs for service  `
  out += `${YELLOW}q${RESET} quit\n`

  if (out !== lastRender) {
    process.stdout.write(out)
    lastRender = out
  }
}

// ── Input Handler ────────────────────────────────────────────────────────

function handleKey(key) {
  const ch = key.toString()

  if (ch === "q" || ch === "\x03") {
    // Quit — stop everything
    process.stdout.write(`\n${YELLOW}Shutting down all services...${RESET}\n`)
    for (const svc of services) {
      if (svc.process) stopService(svc)
    }
    setTimeout(() => {
      process.stdout.write(`${GREEN}All services stopped. Goodbye!${RESET}\n`)
      process.exit(0)
    }, 1500)
    return
  }

  if (ch >= "1" && ch <= "6") {
    const idx = parseInt(ch) - 1
    if (showLogs) {
      logTarget = services[idx]?.id || null
    } else {
      toggleService(idx)
    }
    render()
    return
  }

  if (ch === "a") {
    quickStart()
    return
  }

  if (ch === "s") {
    const sim = services.find(s => s.id === "simulation")
    if (sim) {
      sim.status = "stopped" // reset for re-run
      startService(sim)
    }
    return
  }

  if (ch === "r") {
    checkAllHealth()
    return
  }

  if (ch === "l") {
    showLogs = !showLogs
    if (showLogs && !logTarget) {
      // Default to first running service
      const running = services.find(s => s.status === "running")
      logTarget = running?.id || services[0].id
    }
    render()
    return
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  // Enable raw mode for keypress handling
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on("data", handleKey)
  } else {
    console.error("Command center requires an interactive terminal (TTY).")
    process.exit(1)
  }

  // Hide cursor
  process.stdout.write(`${ESC}[?25l`)

  // Restore cursor on exit
  process.on("exit", () => {
    process.stdout.write(`${ESC}[?25h`)
  })
  process.on("SIGINT", () => {
    for (const svc of services) {
      if (svc.process) svc.process.kill()
    }
    process.stdout.write(`${ESC}[?25h\n`)
    process.exit(0)
  })

  // Initial render
  render()

  // Periodic health checks
  setInterval(async () => {
    await checkAllHealth()
  }, HEALTH_INTERVAL_MS)
}

main().catch((e) => {
  console.error("Command center error:", e.message)
  process.exit(1)
})
