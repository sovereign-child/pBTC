import { ethers } from "hardhat"
import { expect } from "chai"

const { getContractFactory, utils } = ethers

// keccak256(abi.encodePacked(...)) helpers matching TestWalletRegistry.
const walletId = (counter: number): string =>
  utils.solidityKeccak256(["uint256"], [counter])
const pubX = (counter: number): string =>
  utils.solidityKeccak256(["string", "uint256"], ["pBTC-test-wallet-x", counter])
const pubY = (counter: number): string =>
  utils.solidityKeccak256(["string", "uint256"], ["pBTC-test-wallet-y", counter])

describe("TestWalletRegistry (testnet stub)", () => {
  const deploy = async () => {
    const registry = await (await getContractFactory("TestWalletRegistry")).deploy()
    const recorder = await (
      await getContractFactory("MockBridgeWalletCallbackRecorder")
    ).deploy()
    return { registry, recorder }
  }

  it("notifies the Bridge via __ecdsaWalletCreatedCallback on requestNewWallet", async () => {
    const { registry, recorder } = await deploy()

    await recorder.triggerRequest(registry.address)

    expect(await recorder.callbackCount()).to.equal(1)
    expect(await recorder.lastWalletID()).to.equal(walletId(1))
    expect(await recorder.lastPublicKeyX()).to.equal(pubX(1))
    expect(await recorder.lastPublicKeyY()).to.equal(pubY(1))
  })

  it("exposes the same public key the Bridge registered via getWalletPublicKey", async () => {
    const { registry, recorder } = await deploy()
    await recorder.triggerRequest(registry.address)

    const stored = await registry.getWalletPublicKey(walletId(1))
    expect(stored).to.equal(utils.hexConcat([pubX(1), pubY(1)]))
  })

  it("creates a distinct wallet on each request", async () => {
    const { registry, recorder } = await deploy()

    await recorder.triggerRequest(registry.address)
    await recorder.triggerRequest(registry.address)

    expect(await recorder.callbackCount()).to.equal(2)
    expect(await recorder.lastWalletID()).to.equal(walletId(2))
    expect(await recorder.lastPublicKeyX()).to.equal(pubX(2))
    // keys differ between wallet 1 and wallet 2
    expect(pubX(1)).to.not.equal(pubX(2))
  })
})
