#!/usr/bin/env node

import { existsSync } from "node:fs"
import { execSync } from "node:child_process"

const currentNode = process.versions.node
const currentMajor = Number(currentNode.split(".")[0])

const moduleGuidance = [
  {
    path: "apps/pbtc-bridge-api",
    manager: "npm",
    node: ">=20 recommended",
    commands: ["npm install", "npm run build", "npm run test:contract"],
  },
  {
    path: "apps/pbtc-portal",
    manager: "yarn",
    node: ">=18 recommended",
    commands: ["yarn install", "yarn build"],
  },
  {
    path: "typescript",
    manager: "yarn",
    node: ">=16",
    commands: ["yarn install", "yarn build", "yarn test"],
  },
  {
    path: "solidity",
    manager: "npm",
    node: ">=14",
    commands: ["npm install", "npm run build", "npm run test"],
  },
  {
    path: "monitoring",
    manager: "yarn",
    node: "14 (README currently states =14)",
    commands: ["yarn install", "yarn build"],
  },
]

function hasCommand(command) {
  try {
    execSync(`${command} --version`, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

const npmPresent = hasCommand("npm")
const yarnPresent = hasCommand("yarn")

console.log("\n=== pBTC/tBTC Monorepo Bootstrap ===")
console.log(`Node.js detected: ${currentNode}`)

if (currentMajor < 16) {
  console.log("⚠️  Your Node version is very old for several modules (apps/typescript).")
  console.log("    Use module-specific Node versions with nvm/volta before building.\n")
}

if (!npmPresent) {
  console.log("⚠️  npm is not available in PATH.")
}

if (!yarnPresent) {
  console.log("⚠️  yarn is not available in PATH (required by several legacy modules).")
}

console.log("\nModule quick-start matrix:\n")

for (const moduleInfo of moduleGuidance) {
  const present = existsSync(moduleInfo.path)
  if (!present) continue

  console.log(`- ${moduleInfo.path}`)
  console.log(`  Node: ${moduleInfo.node}`)
  console.log(`  Package manager: ${moduleInfo.manager}`)
  console.log(`  Commands:`)

  for (const command of moduleInfo.commands) {
    console.log(`    - ${command}`)
  }
}

console.log("\nRecommended first run:")
console.log("1) Pick one module")
console.log("2) Switch to the module's compatible Node version")
console.log("3) Run install/build/test in that module only")
console.log("")
