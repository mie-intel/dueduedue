// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/CasualPool.sol";
import "../src/GameSession.sol";

/// @notice Upgrade CasualPool and GameSession implementations only.
/// Fixes IQuestionPool ABI mismatch (string member was wrongly included in interface).
contract UpgradePools is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("MONAD_PRIVATE_KEY");

        address casualPoolProxy  = vm.envAddress("NEXT_PUBLIC_CASUAL_POOL_ADDRESS");
        address gameSessionProxy = vm.envAddress("NEXT_PUBLIC_GAME_SESSION_ADDRESS");

        vm.startBroadcast(deployerKey);

        // Deploy new implementations
        CasualPool  newCasualImpl  = new CasualPool();
        GameSession newGameImpl    = new GameSession();

        console2.log("New CasualPool impl: ", address(newCasualImpl));
        console2.log("New GameSession impl:", address(newGameImpl));

        // Upgrade proxies (caller must be DEFAULT_ADMIN_ROLE)
        CasualPool(casualPoolProxy).upgradeToAndCall(address(newCasualImpl), "");
        GameSession(gameSessionProxy).upgradeToAndCall(address(newGameImpl), "");

        vm.stopBroadcast();

        console2.log("Upgrade complete.");
    }
}
