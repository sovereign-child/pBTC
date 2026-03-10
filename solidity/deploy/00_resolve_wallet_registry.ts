import type { HardhatRuntimeEnvironment } from "hardhat/types"
import type { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function resolveWalletRegistry(
  hre: HardhatRuntimeEnvironment
) {
  const { deployments, helpers } = hre
  const { log } = deployments

  const WalletRegistry = await deployments.getOrNull("WalletRegistry")

  if (WalletRegistry && helpers.address.isValid(WalletRegistry.address)) {
    log(`using existing WalletRegistry at ${WalletRegistry.address}`)
  } else if (
    hre.network.name === "pulsechainTestnet" ||
    hre.network.name === "hardhat" ||
    hre.network.name === "development"
  ) {
    const { deployer } = await hre.getNamedAccounts()
    log("deploying TestWalletRegistry stub for testnet")

    await deployments.deploy("WalletRegistry", {
      contract: "TestWalletRegistry",
      from: deployer,
      log: true,
      waitConfirmations: 1,
    })
  } else {
    throw new Error("deployed WalletRegistry contract not found")
  }
}

export default func

func.tags = ["WalletRegistry"]
