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
///         TESTNET ONLY — there is no real signing key behind these wallets, so
///         no BTC can be swept/redeemed. This exists purely to exercise the
///         on-chain deposit-reveal/mint path on testnet/regtest.
contract TestWalletRegistry is EcdsaWalletRegistry {
    mapping(bytes32 => bytes) internal _walletKeys;
    uint256 private _walletCounter;

    /// @dev Generates a deterministic public key, records it, and synchronously
    ///      notifies the calling Bridge so the wallet becomes Live immediately.
    ///      `msg.sender` is the Bridge (it is the contract invoking the
    ///      registry), which is also the only address `registerNewWallet`
    ///      accepts as the registry callback caller.
    function requestNewWallet() external override {
        _walletCounter++;
        bytes32 walletID = keccak256(abi.encodePacked(_walletCounter));

        // Deterministic, non-zero, per-wallet-unique key coordinates. These are
        // not a real curve point — sufficient only to derive a unique
        // walletPubKeyHash on-chain (no off-chain signing exists for the stub).
        bytes32 publicKeyX = keccak256(
            abi.encodePacked("pBTC-test-wallet-x", _walletCounter)
        );
        bytes32 publicKeyY = keccak256(
            abi.encodePacked("pBTC-test-wallet-y", _walletCounter)
        );
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
