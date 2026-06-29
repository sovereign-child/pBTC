/* eslint-disable no-console */
import { deployments, ethers } from "hardhat"

/**
 * Post-deploy wiring assertion.
 *
 * After a `--tags`-based deploy it is easy to silently omit the wiring steps
 * (BankUpdateBridge, AuthorizeTBTCVault, ...) because their dependency arrows
 * point at Bank/Bridge/TBTCVault rather than the other way around. When that
 * happens the contracts deploy fine but the bridge is non-functional:
 *   - Bank doesn't point at the Bridge (deposits can't credit balances)
 *   - the TBTCVault is untrusted (reveals/mints revert)
 * This script reads the recorded deployments and asserts the wiring actually
 * ran. It exits non-zero on any failure so a broken deploy fails loudly.
 *
 * Usage:
 *   npx hardhat run scripts/verify-deploy-wiring.ts --network pulsechainTestnet
 */

const eq = (a: string, b: string): boolean =>
  ethers.utils.getAddress(a) === ethers.utils.getAddress(b)

async function main(): Promise<void> {
  const bankDep = await deployments.get("Bank")
  const bridgeDep = await deployments.get("Bridge")
  const vaultDep = await deployments.get("TBTCVault")

  const bank = await ethers.getContractAt(bankDep.abi, bankDep.address)
  const bridge = await ethers.getContractAt(bridgeDep.abi, bridgeDep.address)

  const failures: string[] = []

  // BankUpdateBridge → Bank.updateBridge(Bridge)
  const bankBridge: string = await bank.bridge()
  if (eq(bankBridge, bridgeDep.address)) {
    console.log(`  ✓ Bank.bridge() == Bridge (${bridgeDep.address})`)
  } else {
    failures.push(
      `Bank.bridge() is ${bankBridge}, expected Bridge ${bridgeDep.address} — BankUpdateBridge did not run`
    )
  }

  // AuthorizeTBTCVault → Bridge.setVaultStatus(TBTCVault, true)
  const vaultTrusted: boolean = await bridge.isVaultTrusted(vaultDep.address)
  if (vaultTrusted) {
    console.log(`  ✓ Bridge.isVaultTrusted(TBTCVault) == true`)
  } else {
    failures.push(
      `Bridge.isVaultTrusted(${vaultDep.address}) is false — AuthorizeTBTCVault did not run`
    )
  }

  // Sanity: Bridge's internal Bank reference matches the deployed Bank.
  const refs = await bridge.contractReferences()
  if (eq(refs.bank, bankDep.address)) {
    console.log(`  ✓ Bridge.contractReferences().bank == Bank`)
  } else {
    failures.push(
      `Bridge bank reference is ${refs.bank}, expected ${bankDep.address}`
    )
  }

  if (failures.length > 0) {
    console.error("\n✗ Deploy wiring verification FAILED:")
    for (const f of failures) console.error(`  - ${f}`)
    process.exitCode = 1
    return
  }
  console.log("\n✓ Deploy wiring verified.")
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
