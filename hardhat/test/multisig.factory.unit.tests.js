const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Multisig Factory", function () {
    async function basicFactoryDeploymentFixture() {
        const [deployer, user1, user2, user3] = await ethers.getSigners();
        const MultisigFactory = await ethers.getContractFactory("MultisigFactory");
        const factory = await MultisigFactory.deploy();
        await factory.deployed();
        return { factory, deployer, user1, user2, user3 };
    }

    async function createNewWalletFixture() {
        const [deployer, user1, user2, user3] = await ethers.getSigners();
        const name = "wallet1";
        const owners = [deployer.address, user1.address, user2.address];
        const signatures = 2;
        const amount = ethers.utils.parseEther("1");

        const MultisigFactory = await ethers.getContractFactory("MultisigFactory");
        const factory = await MultisigFactory.deploy();
        await factory.deployed();
        await factory.createNewWallet(name, owners, signatures, { value: amount});

        const wallets = await factory.getWallets();
        const wallet1 = await ethers.getContractAt("MultisigWallet", wallets[0]);

        return { factory, wallet1, deployer, user1, user2, user3, name };
    }

    async function proposeTxsFixture() {
        const { factory, wallet1, deployer, user1, user2, user3 } = await loadFixture(createNewWalletFixture);
        const transferTxIndex = await wallet1.proposedTxIndex();
        const transferTxAmount = ethers.utils.parseEther("0.5");
        const transferTxData = ethers.utils.formatBytes32String("transferFunds");
        const transferTxHash = await wallet1.getTransactionHash(transferTxIndex, user3.address, transferTxAmount, transferTxData);
        const transferTx = await wallet1.proposeTransaction(user3.address, transferTxAmount, transferTxData);
        //emulate data storage of backend
        const transferTxBackendStorage = {
            contractAddress: wallet1.address,
            proposedTxIndex: transferTxIndex,
            to: user3.address,
            value: transferTxAmount,
            data: transferTxData,
            hash: transferTxHash,
            signatures: []
        }
        const addOwnerTxIndex = await wallet1.proposedTxIndex();
        const addOwnerTxAmount = 0;
        const addOwnerTxData = await wallet1.interface.encodeFunctionData("addOwner", [user3.address, 3]);
        const addOwnerTxHash = await wallet1.getTransactionHash(addOwnerTxIndex, wallet1.address, addOwnerTxAmount, addOwnerTxData);
        const addOwnerTx = await wallet1.proposeTransaction(wallet1.address, addOwnerTxAmount, addOwnerTxData);
        const addOwnerTxBackendStorage = {
            contractAddress: wallet1.address,
            proposedTxIndex: addOwnerTxIndex,
            to: wallet1.address,
            value: addOwnerTxAmount,
            data: addOwnerTxData,
            hash: addOwnerTxHash,
            signatures: []
        }

        return { factory, wallet1, deployer, user1, user2, user3, 
            transferTx, addOwnerTx, transferTxBackendStorage, addOwnerTxBackendStorage };
    }

    async function validateWith2Sigs(txObject) {
        const { wallet1, deployer, user1 } = await loadFixture(proposeTxsFixture);
        const signatures = [];
        const deployerSignature = await deployer.provider.send(
            "personal_sign", 
            [txObject.hash, deployer.address]
        );
        signatures.push(deployerSignature);
        txObject.signatures = signatures;
        const user1Signature = await user1.provider.send(
            "personal_sign", 
            [txObject.hash, user1.address]
        );
        signatures.push(user1Signature);
        txObject.signatures = signatures;
        const signaturesToSort = [];
        for(const i in signatures) {
            const recover = await wallet1.recover(txObject.hash, signatures[i])
            signaturesToSort.push({ signature: signatures[i], signer: recover})
        };
        signaturesToSort.sort((a,b) => {
            return ethers.BigNumber.from(a.signer).sub(ethers.BigNumber.from(b.signer))
        });
        const sortedSignatures = [];
        for(const i in signaturesToSort) {
            sortedSignatures.push(signaturesToSort[i].signature)
        };
        txObject.signatures = sortedSignatures;
        return txObject;
    }

    async function createNewBackendTxObject(contractObject, txTo, txAmount, functionString, argsArray) {
        const newTxIndex = await contractObject.proposedTxIndex();
        const newTxAmount = txAmount;
        const newTxData = await contractObject.interface.encodeFunctionData(functionString, argsArray);
        const newTxHash = await contractObject.getTransactionHash(newTxIndex, contractObject.address, newTxAmount, newTxData);
        await contractObject.proposeTransaction(contractObject.address, newTxAmount, newTxData);
        const newTxObject = {
            contractAddress: contractObject.address,
            proposedTxIndex: newTxIndex,
            to: txTo,
            value: newTxAmount,
            data: newTxData,
            hash: newTxHash,
            signatures: []
        }
        return newTxObject
    }

    describe("Creating new multisig wallets", function () {
        it("should create a new multisig wallet", async function () {
            const { factory, wallet1 } = await loadFixture(createNewWalletFixture);
            const newWallet = await factory.getWalletByIndex(0);
            expect(await factory.walletExists(newWallet.walletAddress)).to.equal(true);
            expect(newWallet.signaturesRequired.toString()).to.equal("2");
            expect(newWallet.walletAddress).to.equal(wallet1.address);
        })
        it("should revert for too many signatures required", async function () {
            const { factory, deployer, user1 } = await loadFixture(basicFactoryDeploymentFixture);
            const name = "test";
            const signatures = 3;
            const owners = [deployer.address, user1.address];
            await expect(factory.createNewWallet(name, owners, signatures))
                .to.be.reverted;
        })
        it("should revert if zero address is passed as owner", async function () {
            const { factory, deployer, user1 } = await loadFixture(basicFactoryDeploymentFixture);
            const zeroAddress = '0x0000000000000000000000000000000000000000';
            const name = "test";
            const signatures = 2;
            const owners = [deployer.address, user1.address, zeroAddress];
            await expect(factory.createNewWallet(name, owners, signatures))
                .to.be.reverted;
        })
        it("should revert for duplicate addresses", async function () {
            const { factory, deployer, user1 } = await loadFixture(basicFactoryDeploymentFixture);
            const name = "test";
            const signatures = 2;
            const owners = [deployer.address, user1.address, deployer.address];
            await expect(factory.createNewWallet(name, owners, signatures))
                .to.be.reverted;
        })
        it("should set the name, owners, and signatures needed", async function () {
            const { wallet1, deployer, user1, user2, user3, name  } = await loadFixture(createNewWalletFixture);
            expect(await wallet1.getName()).to.equal(name)
            expect(await wallet1.isOwner(deployer.address)).to.equal(true);
            expect(await wallet1.isOwner(user1.address)).to.equal(true);
            expect(await wallet1.isOwner(user2.address)).to.equal(true);
            expect(await wallet1.isOwner(user3.address)).to.equal(false);
            expect(await wallet1.signaturesRequired()).to.equal("2");
            const owners = await wallet1.getOwners();
            expect(owners[0]).to.equal(deployer.address);
            expect(owners[1]).to.equal(user1.address)
            expect(owners[2]).to.equal(user2.address)
        })
        it("should set owners correctly in factory usersWallets mapping", async function () {
            const { factory, wallet1, deployer, user1, user2, user3 } = await loadFixture(createNewWalletFixture);
            expect(await factory.usersWallets(deployer.address, wallet1.address)).to.equal(true);
            expect(await factory.usersWallets(user1.address, wallet1.address)).to.equal(true);
            expect(await factory.usersWallets(user2.address, wallet1.address)).to.equal(true);
            expect(await factory.usersWallets(user3.address, wallet1.address)).to.equal(false);
        })
        it("should ensure all wallets have unique addresses", async function () {
            const { factory, wallet1, deployer, user1, user2 } = await loadFixture(createNewWalletFixture);
            // create a second wallet with exactly the same name, users and sigs
            const name = "wallet1";
            const owners = [deployer.address, user1.address, user2.address];
            const signatures = 2;
            const amount = ethers.utils.parseEther("1");
            await factory.createNewWallet(name, owners, signatures, { value: amount});
            const wallets = await factory.getWallets();
            const wallet2 = await ethers.getContractAt("MultisigWallet", wallets[1]);
            expect(wallet1.address).to.not.equal(wallet2.address);
        })
        it("should be able to predict new wallet addresses", async function () {
            const { factory, deployer, user1, user2 } = await loadFixture(createNewWalletFixture);
            const currentWalletIndex = await factory.numberOfWallets();
            const name = "wallet2";
            const owners = [deployer.address, user1.address, user2.address];
            const signatures = 2;
            const amount = ethers.utils.parseEther("1");
            const computedAddress = await factory.computedAddress(name, owners, signatures, currentWalletIndex);
            await factory.createNewWallet(name, owners, signatures, { value: amount});
            const wallets = await factory.getWallets();
            const wallet2 = await ethers.getContractAt("MultisigWallet", wallets[1]);
            expect(computedAddress).to.equal(wallet2.address);
        })
    })

    describe("Receiving deposits", function () {
        it("should receive ether and emit the Deposit event", async function () {
            const { wallet1, deployer } = await loadFixture(createNewWalletFixture);
            const balanceBefore = await ethers.provider.getBalance(wallet1.address);
            const amount = ethers.utils.parseEther("1.0");
            await expect(deployer.sendTransaction({
                to: wallet1.address,
                value: amount
                })).to.emit(wallet1, "DepositReceived")
                .withArgs(deployer.address, amount, amount.add(balanceBefore));
        })
    })

    describe("Signing and recovering signatures", function () {
        it("should recover signatures", async function () {
            const { wallet1, deployer, user1 } = await loadFixture(createNewWalletFixture);
            const nonce = 1;
            const value = ethers.utils.parseEther("666")
            const calldata = "0x00"
            const hash = await wallet1.getTransactionHash(nonce, user1.address, value, calldata);
            const signature = await deployer.provider.send("personal_sign", [hash, deployer.address]);
            const recoveredSig = await wallet1.recover(hash, signature);
            expect(recoveredSig).to.equal(deployer.address)
        })
    })

    describe("Proposing transactions", function () {
        it("should allow owners to propose transactions", async function () {
            const { wallet1, deployer, user3 } = await loadFixture(createNewWalletFixture);
            const proposalIndexBefore = await wallet1.proposedTxIndex();
            expect(proposalIndexBefore).to.equal(0);
            const amount = ethers.utils.parseEther("0.5");
            const data = ethers.utils.formatBytes32String("transferFunds");
            const proposalHash = await wallet1.getTransactionHash(proposalIndexBefore, user3.address, amount, data)
            await expect(wallet1.proposeTransaction(user3.address, amount, data))
                .to.emit(wallet1, "TransactionProposed")
                .withArgs(
                    deployer.address,
                    user3.address,
                    amount,
                    data,
                    proposalIndexBefore,
                    proposalHash
                );
            const proposalIndexAfter = await wallet1.proposedTxIndex();
            expect(proposalIndexAfter).to.equal(proposalIndexBefore.add(1));
        })
        it("should only allow owners to propose transactions", async function () {
            const { wallet1, user3 } = await loadFixture(createNewWalletFixture);
            const amount = ethers.utils.parseEther("0.5");
            const data = ethers.utils.formatBytes32String("transferFunds");
            await expect(wallet1.connect(user3).proposeTransaction(user3.address, amount, data))
                .to.be.revertedWithCustomError(wallet1, "MultisigWallet__NotOwner");
        })
    })

    describe("Executing transactions", function () {
        it("should allow owners to transfer funds with enough valid signatures", async function () {
            const { wallet1, deployer, user1, user3, transferTxBackendStorage} = await loadFixture(proposeTxsFixture);
            const user3BalanceBeforeTransfer = await wallet1.provider.getBalance(user3.address);
            const nonceBefore = await wallet1.nonce();
            //now we emulate both front end and back end behavior
            const signatures = [];
            //deployer signs and info is pushed to storage
            const deployerSignature = await deployer.provider.send(
                "personal_sign", 
                [transferTxBackendStorage.hash, deployer.address]
            );
            signatures.push(deployerSignature);
            //backend object is updated
            transferTxBackendStorage.signatures = signatures;
            //user1 signs and info is pushed to storage
            const user1Signature = await user1.provider.send(
                "personal_sign", 
                [transferTxBackendStorage.hash, user1.address]
            );
            signatures.push(user1Signature);
            //backend object is updated again
            transferTxBackendStorage.signatures = signatures;
            // when owner calls executeTransaction - frontend sorts signatures for contract to verify
            const signaturesToSort = [];
            for(const i in signatures) {
                const recover = await wallet1.recover(transferTxBackendStorage.hash, signatures[i])
                signaturesToSort.push({ signature: signatures[i], signer: recover})
            };
            signaturesToSort.sort((a,b) => {
                return ethers.BigNumber.from(a.signer).sub(ethers.BigNumber.from(b.signer))
            });
            const sortedSignatures = [];
            for(const i in signaturesToSort) {
                sortedSignatures.push(signaturesToSort[i].signature)
            };
            //backend object is updated one final time before calling function
            transferTxBackendStorage.signatures = sortedSignatures;
            //finally, executeTransaction is called
            await expect(wallet1.executeTransaction(
                transferTxBackendStorage.proposedTxIndex,
                transferTxBackendStorage.to,
                transferTxBackendStorage.value,
                transferTxBackendStorage.data,
                transferTxBackendStorage.signatures
            )).to.emit(wallet1, "TransactionExecuted")  
            const user3BalanceAfterTransfer = await wallet1.provider.getBalance(user3.address);
            const nonceAfter = await wallet1.nonce();
            expect(user3BalanceAfterTransfer).to.equal(user3BalanceBeforeTransfer.add(transferTxBackendStorage.value));
            expect(nonceAfter).to.equal(nonceBefore.add(1));
        })
        it("should only allow owners to execute transactions", async function () {
            const { wallet1, user3, transferTxBackendStorage } = await loadFixture(proposeTxsFixture);
            const tx = await validateWith2Sigs(transferTxBackendStorage);
            await expect(wallet1.connect(user3).executeTransaction(
                tx.proposedTxIndex,
                tx.to,
                tx.value,
                tx.data,
                tx.signatures
            )).to.be.revertedWithCustomError(wallet1, "MultisigWallet__NotOwner");
        })
        it("should revert for duplicate signatures", async function () {
            const { wallet1, deployer, user1, transferTxBackendStorage} = await loadFixture(proposeTxsFixture);
            const signatures = [];
            const deployerSignature = await deployer.provider.send(
                "personal_sign", 
                [transferTxBackendStorage.hash, deployer.address]
            );
            signatures.push(deployerSignature);
            transferTxBackendStorage.signatures = signatures;
            const user1Signature = await user1.provider.send(
                "personal_sign", 
                [transferTxBackendStorage.hash, user1.address]
            );
            signatures.push(user1Signature);
            transferTxBackendStorage.signatures = signatures;
            const duplicateDeployerSignature = await deployer.provider.send(
                "personal_sign", 
                [transferTxBackendStorage.hash, deployer.address]
            );
            signatures.push(duplicateDeployerSignature);
            transferTxBackendStorage.signatures = signatures;
            const signaturesToSort = [];
            for(const i in signatures) {
                const recover = await wallet1.recover(transferTxBackendStorage.hash, signatures[i])
                signaturesToSort.push({ signature: signatures[i], signer: recover})
            };
            signaturesToSort.sort((a,b) => {
                return ethers.BigNumber.from(a.signer).sub(ethers.BigNumber.from(b.signer))
            });
            const sortedSignatures = [];
            for(const i in signaturesToSort) {
                sortedSignatures.push(signaturesToSort[i].signature)
            };
            transferTxBackendStorage.signatures = sortedSignatures;
            await expect(wallet1.executeTransaction(
                transferTxBackendStorage.proposedTxIndex,
                transferTxBackendStorage.to,
                transferTxBackendStorage.value,
                transferTxBackendStorage.data,
                transferTxBackendStorage.signatures
            )).to.be.revertedWithCustomError(wallet1, "MultisigWallet__DuplicateOrUnorderedSignatures");
        })
        it("should revert for insufficient signatures", async function () {
            const { wallet1, deployer, transferTxBackendStorage} = await loadFixture(proposeTxsFixture);
            const signatures = [];
            const deployerSignature = await deployer.provider.send(
                "personal_sign", 
                [transferTxBackendStorage.hash, deployer.address]
            );
            signatures.push(deployerSignature);
            transferTxBackendStorage.signatures = signatures;
            const signaturesToSort = [];
            for(const i in signatures) {
                const recover = await wallet1.recover(transferTxBackendStorage.hash, signatures[i])
                signaturesToSort.push({ signature: signatures[i], signer: recover})
            };
            signaturesToSort.sort((a,b) => {
                return ethers.BigNumber.from(a.signer).sub(ethers.BigNumber.from(b.signer))
            });
            const sortedSignatures = [];
            for(const i in signaturesToSort) {
                sortedSignatures.push(signaturesToSort[i].signature)
            };
            transferTxBackendStorage.signatures = sortedSignatures;
            await expect(wallet1.executeTransaction(
                transferTxBackendStorage.proposedTxIndex,
                transferTxBackendStorage.to,
                transferTxBackendStorage.value,
                transferTxBackendStorage.data,
                transferTxBackendStorage.signatures
            )).to.be.revertedWithCustomError(wallet1, "MultisigWallet__InsufficientSignatures");
        })
        it("should allow additional owners to be added", async function () {
            const { factory, wallet1, user3, addOwnerTxBackendStorage } = await loadFixture(proposeTxsFixture);
            expect(await factory.usersWallets(user3.address, wallet1.address)).to.equal(false);
            expect(await wallet1.isOwner(user3.address)).to.equal(false);
            expect(await wallet1.signaturesRequired()).to.equal(2);
            const ownersBefore = await wallet1.getOwners();
            const numberOwnersBefore = ownersBefore.length;
            const tx = await validateWith2Sigs(addOwnerTxBackendStorage);
            await expect(wallet1.executeTransaction(
                tx.proposedTxIndex,
                tx.to,
                tx.value,
                tx.data,
                tx.signatures
            )).to.emit(wallet1, "TransactionExecuted");
            expect(await wallet1.isOwner(user3.address)).to.equal(true);
            expect(await wallet1.signaturesRequired()).to.equal(3);
            const ownersAfter = await wallet1.getOwners()
            const numberOfOwnersAfter = ownersAfter.length
            expect(numberOfOwnersAfter).to.equal(numberOwnersBefore + 1);
            expect(await factory.usersWallets(user3.address, wallet1.address)).to.equal(true);
            expect(ownersAfter[3]).to.equal(user3.address);
        })
        it("should revert if zero address is added as owner", async function () {
            const { wallet1 } = await loadFixture(proposeTxsFixture);
            const zeroAddress = '0x0000000000000000000000000000000000000000';
            const functionName = "addOwner";
            const args = [zeroAddress, 3];
            const newTxObject = await createNewBackendTxObject(wallet1, wallet1.address, 0, functionName, args)
            const tx = await validateWith2Sigs(newTxObject);
            await expect(wallet1.executeTransaction(
                tx.proposedTxIndex,
                tx.to,
                tx.value,
                tx.data,
                tx.signatures
            )).to.be.revertedWithCustomError(wallet1, "MultisigWallet__TransactionFailed");
        })
        it("should revert if duplicate owner is added", async function () {
            const { wallet1, deployer } = await loadFixture(proposeTxsFixture);
            const functionName = "addOwner";
            const args = [deployer.address, 3];
            const newTxObject = await createNewBackendTxObject(wallet1, wallet1.address, 0, functionName, args)
            const tx = await validateWith2Sigs(newTxObject);
            await expect(wallet1.executeTransaction(
                tx.proposedTxIndex,
                tx.to,
                tx.value,
                tx.data,
                tx.signatures
            )).to.be.revertedWithCustomError(wallet1, "MultisigWallet__TransactionFailed");
        })
        it("reverts for invalid number of signatures required", async function () {
            const { wallet1, user3 } = await loadFixture(proposeTxsFixture);
            const functionName1 = "addOwner";
            const args1 = [user3.address, 5];
            const newTxObject1 = await createNewBackendTxObject(wallet1, wallet1.address, 0, functionName1, args1);
            const tx1 = await validateWith2Sigs(newTxObject1);
            await expect(wallet1.executeTransaction(
                tx1.proposedTxIndex,
                tx1.to,
                tx1.value,
                tx1.data,
                tx1.signatures
            )).to.be.revertedWithCustomError(wallet1, "MultisigWallet__TransactionFailed");
            const functionName2 = "addOwner";
            const args2 = [user3.address, 0];
            const newTxObject2 = await createNewBackendTxObject(wallet1, wallet1.address, 0, functionName2, args2);
            const tx2 = await validateWith2Sigs(newTxObject2);
            await expect(wallet1.executeTransaction(
                tx2.proposedTxIndex,
                tx2.to,
                tx2.value,
                tx2.data,
                tx2.signatures
            )).to.be.revertedWithCustomError(wallet1, "MultisigWallet__TransactionFailed");
        })
        it("should allow owners to be removed", async function () {
            const { factory, wallet1, user2 } = await loadFixture(proposeTxsFixture);
            expect(await factory.usersWallets(user2.address, wallet1.address)).to.equal(true);
            expect(await wallet1.isOwner(user2.address)).to.equal(true);
            const ownersBefore = await wallet1.getOwners();
            const numberOfOwnersBefore = ownersBefore.length;
            const functionName = "removeOwner";
            const args = [user2.address, 2]
            const newTxObject = await createNewBackendTxObject(wallet1, wallet1.address, 0, functionName, args)
            const tx = await validateWith2Sigs(newTxObject);
            await wallet1.executeTransaction(
                tx.proposedTxIndex,
                tx.to,
                tx.value,
                tx.data,
                tx.signatures
            );
            expect(await wallet1.isOwner(user2.address)).to.equal(false);
            const ownersAfter = await wallet1.getOwners();
            const numberOfOwnersAfter = ownersAfter.length;
            expect(numberOfOwnersAfter).to.equal(numberOfOwnersBefore - 1);
            expect(await factory.usersWallets(user2.address, wallet1.address)).to.equal(false);
        })
        it("should revert if attempting to remove non-owner", async function () {
            const { wallet1, user3 } = await loadFixture(proposeTxsFixture);
            expect(await wallet1.isOwner(user3.address)).to.equal(false);
            const functionName = "removeOwner";
            const args = [user3.address, 2];
            const newTxObject = await createNewBackendTxObject(wallet1, wallet1.address, 0, functionName, args)
            const tx = await validateWith2Sigs(newTxObject);
            await expect(wallet1.executeTransaction(
                tx.proposedTxIndex,
                tx.to,
                tx.value,
                tx.data,
                tx.signatures
            )).to.be.revertedWithCustomError(wallet1, "MultisigWallet__TransactionFailed");
        })
        it("should revert transactions that have already been executed", async function () {
            const { wallet1, transferTxBackendStorage } = await loadFixture(proposeTxsFixture);
            await validateWith2Sigs(transferTxBackendStorage)
            await expect(wallet1.executeTransaction(
                transferTxBackendStorage.proposedTxIndex,
                transferTxBackendStorage.to,
                transferTxBackendStorage.value,
                transferTxBackendStorage.data,
                transferTxBackendStorage.signatures
            )).to.emit(wallet1, "TransactionExecuted") 
            await expect(wallet1.executeTransaction(
                transferTxBackendStorage.proposedTxIndex,
                transferTxBackendStorage.to,
                transferTxBackendStorage.value,
                transferTxBackendStorage.data,
                transferTxBackendStorage.signatures
            )).to.be.revertedWithCustomError(wallet1, "MultisigWallet__TransactionAlreadyExecuted")
        })
    })

    describe("OnlySelf function calls", function () {
        it("should not allow onlySelf functions to be called directly", async function () {
            const { wallet1, user1, user3 } = await loadFixture(proposeTxsFixture);
            await expect(wallet1.addOwner(user3.address, 4))
                .to.be.revertedWithCustomError(wallet1, "MultisigWallet__NotSelf");
            await expect(wallet1.removeOwner(user1.address, 1))
                .to.be.revertedWithCustomError(wallet1, "MultisigWallet__NotSelf");
        })
    })

})