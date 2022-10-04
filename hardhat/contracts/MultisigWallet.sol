// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./MultisigFactory.sol";

error MultisigWallet__InvalidNumberOfSignaturesRequired();
error MultisigWallet__DuplicateOwnerAddress();
error MultisigWallet__InvalidAddress();
error MultisigWallet__DuplicateOrUnorderedSignatures();
error MultisigWallet__InsufficientSignatures();
error MultisigWallet__TransactionFailed();
error MultisigWallet__TransactionAlreadyExecuted();
error MultisigWallet__NotOwner();
error MultisigWallet__NotSelf();

contract MultisigWallet {
    using ECDSA for bytes32;

    MultisigFactory private immutable factory;
    address[] private owners;
    string private walletName;
    uint256 public nonce;
    uint256 public signaturesRequired;
    uint256 public proposedTxIndex;
    // uint256 public numberOfOwners;
    mapping(address => bool) public isOwner;
    mapping(uint => bool) public txExecuted;
    
    event DepositReceived(address from, uint value, uint contractBalance);
    event TransactionProposed(
        address indexed proposedBy,
        address to,
        uint256 value,
        bytes data,
        uint256 proposedTxIndex,
        bytes32 proposalHash
    );
    event TransactionExecuted(
        address indexed owner,
        address payable to,
        uint256 value,
        bytes data,
        uint256 nonce,
        bytes32 hash,
        bytes result
    );
    event OwnerAdded(
        address newOwner,
        uint256 signaturesRequired
    );
    event OwnerRemoved(
        address ownerRemoved,
        uint256 signaturesRequired
    );

    modifier onlyOwner() {
        if(!isOwner[msg.sender]) revert MultisigWallet__NotOwner();
        _;
    }

    modifier onlySelf() {
        if(msg.sender != address(this)) revert MultisigWallet__NotSelf();
        _;
    }

    constructor(
        string memory _name, 
        address[] memory _owners, 
        uint _signaturesRequired,
        address _factoryAddress
    ) 
        payable 
    {
        if(_signaturesRequired == 0) revert MultisigWallet__InvalidNumberOfSignaturesRequired();
        if(_signaturesRequired > _owners.length) revert MultisigWallet__InvalidNumberOfSignaturesRequired();
        for(uint i; i < _owners.length; i++) {
            address owner = _owners[i];
            if(isOwner[owner]) revert MultisigWallet__DuplicateOwnerAddress();
            if(owner == address(0)) revert MultisigWallet__InvalidAddress();
            // numberOfOwners++;
            isOwner[owner] = true;
        }
        owners = _owners;
        signaturesRequired = _signaturesRequired;
        walletName = _name;
        factory = MultisigFactory(_factoryAddress);
    }

    receive() external payable {
        emit DepositReceived(msg.sender, msg.value, address(this).balance);
    }

    function addOwner(address newOwner, uint256 newSignaturesRequired) public onlySelf {
        if(newOwner == address(0)) revert MultisigWallet__InvalidAddress();
        if(isOwner[newOwner]) revert MultisigWallet__DuplicateOwnerAddress();
        isOwner[newOwner] = true;
        // numberOfOwners++;
        owners.push(newOwner);
        if(!validNumberOfSignatures(newSignaturesRequired)) revert MultisigWallet__InvalidNumberOfSignaturesRequired();
        signaturesRequired = newSignaturesRequired;
        factory.addOwnerToWallet(newOwner, address(this));
        emit OwnerAdded(newOwner, signaturesRequired);
    }

    function removeOwner(address ownerToRemove, uint256 newSignaturesRequired) public onlySelf {
        if(!isOwner[ownerToRemove]) revert MultisigWallet__NotOwner();
        // isOwner[ownerToRemove] = false;
        // numberOfOwners--;
        _removeOwner(ownerToRemove);
        if(!validNumberOfSignatures(newSignaturesRequired)) revert MultisigWallet__InvalidNumberOfSignaturesRequired();
        signaturesRequired = newSignaturesRequired;
        factory.removeOwnerFromWallet(ownerToRemove, address(this));
        emit OwnerRemoved(ownerToRemove, signaturesRequired);
    }

    function _removeOwner(address _ownerToRemove) private {
        isOwner[_ownerToRemove] = false;
        uint256 ownersLength = owners.length;
        address[] memory poppedOwners = new address[](owners.length);
        for (uint256 i = ownersLength - 1; i >= 0; ) {
            if (owners[i] != _ownerToRemove) {
                poppedOwners[i] = owners[i];
                owners.pop();
            } else {
                owners.pop();
                for (uint256 j = i; j < ownersLength - 1; ) {
                    owners.push(poppedOwners[j + 1]); 
                    unchecked {
                        ++j;
                    }
                }
                return;
            }
            unchecked {
                --i;
            }
        }
    }

    function proposeTransaction(
        address to,
        uint256 value,
        bytes calldata data
    ) public onlyOwner returns(bytes32) 
    {
        proposedTxIndex++;
        bytes32 proposalHash = getTransactionHash(proposedTxIndex - 1, to, value, data);
        emit TransactionProposed(msg.sender, to, value, data, proposedTxIndex - 1, proposalHash);
        return proposalHash;
    } 

    function executeTransaction(
        uint256 txIndex,
        address payable to,
        uint256 value,
        bytes calldata data,
        bytes[] calldata signatures
    ) 
        public
        onlyOwner
        returns(bytes memory)
    {
        if(txExecuted[txIndex] == true) revert MultisigWallet__TransactionAlreadyExecuted();
        bytes32 _hash = getTransactionHash(txIndex, to, value, data);       
        nonce++;
        txExecuted[txIndex] = true; //test that this can't be abused here

        uint256 validSignatures;
        address duplicateGuard;
        for(uint256 i; i < signatures.length; i++){
            address recovered = recover(_hash, signatures[i]);
            if(recovered <= duplicateGuard) {
                revert MultisigWallet__DuplicateOrUnorderedSignatures();
            }
            duplicateGuard = recovered;
            if(isOwner[recovered]) {
                validSignatures++;
            }
        }
        
        if(validSignatures < signaturesRequired) {
            revert MultisigWallet__InsufficientSignatures();
        }

        (bool success, bytes memory result) = to.call{value: value}(data);
        if (!success) {
            revert MultisigWallet__TransactionFailed();
        }

        emit TransactionExecuted(msg.sender, to, value, data, nonce - 1, _hash, result);

        return result;
    }

    function getTransactionHash(uint256 _proposedTxId, address to, uint256 value, bytes memory data) 
        public view returns (bytes32) 
    {
        return keccak256(abi.encodePacked(address(this), _proposedTxId, to, value, data));
    }

    function recover(bytes32 _hash, bytes memory _signature) public pure returns (address) {
        return _hash.toEthSignedMessageHash().recover(_signature);
    }

    function getName() public view returns(string memory) {
        return walletName;
    }

    function validNumberOfSignatures(uint256 newSignaturesRequired) public view returns(bool valid) {
        if(newSignaturesRequired > 0 && newSignaturesRequired <= owners.length) return true;
    }

    function getOwners() public view returns(address[] memory) {
        return owners;
    }
}
