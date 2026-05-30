// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IChainEntry.sol";
import "./IChainLink.sol";

contract ChainEntry is IChainEntry {
    address public nextLink;
    address public owner;
    uint256 public chainCounter;

    struct ChainReceipt {
        uint256 chainId;
        address initiator;
        bytes data;
        bool completed;
    }

    mapping(uint256 => ChainReceipt) public receipts;
    uint256[] private chainIds;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setNextLink(address _nextLink) external onlyOwner {
        require(_nextLink != address(0), "Invalid address");
        nextLink = _nextLink;
    }

    function startChain(bytes calldata data) external returns (uint256) {
        require(nextLink != address(0), "NextLink not set");
        require(data.length > 0, "Data cannot be empty");

        chainCounter++;
        uint256 currentChainId = chainCounter;

        receipts[currentChainId] = ChainReceipt({
            chainId: currentChainId,
            initiator: msg.sender,
            data: data,
            completed: false
        });
        chainIds.push(currentChainId);

        emit ChainStarted(currentChainId, msg.sender, data);
        emit EntryExecuted(currentChainId, nextLink);

        // Forward to the first ChainLink
        bool success = IChainLink(nextLink).processAndForward(currentChainId, data);
        require(success, "Chain forwarding failed");

        receipts[currentChainId].completed = true;

        return currentChainId;
    }

    function getReceipt(uint256 _chainId) external view returns (uint256, address, bytes memory, bool) {
        ChainReceipt storage r = receipts[_chainId];
        return (r.chainId, r.initiator, r.data, r.completed);
    }

    function getAllChainIds() external view returns (uint256[] memory) {
        return chainIds;
    }
}