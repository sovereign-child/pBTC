// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.17;

import {IWalletRegistry as EcdsaWalletRegistry} from "@keep-network/ecdsa/contracts/api/IWalletRegistry.sol";
import {EcdsaDkg} from "@keep-network/ecdsa/contracts/libraries/EcdsaDkg.sol";

/// @title TestWalletRegistry
/// @notice Minimal stub of WalletRegistry for testnet deployments where
///         the full ECDSA threshold stack is not available.
///         Stores dummy public keys per walletID so the Bridge can initialize
///         and basic wallet lifecycle calls don't revert.
contract TestWalletRegistry is EcdsaWalletRegistry {
    mapping(bytes32 => bytes) internal _walletKeys;
    uint256 private _walletCounter;

    /// @dev Stores a dummy 64-byte uncompressed public key for the new wallet.
    function requestNewWallet() external override {
        _walletCounter++;
        bytes32 walletID = keccak256(abi.encodePacked(_walletCounter));
        // Generate a deterministic but non-zero 64-byte key
        _walletKeys[walletID] = abi.encodePacked(walletID, walletID);
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
