// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @notice Testnet-only mock IDRX stablecoin. 2 decimals (IDR). Public mint for testing.
/// @dev Rp 500 = 50_000 | Rp 5_000 = 500_000 | Rp 50_000 = 5_000_000
contract MockIDRX is ERC20Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() external initializer {
        __ERC20_init("IDRX", "IDRX");
        __Ownable_init(msg.sender);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 2;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
