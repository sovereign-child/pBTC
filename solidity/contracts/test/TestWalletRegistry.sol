// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.17;

import {IWalletRegistry as EcdsaWalletRegistry} from "@keep-network/ecdsa/contracts/api/IWalletRegistry.sol";
import {EcdsaDkg} from "@keep-network/ecdsa/contracts/libraries/EcdsaDkg.sol";

/// @notice The slice of the Bridge's ECDSA wallet callback surface this stub
///         drives. Mirrors `Bridge.__ecdsaWalletCreatedCallback`.
interface IBridgeEcdsaWalletCallback {
    function __ecdsaWalletCreatedCallback(
        bytes32 ecdsaWalletID,
        bytes32 publicKeyX,
        bytes32 publicKeyY
    ) external;
}

/// @title TestWalletRegistry
/// @notice Minimal stub of WalletRegistry for testnet deployments where the full
///         ECDSA threshold stack is not available. It simulates *instant* DKG:
///         when the Bridge calls `requestNewWallet`, the stub immediately calls
///         the Bridge back via `__ecdsaWalletCreatedCallback` with a
///         deterministic public key, so the Bridge actually registers a Live
///         wallet (and a deposit address can be derived). The real registry does
///         this asynchronously after distributed key generation.
///
///         TESTNET ONLY — single-key interim custody. The wallet is backed by a
///         real, well-known, signer-held keypair (so the pBTC test-signer can
///         actually sign BTC sweeps/redemptions), NOT a distributed threshold
///         group. Never use with value; mainnet custody is the keep-core network.
contract TestWalletRegistry is EcdsaWalletRegistry {
    mapping(bytes32 => bytes) internal _walletKeys;
    uint256 private _walletCounter;

    // The pBTC test-signer's wallet public key — a REAL secp256k1 point whose
    // private key the signer holds, so it can actually sign BTC sweeps (test
    // milestone M1, see docs/pbtc-test-signer-spec.md). Coordinates of the pubkey
    // for the well-known TESTNET-ONLY private key
    //   0x1111111111111111111111111111111111111111111111111111111111111111
    // Publicly known on purpose (nothing-up-my-sleeve, no value on testnet). The
    // Bridge derives walletPubKeyHash = hash160(compressPublicKey(X,Y)); the
    // signer derives the same hash from the private key, so they match.
    bytes32 internal constant TEST_WALLET_PUBKEY_X =
        0x4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa;
    bytes32 internal constant TEST_WALLET_PUBKEY_Y =
        0x385b6b1b8ead809ca67454d9683fcf2ba03456d6fe2c4abe2b07f0fbdbb2f1c1;

    /// @dev Registers a single test wallet backed by a real, signer-held keypair,
    ///      and synchronously notifies the calling Bridge so the wallet becomes
    ///      Live immediately. `msg.sender` is the Bridge (it is the contract
    ///      invoking the registry), which is also the only address
    ///      `registerNewWallet` accepts as the registry callback caller.
    ///
    ///      Single-key interim custody: because the key is fixed, a second
    ///      `requestNewWallet` produces the same walletPubKeyHash and the Bridge
    ///      rejects it as already registered — one testnet wallet, as intended.
    function requestNewWallet() external override {
        _walletCounter++;
        bytes32 walletID = keccak256(abi.encodePacked(_walletCounter));

        bytes32 publicKeyX = TEST_WALLET_PUBKEY_X;
        bytes32 publicKeyY = TEST_WALLET_PUBKEY_Y;
        _walletKeys[walletID] = abi.encodePacked(publicKeyX, publicKeyY);

        // Simulate instant DKG completion: the Bridge registers the wallet.
        IBridgeEcdsaWalletCallback(msg.sender).__ecdsaWalletCreatedCallback(
            walletID,
            publicKeyX,
            publicKeyY
        );
    }

    function closeWallet(bytes32) external override {
        // no-op
    }

    function seize(
        uint96,
        uint256,
        address,
        bytes32,
        uint32[] calldata
    ) external override {
        // no-op
    }

    function getWalletPublicKey(
        bytes32 walletID
    ) external view override returns (bytes memory) {
        bytes memory key = _walletKeys[walletID];
        if (key.length == 0) {
            // Return a dummy key so calls don't revert
            return abi.encodePacked(walletID, walletID);
        }
        return key;
    }

    function getWalletCreationState() external pure override returns (EcdsaDkg.State) {
        return EcdsaDkg.State.IDLE;
    }

    function isWalletMember(
        bytes32,
        uint32[] calldata,
        address,
        uint256
    ) external pure override returns (bool) {
        return true;
    }
}
