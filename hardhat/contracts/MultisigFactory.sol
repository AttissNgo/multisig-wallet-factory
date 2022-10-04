// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "./MultisigWallet.sol";

error MultisigFactory__NotWallet();
error MultisigFactory__AlreadyOwner();
error MultisigFactory__NotOwner();

contract MultisigFactory {
    MultisigWallet[] private wallets;
    mapping(address => bool) public walletExists;
    mapping(address => mapping(address => bool)) public usersWallets;

    event WalletCreated(
        uint256 indexed walletIndex, 
        string name,
        address indexed contractAddress,
        address[] owners,
        uint256 signaturesRequired,
        address createdBy
    );

    modifier onlyWallet() {
        if(!walletExists[msg.sender]) revert MultisigFactory__NotWallet();
        _;
    }

    //create2
    function createNewWallet(
        string calldata _name,
        address[] calldata _owners,
        uint256 _signaturesRequired
    )
        public
        payable
    {
        uint256 walletIndex = numberOfWallets();
        bytes32 _salt = keccak256(
            abi.encodePacked(abi.encode(_name, walletIndex, address(msg.sender)))
        );

        address walletAddress = payable(
            Create2.deploy(
                msg.value, 
                _salt, 
                abi.encodePacked(
                    type(MultisigWallet).creationCode,
                    abi.encode(_name, _owners, _signaturesRequired, address(this))
                )
            )
        );

        MultisigWallet wallet = MultisigWallet(payable(walletAddress));
        wallets.push(wallet);
        walletExists[address(walletAddress)] = true;
        for(uint256 i; i < _owners.length; i++){
            usersWallets[_owners[i]][walletAddress] = true;
        }
        emit WalletCreated(
            walletIndex, 
            _name, 
            address(wallet), 
            _owners, 
            _signaturesRequired, 
            msg.sender
        );
    }

    function computedAddress(
        string calldata _name,
        address[] calldata _owners,
        uint256 _signaturesRequired,
        uint256 _walletIndex
    ) 
        public 
        view 
        returns(address) 
    {
        bytes32 _bytecodeHash = keccak256(
            abi.encodePacked(
                type(MultisigWallet).creationCode,
                abi.encode(_name, _owners, _signaturesRequired, address(this))
            )
        );

        bytes32 _salt = keccak256(
            abi.encodePacked(abi.encode(_name, _walletIndex, address(msg.sender)))
        );

        address computed_address = Create2.computeAddress(_salt, _bytecodeHash);
        return computed_address;
    }

    function addOwnerToWallet(address newOwner, address wallet) external onlyWallet {
        if(usersWallets[newOwner][wallet]) revert MultisigFactory__AlreadyOwner();
        usersWallets[newOwner][wallet] = true;
    }

    function removeOwnerFromWallet(address newOwner, address wallet) external onlyWallet {
        if(!usersWallets[newOwner][wallet]) revert MultisigFactory__NotOwner();
        usersWallets[newOwner][wallet] = false;
    }

    //getters
    function numberOfWallets() public view returns(uint256) {
        return wallets.length;
    }

    function getWallets() public view returns(MultisigWallet[] memory) {
        return wallets;
    }

    function getWalletByIndex(uint256 _walletIndex) 
        public 
        view 
        returns(
            address walletAddress,
            uint256 signaturesRequired,
            uint256 walletBalance
        ) 
    {
        MultisigWallet wallet = wallets[_walletIndex];
        return(
            address(wallet),
            wallet.signaturesRequired(),
            address(wallet).balance
        );
    }

    function isUserOwner(address user, address wallet) public view returns(bool) {
        return usersWallets[user][wallet];
    }

}