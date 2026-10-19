import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function transferLightRelayOwnership(
  hre: HardhatRuntimeEnvironment
) {
  const { getNamedAccounts, helpers } = hre
  const { deployer, governance } = await getNamedAccounts()

  await helpers.ownable.transferOwnership("LightRelay", governance, deployer)
}

export default func

func.tags = ["TransferLightRelayOwnership"]
func.dependencies = ["LightRelay"]
func.runAtTheEnd = true

// Runs on Ethereum mainnet and on both PulseChain networks. On PulseChain the
// relay is genesis'd after deploy by `apps/pbtc-relay-maintainer`
// (`npm run genesis`), and `genesis` is owner-only — so after this transfer the
// genesis transaction must be sent by `governance`. Genesis BEFORE handing
// governance to a multisig, or submit it through the multisig.
func.skip = async (hre: HardhatRuntimeEnvironment): Promise<boolean> =>
  !["mainnet", "pulsechain", "pulsechainTestnet"].includes(hre.network.name)
