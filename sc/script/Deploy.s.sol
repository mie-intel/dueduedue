// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/MockUSD.sol";
import "../src/MockIDRX.sol";
import "../src/QuestionPool.sol";
import "../src/CasualPool.sol";
import "../src/GameSession.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("MONAD_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address relayer = vm.envOr("RELAYER_ADDRESS", deployer);
        address treasury = deployer;

        vm.startBroadcast(deployerKey);

        // MockUSD (kept, not active payment token)
        MockUSD mockUSDImpl = new MockUSD();
        address mockUSD = address(new ERC1967Proxy(
            address(mockUSDImpl),
            abi.encodeCall(MockUSD.initialize, ())
        ));
        console2.log("MockUSD proxy:      ", mockUSD);

        // MockIDRX (2 decimals, active payment token for Monad testing)
        MockIDRX mockIDRXImpl = new MockIDRX();
        address mockIDRX = address(new ERC1967Proxy(
            address(mockIDRXImpl),
            abi.encodeCall(MockIDRX.initialize, ())
        ));
        console2.log("MockIDRX proxy:     ", mockIDRX);

        // QuestionPool
        QuestionPool questionPoolImpl = new QuestionPool();
        address questionPool = address(new ERC1967Proxy(
            address(questionPoolImpl),
            abi.encodeCall(QuestionPool.initialize, (deployer))
        ));
        console2.log("QuestionPool proxy: ", questionPool);

        // CasualPool (uses IDRX, reads contributor from QuestionPool)
        CasualPool casualPoolImpl = new CasualPool();
        address casualPool = address(new ERC1967Proxy(
            address(casualPoolImpl),
            abi.encodeCall(CasualPool.initialize, (deployer, treasury, mockIDRX, questionPool))
        ));
        console2.log("CasualPool proxy:   ", casualPool);

        // GameSession (uses IDRX)
        GameSession gameSessionImpl = new GameSession();
        address gameSession = address(new ERC1967Proxy(
            address(gameSessionImpl),
            abi.encodeCall(GameSession.initialize, (deployer, treasury, mockIDRX, questionPool, casualPool))
        ));
        console2.log("GameSession proxy:  ", gameSession);

        // Grant roles to relayer
        QuestionPool(questionPool).grantRole(QuestionPool(questionPool).VERIFIER_ROLE(), relayer);
        QuestionPool(questionPool).grantRole(QuestionPool(questionPool).GAME_ROLE(), relayer);
        GameSession(gameSession).grantRole(GameSession(gameSession).RELAYER_ROLE(), relayer);
        // Grant GameSession permission to credit CasualPool pending royalties
        bytes32 CR = CasualPool(casualPool).GAME_ROLE();
        CasualPool(casualPool).grantRole(CR, gameSession);

        vm.stopBroadcast();

        console2.log("\n--- .env.local (copy-paste, no spaces) ---");
        console2.log(string.concat("NEXT_PUBLIC_MOCK_USD_ADDRESS=",         vm.toString(mockUSD)));
        console2.log(string.concat("NEXT_PUBLIC_MOCK_IDRX_ADDRESS=",        vm.toString(mockIDRX)));
        console2.log(string.concat("NEXT_PUBLIC_QUESTION_POOL_ADDRESS=",    vm.toString(questionPool)));
        console2.log(string.concat("NEXT_PUBLIC_CASUAL_POOL_ADDRESS=",      vm.toString(casualPool)));
        console2.log(string.concat("NEXT_PUBLIC_GAME_SESSION_ADDRESS=",     vm.toString(gameSession)));
        console2.log(string.concat("NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS=",    vm.toString(mockIDRX)));
    }
}
