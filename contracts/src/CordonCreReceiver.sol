// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ISealRegistry} from "./interfaces/ISealRegistry.sol";

interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

contract CordonCreReceiver is IReceiver {
    address public immutable forwarder;
    ISealRegistry public immutable registry;
    address public immutable expectedWorkflowOwner;

    error NotForwarder(address caller);
    error WrongWorkflowOwner(address owner);
    error MetadataTooShort(uint256 length);

    constructor(address forwarder_, ISealRegistry registry_, address expectedWorkflowOwner_) {
        forwarder = forwarder_;
        registry = registry_;
        expectedWorkflowOwner = expectedWorkflowOwner_;
    }

    function onReport(bytes calldata metadata, bytes calldata report) external {
        if (msg.sender != forwarder) revert NotForwarder(msg.sender);
        if (expectedWorkflowOwner != address(0)) {
            if (metadata.length < 62) revert MetadataTooShort(metadata.length);
            address owner = address(bytes20(metadata[42:62]));
            if (owner != expectedWorkflowOwner) revert WrongWorkflowOwner(owner);
        }
        (string memory name, string memory version, bytes32 evidenceHash) = abi.decode(report, (string, string, bytes32));
        registry.submitVerdict("npm", name, version, evidenceHash);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
