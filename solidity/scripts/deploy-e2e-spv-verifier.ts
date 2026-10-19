/* eslint-disable no-console */
import { deployments, ethers } from "hardhat"

/**
 * Deploys `TestBitcoinTx` against the already-deployed LightRelay so the regtest
 * e2e (apps/pbtc-relay-maintainer/src/e2e/genesis-inclusion.ts) can run the
 * Bridge's own on-chain SPV check, `BitcoinTx.validateProof`, on a real proof.
 *
 * Test-only: it is deliberately not a `deploy/` step, so it never reaches a
 * PulseChain deploy. Prints `SPV_VERIFIER_ADDRESS=<address>` for CI to capture.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-e2e-spv-verifier.ts --network localhost
 */
async function main(): Promise<void> {
  const relay = await deployments.get("LightRelay")
  const factory = await ethers.getContractFactory("TestBitcoinTx")
  const verifier = await factory.deploy(relay.address)
  await verifier.deployed()
  console.log(`SPV_VERIFIER_ADDRESS=${verifier.address}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
