const { network, ethers } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer, user1 } = await getNamedAccounts()

    log("----------------------------------------------------")
    log("Factory is now creating test wallet...")
    // const factory = await ethers.getContract("MultisigFactory", deployer);
    const factoryDeployed = await deployments.get("MultisigFactory");
    const factory = await ethers.getContractAt(factoryDeployed.abi, factoryDeployed.address)
    // console.log("deployer addr: ", deployer)
    // console.log("user1 addr: ", user1)
    // console.log(factory)
    const name = "TestWallet"
    const owners = [deployer, user1]
    const signatures = 2
    const amount = ethers.utils.parseEther("1")
    await factory.createNewWallet(name, owners, signatures, { value: amount})
    // const numberOfWallets = await factory.numberOfWallets()
    // console.log(numberOfWallets)
    const allWallets = await factory.getWallets()
    console.log("all wallets", allWallets)
    // log("Test wallet deployed at ", allWallets[0])
    log("----------------------------------------------------")
}

module.exports.tags = ["all", "TestWallet"]