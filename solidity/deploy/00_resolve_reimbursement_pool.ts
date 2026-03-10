import type { HardhatRuntimeEnvironment } from "hardhat/types"
import type { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function resolveReimbursementPool(
  hre: HardhatRuntimeEnvironment
) {
  const { deployments, helpers } = hre
  const { log } = deployments

  const ReimbursementPool = await deployments.getOrNull("ReimbursementPool")

  if (ReimbursementPool && helpers.address.isValid(ReimbursementPool.address)) {
    log(`using existing ReimbursementPool at ${ReimbursementPool.address}`)
  } else if (
    hre.network.name === "pulsechainTestnet" ||
    hre.network.name === "hardhat" ||
    hre.network.name === "development"
  ) {
    const { deployer } = await hre.getNamedAccounts()
    log("deploying TestReimbursementPool stub for testnet")

    await deployments.deploy("ReimbursementPool", {
      contract: "TestReimbursementPool",
      from: deployer,
      log: true,
      waitConfirmations: 1,
    })
  } else {
    throw new Error("deployed ReimbursementPool contract not found")
  }
}

export default func

func.tags = ["ReimbursementPool"]
