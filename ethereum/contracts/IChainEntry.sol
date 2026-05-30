// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChainEntry {
    event ChainStarted(uint256 indexed chainId, address indexed initiator, bytes data);
    event EntryExecuted(uint256 indexed chainId, address indexed nextLink);

    function setNextLink(address _nextLink) external;
    function startChain(bytes calldata data) external returns (uint256);
    function getReceipt(uint256 _chainId) external view returns (uint256, address, bytes memory, bool);
    function getAllChainIds() external view returns (uint256[] memory);
}