// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IChainLink.sol";

contract ChainLink is IChainLink {
    address public nextLink;
    address public prevLink;
    address public owner;
    uint256 public stepNumber;
    uint256 public executionCount;

    struct ExecutionRecord {
        bool executed;
        bytes result;
        bool exists;
    }

    mapping(uint256 => ExecutionRecord) private executions;

    modifier onlyPrevLink() {
        require(msg.sender == prevLink, "Only prevLink can call this");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    constructor(uint256 _stepNumber) {
        owner = msg.sender;
        stepNumber = _stepNumber;
        nextLink = address(0);
        prevLink = address(0);
    }

    function setNextLink(address _nextLink) external onlyOwner {
        require(_nextLink != address(0), "Invalid address");
        nextLink = _nextLink;
    }

    function setPrevLink(address _prevLink) external onlyOwner {
        require(_prevLink != address(0), "Invalid address");
        prevLink = _prevLink;
    }

    function setStepNumber(uint256 _step) external onlyOwner {
        stepNumber = _step;
    }

    /// Entry point called by the previous link (Entry or another ChainLink)
    function processAndForward(uint256 chainId, bytes calldata data) external onlyPrevLink returns (bool) {
        return _execute(chainId, data);
    }

    /// Alternate entry point so downstream links can call via IChainTerminal.receiveFinal
    function receiveFinal(uint256 chainId, bytes calldata data) external onlyPrevLink returns (bool) {
        return _execute(chainId, data);
    }

    function _execute(uint256 chainId, bytes memory data) internal returns (bool) {
        // Validate: data must be non-empty and within reasonable length
        if (data.length == 0) {
            emit LinkValidationFailed(chainId, "Data is empty");
            return false;
        }
        if (data.length > 1024) {
            emit LinkValidationFailed(chainId, "Data exceeds maximum length");
            return false;
        }

        // Transform data by prepending a validation marker
        bytes memory transformedData = abi.encodePacked("[VALIDATED]", data);

        executions[chainId] = ExecutionRecord({
            executed: true,
            result: transformedData,
            exists: true
        });
        executionCount++;

        emit LinkExecuted(chainId, stepNumber, nextLink, transformedData);

        // Forward to next contract (via IChainTerminal.receiveFinal for uniform interface)
        if (nextLink != address(0)) {
            (bool callSuccess, bytes memory returnData) = nextLink.call(
                abi.encodeWithSignature("receiveFinal(uint256,bytes)", chainId, transformedData)
            );
            require(callSuccess && abi.decode(returnData, (bool)), "Forward to next contract failed");
        }

        return true;
    }

    function getStepNumber() external view returns (uint256) {
        return stepNumber;
    }

    function getNextLink() external view returns (address) {
        return nextLink;
    }

    function getExecutionCount() external view returns (uint256) {
        return executionCount;
    }

    function getExecution(uint256 chainId) external view returns (bool executed, bytes memory result) {
        ExecutionRecord storage e = executions[chainId];
        return (e.executed, e.result);
    }
}