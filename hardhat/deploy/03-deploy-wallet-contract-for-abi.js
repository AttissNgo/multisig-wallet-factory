const { network, ethers } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    log("----------------------------------------------------")
    log("Dummy wallet is being deployed only to extract ABI. This will not be connected with the Factory...")
    const factoryDeployed = await deployments.get("MultisigFactory");
    const arguments = [
        "dummyWallet",
        [deployer],
        1,
        factoryDeployed.address
    ]
    const dummyWallet = await deploy("MultisigWallet", {
        from: deployer,
        args: arguments,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // console.log("dummy: ", dummyWallet)
    
    log("----------------------------------------------------")
}

module.exports.tags = ["all"]