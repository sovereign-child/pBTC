import type { HardhatRuntimeEnvironment } from "hardhat/types"
import type { DeployFunction } from "hardhat-deploy/types"

// Disable optimistic minting at launch.
//
// pBTC launches with the optimistic-minting path OFF: minting must require a
// full on-chain SPV proof, with no minter/guardian trust assumption on day one
// (see docs/SECURITY-ROADMAP.md §3 Layer 1). TBTCVault inherits
// TBTCOptimisticMinting, whose `isOptimisticMintingPaused` defaults to false and
// is only ever set true by an explicit owner call — which no deploy step made,
// leaving the path enabled by default. This step pauses it as the deployer
// (still the TBTCVault owner at this point; ownership transfers later in
// 23_transfer_tbtc_vault_ownership) and asserts no minters were added.
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre
  const { execute, read, log } = deployments
  const { deployer } = await getNamedAccounts()

  // Invariant: optimistic minting must not have any authorized minters at launch.
  const minters: string[] = await read("TBTCVault", "getMinters")
  if (minters.length > 0) {
    throw new Error(
      `Refusing to launch: TBTCVault has ${minters.length} optimistic-minting minter(s) (${minters.join(
        ", "
      )}). Optimistic minting must be disabled with zero minters at launch.`
    )
  }

  const alreadyPaused: boolean = await read("TBTCVault", "isOptimisticMintingPaused")
  if (alreadyPaused) {
    log("optimistic minting already paused; nothing to do")
    return
  }

  log("pausing optimistic minting in TBTCVault (SPV-proof-only minting at launch)")
  await execute(
    "TBTCVault",
    { from: deployer, log: true, waitConfirmations: 1 },
    "pauseOptimisticMinting"
  )
}

export default func

func.tags = ["PauseOptimisticMinting"]
func.dependencies = ["TBTCVault"]

// Only relevant for the PulseChain launch networks. We deliberately do NOT run
// this on hardhat/development so existing unit tests can still exercise the
// optimistic-minting flow.
func.skip = async (hre: HardhatRuntimeEnvironment): Promise<boolean> =>
  hre.network.name !== "pulsechainTestnet" && hre.network.name !== "pulsechain"
