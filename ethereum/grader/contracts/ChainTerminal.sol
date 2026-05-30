// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IChainTerminal.sol";

contract ChainTerminal is IChainTerminal {
    address public prevLink;
    address public owner;
    uint256 public recordCount;

    struct FinalRecord {
        uint256 chainId;
        bytes data;
        bytes32 dataHash;
        uint256 timestamp;
        bool exists;
    }

    mapping(uint256 => FinalRecord) private records;
    uint256[] private chainIds;

    modifier onlyPrevLink() {
        require(msg.sender == prevLink, "Only prevLink can call this");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setPrevLink(address _prevLink) external onlyOwner {
        require(_prevLink != address(0), "Invalid address");
        prevLink = _prevLink;
    }

    function receiveFinal(uint256 chainId, bytes calldata data) external onlyPrevLink returns (bool) {
        require(!records[chainId].exists, "Chain ID already exists");

        bytes32 dataHash = keccak256(data);
        records[chainId] = FinalRecord({
            chainId: chainId,
            data: data,
            dataHash: dataHash,
            timestamp: block.timestamp,
            exists: true
        });
        chainIds.push(chainId);
        recordCount++;

        emit FinalReceived(prevLink, chainId, data, block.timestamp);
        emit ChainCompleted(chainId, dataHash);

        return true;
    }

    function getRecord(uint256 chainId) external view returns (uint256, bytes memory, bytes32, uint256, bool) {
        FinalRecord storage r = records[chainId];
        return (r.chainId, r.data, r.dataHash, r.timestamp, r.exists);
    }

    function getAllRecords() external view returns (uint256[] memory, bytes[] memory, bytes32[] memory, uint256[] memory) {
        uint256 len = chainIds.length;
        uint256[] memory ids = new uint256[](len);
        bytes[] memory datas = new bytes[](len);
        bytes32[] memory hashes = new bytes32[](len);
        uint256[] memory timestamps = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            FinalRecord storage r = records[chainIds[i]];
            ids[i] = r.chainId;
            datas[i] = r.data;
            hashes[i] = r.dataHash;
            timestamps[i] = r.timestamp;
        }

        return (ids, datas, hashes, timestamps);
    }

    function getRecordCount() external view returns (uint256) {
        return recordCount;
    }
}