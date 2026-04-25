// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IQuestionPool {
    function questions(uint256 id)
        external
        view
        returns (
            uint256 qId,
            address contributor,
            string memory ipfsHash,
            bool isVerified,
            uint8 difficulty,
            uint256 timesPlayed,
            uint256 royaltyEarned
        );
}
