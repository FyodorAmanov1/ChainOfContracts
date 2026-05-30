// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChainLink {
    event LinkExecuted(uint256 indexed chainId, uint256 indexed stepNumber, address indexed nextLink, bytes transformedData);
    event LinkValidationFailed(uint256 indexed chainId, string reason);

    function setNextLink(address _nextLink) external;
    function setStepNumber(uint256 _step) external;
    function processAndForward(uint256 chainId, bytes calldata data) external returns (bool);
    function getStepNumber() external view returns (uint256);
    function getNextLink() external view returns (address);
    function getExecutionCount() external view returns (uint256);
}