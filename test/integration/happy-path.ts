import { ethers, network } from 'hardhat'
import { Signer } from 'ethers'
import { expect } from 'chai'
import { deployStonks } from '../../scripts/deployments/stonks'
import {
  ChainLinkTokenConverter,
  Stonks,
  Order,
} from '../../typechain-types'
import { mainnet } from '../../utils/contracts'
import { getPlaceOrderData } from '../../utils/get-events'
import { isClose } from '../../utils/assert'
import { fillUpBalance } from '../../utils/fill-up-balance'

describe('Happy path', function () {
  let signer: Signer
  let subject: Stonks
  let subjectTokenConverter: ChainLinkTokenConverter
  let snapshotId: string

  this.beforeAll(async function () {
    snapshotId = await network.provider.send('evm_snapshot')
    signer = (await ethers.getSigners())[0]

    const { stonks, tokenConverter } = await deployStonks({
      stonksParams: {
        tokenFrom: mainnet.STETH,
        tokenTo: mainnet.DAI,
        operator: await signer.getAddress(),
        marginInBps: 100,
        priceToleranceInBps: 100,
      },
      tokenConverterParams: {
        priceFeedRegistry: mainnet.CHAINLINK_PRICE_FEED_REGISTRY,
        allowedTokensToSell: [mainnet.STETH],
        allowedStableTokensToBuy: [mainnet.DAI],
      },
    })

    subject = stonks
    subjectTokenConverter = tokenConverter
  })

  describe('order creation', async function () {
    const value = ethers.parseEther('1')
    let order: Order

    this.beforeAll(async () => {
      fillUpBalance(mainnet.TREASURY, value)
    })

    it('should fill up stonks contract', async () => {
      await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [mainnet.TREASURY],
      })
      const treasurySigner = await ethers.provider.getSigner(mainnet.TREASURY)
      const stethTreasury = await ethers.getContractAt(
        'IERC20',
        mainnet.STETH,
        treasurySigner
      )
      const subjectAddress = await subject.getAddress()

      const transferTx = await stethTreasury.transfer(subjectAddress, value)
      await transferTx.wait()

      expect(isClose(await stethTreasury.balanceOf(subjectAddress), value)).to
        .be.true
    })

    it('should place order', async () => {
      const orderTx = await subject.placeOrder()
      const orderReceipt = await orderTx.wait()

      if (!orderReceipt) throw new Error('No order receipt')

      const { address } = getPlaceOrderData(orderReceipt)

      const steth = await ethers.getContractAt('IERC20', mainnet.STETH)
      order = await ethers.getContractAt('Order', address)

      expect(isClose(await steth.balanceOf(address), value)).to.be.true
      expect(isClose(await steth.balanceOf(subject.getAddress()), BigInt(0))).to
        .be.true
    })

    it('settlement should check hash', async () => {})

    it('should not be possible to cancel order due to expiration time', () => {
      expect(order.cancel()).to.be.revertedWith('Order: order is expired')
    })

    it('should be possible to cancel order after expiration time', async () => {
      const localSnapshotId = await network.provider.send('evm_snapshot')

      await network.provider.send('evm_increaseTime', [60 * 60 * 24 * 7])
      await order.cancel()

      const steth = await ethers.getContractAt('IERC20', mainnet.STETH)
      expect(
        isClose(await steth.balanceOf(await order.getAddress()), BigInt(0))
      ).to.be.true

      await network.provider.send('evm_revert', [localSnapshotId])
    })

    it('settlement should pull off assets from order contract', async () => {
      await network.provider.send('hardhat_setCode', [
        mainnet.VAULT_RELAYER,
        '0x',
      ])
      await fillUpBalance(mainnet.VAULT_RELAYER, ethers.parseEther('1'))
      await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [mainnet.VAULT_RELAYER],
      })
      const relayerSigner = await ethers.provider.getSigner(
        mainnet.VAULT_RELAYER
      )
      const stethRelayer = await ethers.getContractAt(
        'IERC20',
        mainnet.STETH,
        relayerSigner
      )
      const orderAddress = await order.getAddress()

      await stethRelayer.transferFrom(
        orderAddress,
        mainnet.VAULT_RELAYER,
        await stethRelayer.balanceOf(await order.getAddress())
      )

      expect(isClose(await stethRelayer.balanceOf(orderAddress), BigInt(0))).to
        .be.true
    })
  })

  this.afterAll(async () => {
    await network.provider.send('evm_revert', [snapshotId])
  })
})
