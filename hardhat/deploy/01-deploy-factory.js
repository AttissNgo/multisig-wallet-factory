const { network } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")
const {
    frontEndContractsFile,
    frontEndAbiLocation,
} = require("../helper-hardhat-config")
require("dotenv").config()
const fs = require("fs")


module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const arguments = []

    log("----------------------------------------------------")
    log("Deploying MultisigFactory contract...")
    const multisigFactory = await deploy("MultisigFactory", {
        from: deployer,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // console.log(multisigFactory)

    // Verify the deployment
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(multisigFactory.address, arguments)
        if (process.env.UPDATE_FRONT_END) {
            console.log("Writing to front end...");
            await updateContractAddresses();
            await updateAbi();
            console.log("Front end written!");
        }

    }

    log("----------------------------------------------------")
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
}

async function updateContractAddresses() {
    const chainId = network.config.chainId.toString()
    const multisigFactory = await deployments.get("MultisigFactory");
    const contractAddresses = JSON.parse(fs.readFileSync(frontEndContractsFile, "utf8"))
    if (chainId in contractAddresses) {
        if (!contractAddresses[chainId]["MultisigFactory"].includes(multisigFactory.address)) {
            contractAddresses[chainId]["MultisigFactory"].push(multisigFactory.address)
        } 
    } else {
        contractAddresses[chainId] = { 
            MultisigFactory: [multisigFactory.address], 
        }
    }
    fs.writeFileSync(frontEndContractsFile, JSON.stringify(contractAddresses))
}

module.exports.tags = ["all", "MultisigFactory"]