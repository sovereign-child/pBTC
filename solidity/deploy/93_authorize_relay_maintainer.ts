import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function authorizeLightRelayMaintainer(
  hre: HardhatRuntimeEnvironment
) {
  const { getNamedAccounts, deployments } = hre
  const { execute } = deployments
  const { deployer } = await getNamedAccounts()

  await execute(
    "LightRelay",
    { from: deployer, log: true, waitConfirmations: 1 },
    "setAuthorizationStatus",
    true
  )
}

export default func

func.tags = ["AuthorizeLightRelayMaintainer"]
func.dependencies = ["RetargetLightRelay"]

// Only execute for Ethereum mainnet (upstream tBTC). Deliberately NOT run on
// PulseChain: enabling authorization would restrict `retarget` to authorized
// submitters, but pBTC's design keeps header submission permissionless so any
// validator sidecar can keep the relay live (docs/SECURITY-ROADMAP.md §4.4),
// and `apps/pbtc-relay-maintainer` calls `LightRelay.retarget` directly.
func.skip = async (hre: HardhatRuntimeEnvironment): Promise<boolean> =>
  hre.network.name !== "mainnet"
