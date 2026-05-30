// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChainTerminal {
    event FinalReceived(address indexed from, uint256 indexed chainId, bytes data, uint256 timestamp);
    event ChainCompleted(uint256 indexed chainId, bytes32 dataHash);

    function setPrevLink(address _prevLink) external;
    function receiveFinal(uint256 chainId, bytes calldata data) external returns (bool);
    function getRecord(uint256 chainId) external view returns (uint256, bytes memory, bytes32, uint256, bool);
    function getAllRecords() external view returns (uint256[] memory chainIds, bytes[] memory data, bytes32[] memory hashes, uint256[] memory timestamps);
    function getRecordCount() external view returns (uint256);
}