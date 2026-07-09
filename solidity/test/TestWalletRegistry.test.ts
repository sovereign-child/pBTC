import { ethers } from "hardhat"
import { expect } from "chai"

const { getContractFactory, utils } = ethers

// walletID is keccak256(abi.encodePacked(counter)); the pubkey is a fixed, real,
// signer-held keypair (pubkey of testnet privkey 0x11..11 — see TestWalletRegistry).
const walletId = (counter: number): string =>
  utils.solidityKeccak256(["uint256"], [counter])
const TEST_PUBKEY_X =
  "0x4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa"
const TEST_PUBKEY_Y =
  "0x385b6b1b8ead809ca67454d9683fcf2ba03456d6fe2c4abe2b07f0fbdbb2f1c1"

describe("TestWalletRegistry (testnet stub)", () => {
  const deploy = async () => {
    const registry = await (await getContractFactory("TestWalletRegistry")).deploy()
    const recorder = await (
      await getContractFactory("MockBridgeWalletCallbackRecorder")
    ).deploy()
    return { registry, recorder }
  }

  it("notifies the Bridge via __ecdsaWalletCreatedCallback with the real signer pubkey", async () => {
    const { registry, recorder } = await deploy()

    await recorder.triggerRequest(registry.address)

    expect(await recorder.callbackCount()).to.equal(1)
    expect(await recorder.lastWalletID()).to.equal(walletId(1))
    expect(await recorder.lastPublicKeyX()).to.equal(TEST_PUBKEY_X)
    expect(await recorder.lastPublicKeyY()).to.equal(TEST_PUBKEY_Y)
  })

  it("exposes the same public key the Bridge registered via getWalletPublicKey", async () => {
    const { registry, recorder } = await deploy()
    await recorder.triggerRequest(registry.address)

    const stored = await registry.getWalletPublicKey(walletId(1))
    expect(stored).to.equal(utils.hexConcat([TEST_PUBKEY_X, TEST_PUBKEY_Y]))
  })

  it("uses one stable signer key across requests (single-key interim custody)", async () => {
    const { registry, recorder } = await deploy()

    // The recorder mock does not enforce the Bridge's uniqueness check, so it
    // records both callbacks; the real Bridge would reject the second wallet as
    // already registered (same walletPubKeyHash). The key must be identical.
    await recorder.triggerRequest(registry.address)
    const firstX = await recorder.lastPublicKeyX()
    await recorder.triggerRequest(registry.address)
    const secondX = await recorder.lastPublicKeyX()

    expect(firstX).to.equal(TEST_PUBKEY_X)
    expect(secondX).to.equal(TEST_PUBKEY_X)
  })
})
