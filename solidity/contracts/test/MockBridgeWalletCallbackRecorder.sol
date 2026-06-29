// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.17;

interface IWalletRegistryRequest {
    function requestNewWallet() external;
}

/// @title MockBridgeWalletCallbackRecorder
/// @notice Test-only stand-in for the Bridge's ECDSA wallet callback surface.
///         It triggers `requestNewWallet` on a registry (so the registry sees
///         this contract as `msg.sender`, like the real Bridge does) and records
///         the resulting `__ecdsaWalletCreatedCallback` invocation. Used to
///         verify that TestWalletRegistry actually drives the callback.
contract MockBridgeWalletCallbackRecorder {
    bytes32 public lastWalletID;
    bytes32 public lastPublicKeyX;
    bytes32 public lastPublicKeyY;
    uint256 public callbackCount;

    function triggerRequest(address registry) external {
        IWalletRegistryRequest(registry).requestNewWallet();
    }

    function __ecdsaWalletCreatedCallback(
        bytes32 ecdsaWalletID,
        bytes32 publicKeyX,
        bytes32 publicKeyY
    ) external {
        lastWalletID = ecdsaWalletID;
        lastPublicKeyX = publicKeyX;
        lastPublicKeyY = publicKeyY;
        callbackCount++;
    }
}
