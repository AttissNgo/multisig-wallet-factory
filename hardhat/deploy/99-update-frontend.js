const {
    frontEndContractsFile,
    frontEndAbiLocation,
} = require("../helper-hardhat-config")
require("dotenv").config()
const fs = require("fs")
const { network, ethers, deployments } = require("hardhat")

module.exports = async ({ deployments }) => {
    if (process.env.UPDATE_FRONT_END) {
        console.log("Writing to front end...");
        await updateContractAddresses();
        await updateAbi();
        console.log("Front end written!");
    }
}

async function updateAbi() {
    //write factory ABI
    const multisigFactory = await deployments.get("MultisigFactory");
    const factory = await ethers.getContractAt(
        multisigFactory.abi,
        multisigFactory.address
      );
    fs.writeFileSync(
        `${frontEndAbiLocation}MultisigFactory.json`,
        factory.interface.format(ethers.utils.FormatTypes.json)
    );
    const dummyWallet = await deployments.get("MultisigWallet")
    const wallet = await ethers.getContractAt(
        dummyWallet.abi,
        dummyWallet.address
    )
    fs.writeFileSync(
        `${frontEndAbiLocation}MultisigWallet.json`,
        wallet.interface.format(ethers.utils.FormatTypes.json)
    )
}

async function updateContractAddresses() {
    //we only write Factory address... frontend will fetch wallet addresses from chain
    const chainId = network.config.chainId.toString()
    const multisigFactory = await deployments.get("MultisigFactory");
    // const someOtherContract = await deployments.get("SomeOtherContract")
    const contractAddresses = JSON.parse(fs.readFileSync(frontEndContractsFile, "utf8"))
    if (chainId in contractAddresses) {
        if (!contractAddresses[chainId]["MultisigFactory"].includes(multisigFactory.address)) {
            contractAddresses[chainId]["MultisigFactory"].push(multisigFactory.address)
        } 
        // else if (!contractAddresses[chainId]["SomeOtherContract"].includes(someOtherContract.address)) {
        //     contractAddresses[chainId]["SomeOtherContract"].push(someOtherContract.address)
        // }
    } else {
        contractAddresses[chainId] = { 
            MultisigFactory: [multisigFactory.address], 
            // SomeOtherContract: [someOtherContract.address] 
        }
    }
    fs.writeFileSync(frontEndContractsFile, JSON.stringify(contractAddresses))
}

module.exports.tags = ["all", "frontend"]