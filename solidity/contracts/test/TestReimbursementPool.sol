// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.17;

/// @title TestReimbursementPool
/// @notice Minimal stub of ReimbursementPool for testnet deployments where
///         the full random-beacon stack is not available. All refund calls
///         are no-ops; the contract just needs to exist at an address so
///         that Bridge can be initialized.
contract TestReimbursementPool {
    mapping(address => bool) public isAuthorized;
    uint256 public staticGas;
    uint256 public maxGasPrice;

    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        staticGas = 21000;
        maxGasPrice = 200 gwei;
    }

    function authorize(address _contract) external onlyOwner {
        isAuthorized[_contract] = true;
    }

    function unauthorize(address _contract) external onlyOwner {
        isAuthorized[_contract] = false;
    }

    /// @dev No-op on testnet — just returns without refunding.
    function refund(uint256, address) external {
        // intentionally empty
    }

    function setStaticGas(uint256 _staticGas) external onlyOwner {
        staticGas = _staticGas;
    }

    function setMaxGasPrice(uint256 _maxGasPrice) external onlyOwner {
        maxGasPrice = _maxGasPrice;
    }

    receive() external payable {}
}
